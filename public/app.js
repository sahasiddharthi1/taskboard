const state = {
  token: localStorage.getItem("tb_token") || null,
  username: localStorage.getItem("tb_username") || null,
  filter: "all",
  dayFilter: null,
  tasks: [],
};

const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 2600);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(iso) {
  const target = new Date(iso + "T00:00:00");
  const today = new Date(todayStr() + "T00:00:00");
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff === -1) return "Tomorrow";
  const opts = { weekday: "short", month: "short", day: "numeric" };
  return target.toLocaleDateString(undefined, opts);
}

function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return fetch(path, { ...opts, headers }).then(async (res) => {
    if (res.status === 401 && path.startsWith("/api/")) {
      logout();
      throw new Error("Session expired, please log in again");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  });
}

/* ---------------- Auth UI ---------------- */
const authEl = $("#auth");
const appEl = $("#app");
let authTab = "login";

function switchTab(tab) {
  authTab = tab;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  $("#auth-submit").textContent = tab === "login" ? "Login" : "Create account";
  $("#password").autocomplete = tab === "login" ? "current-password" : "new-password";
}

document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => switchTab(t.dataset.tab))
);

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = $("#username").value.trim();
  const password = $("#password").value;
  const errorEl = $("#auth-error");
  errorEl.textContent = "";
  try {
    const body = await api(`/api/auth/${authTab}`, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    state.token = body.token;
    state.username = body.user.username;
    localStorage.setItem("tb_token", body.token);
    localStorage.setItem("tb_username", body.user.username);
    enterApp();
  } catch (err) {
    errorEl.textContent = err.message;
  }
});

/* ---------------- App load ---------------- */
async function enterApp() {
  authEl.classList.add("hidden");
  appEl.classList.remove("hidden");
  $("#user-name").textContent = state.username;
  $("#avatar").textContent = state.username[0] || "#";
  $("#task-input").focus();
  await loadTasks();
}

function logout() {
  state.token = null;
  state.username = null;
  localStorage.removeItem("tb_token");
  localStorage.removeItem("tb_username");
  appEl.classList.add("hidden");
  authEl.classList.remove("hidden");
}

$("#logout-btn").addEventListener("click", logout);

async function loadTasks() {
  const data = await api("/api/tasks");
  state.tasks = data.tasks;
  render();
}

/* ---------------- Rendering ---------------- */
function visibleTasks() {
  let list = state.tasks;
  if (state.dayFilter) list = list.filter((t) => t.task_date === state.dayFilter);
  else if (state.filter === "pending") list = list.filter((t) => t.status === "pending");
  else if (state.filter === "done") list = list.filter((t) => t.status === "done");
  return list;
}

function datesOf(tasks) {
  const map = new Map();
  for (const t of tasks) {
    if (!map.has(t.task_date)) map.set(t.task_date, 0);
    map.set(t.task_date, map.get(t.task_date) + 1);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
}

function renderSidebar() {
  const days = datesOf(state.tasks);
  const list = $("#day-list");
  list.innerHTML = "";
  for (const [date, count] of days) {
    const btn = document.createElement("button");
    btn.className = "day-item" + (state.dayFilter === date ? " active" : "");
    btn.innerHTML = `<span>${fmtDate(date)}</span><span class="day-count">${count}</span>`;
    btn.onclick = () => {
      state.dayFilter = state.dayFilter === date ? null : date;
      state.filter = "all";
      document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
      render();
    };
    list.appendChild(btn);
  }
}

function renderHeader() {
  $("#channel-title").textContent = state.dayFilter ? `# ${fmtDate(state.dayFilter)}` : `# ${state.filter === "all" ? "all-tasks" : state.filter}`;
  const total = state.tasks.length;
  const done = state.tasks.filter((t) => t.status === "done").length;
  $("#channel-desc").textContent = `${total} total · ${done} done · nothing is ever deleted`;
}

function renderBoard() {
  const board = $("#board");
  const vis = visibleTasks();
  const empty = $("#empty-state");
  empty.style.display = vis.length ? "none" : "block";

  const groups = [];
  for (const t of vis) {
    let g = groups.find((x) => x.date === t.task_date);
    if (!g) {
      g = { date: t.task_date, tasks: [] };
      groups.push(g);
    }
    g.tasks.push(t);
  }

  board.querySelectorAll(".group").forEach((n) => n.remove());

  for (const g of groups) {
    const sub = document.createElement("div");
    sub.className = "group";
    const meta = `${fmtDate(g.date)} · ${g.tasks.length} task${g.tasks.length === 1 ? "" : "s"}`;
    sub.innerHTML = `
      <div class="group-header">
        <span class="group-date">${fmtDate(g.date)}</span>
        <span class="group-sub">${meta}</span>
      </div>
    `;
    for (const t of g.tasks) {
      sub.appendChild(taskNode(t));
    }
    board.appendChild(sub);
  }
}

function taskNode(task) {
  const node = document.createElement("div");
  node.className = "task " + task.status;
  const time = task.updated_at ? new Date(task.updated_at + "Z").toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
  node.innerHTML = `
    <div class="check" title="Toggle done">✓</div>
    <div class="task-space">
      <div class="task-title"></div>
      <div class="task-meta">
        <span class="status-pill ${task.status}">${task.status}</span>
        <span>${time || "no time"}</span>
      </div>
    </div>
    <button class="btn-icon" data-act="edit" title="Edit">✏️</button>
    <button class="btn-icon danger" data-act="delete" title="Delete forever">🗑️</button>
  `;
  node.querySelector(".task-title").textContent = task.title;
  node.querySelector(".check").addEventListener("click", () => toggleTask(task));
  node.querySelector('[data-act="edit"]').addEventListener("click", () => editTask(task));
  node.querySelector('[data-act="delete"]').addEventListener("click", () => deleteTask(task));
  return node;
}

function render() {
  renderSidebar();
  renderHeader();
  renderBoard();
}

/* ---------------- Actions ---------------- */
$("#add-btn").addEventListener("click", () => submitTask());
$("#task-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") submitTask();
});

async function submitTask() {
  const input = $("#task-input");
  const title = input.value.trim();
  if (!title) return;
  const btn = $("#add-btn");
  btn.disabled = true;
  try {
    await api("/api/tasks", { method: "POST", body: JSON.stringify({ title, date: todayStr() }) });
    input.value = "";
    await loadTasks();
    // jump to today's view
    state.dayFilter = todayStr();
    state.filter = "all";
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    render();
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    input.focus();
  }
}

async function toggleTask(task) {
  const next = task.status === "pending" ? "done" : "pending";
  await api(`/api/tasks/${task.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
  await loadTasks();
}

async function editTask(task) {
  const title = prompt("Edit task", task.title);
  if (!title || title.trim() === task.title) return;
  try {
    await api(`/api/tasks/${task.id}`, {
      method: "PATCH",
      body: JSON.stringify({ title: title.trim() }),
    });
    await loadTasks();
  } catch (err) {
    toast(err.message);
  }
}

async function deleteTask(task) {
  if (!confirm(`Delete "${task.title}" forever? This cannot be undone.`)) return;
  await api(`/api/tasks/${task.id}`, { method: "DELETE" });
  toast("Task deleted");
  await loadTasks();
}

document.querySelectorAll(".nav-item").forEach((n) =>
  n.addEventListener("click", () => {
    state.filter = n.dataset.filter;
    state.dayFilter = null;
    document.querySelectorAll(".nav-item").forEach((x) => x.classList.toggle("active", x === n));
    render();
  })
);

/* ---------------- Share / WhatsApp ---------------- */
$("#whatsapp-btn").addEventListener("click", async () => {
  const btn = $("#whatsapp-btn");
  btn.disabled = true;
  try {
    const { url } = await api("/api/share", { method: "POST" });
    const done = state.tasks.filter((t) => t.status === "done").length;
    const total = state.tasks.length;
    const msg =
      `*My tasks today* (${state.username})\n\n` +
      `${done}/${total} done\n` +
      `Track my progress here: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
    localStorage.setItem("tb_share_url", url);
    toast("Opening WhatsApp…");
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
  }
});

$("#copy-btn").addEventListener("click", async () => {
  try {
    let url = localStorage.getItem("tb_share_url");
    if (!url) {
      const res = await api("/api/share", { method: "POST" });
      url = res.url;
      localStorage.setItem("tb_share_url", url);
    }
    await navigator.clipboard.writeText(url);
    toast("Link copied!");
  } catch (err) {
    toast(err.message);
  }
});

/* ---------------- Boot ---------------- */
(async function boot() {
  if (state.token) {
    try {
      const { user } = await api("/api/auth/me");
      state.username = user.username;
      localStorage.setItem("tb_username", user.username);
      await enterApp();
    } catch {
      logout();
    }
  } else {
    switchTab("login");
    authEl.classList.remove("hidden");
  }
})();