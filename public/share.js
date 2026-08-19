const token = location.pathname.split("/").pop();
let tasks = [];
let filter = "all";

const $ = (sel) => document.querySelector(sel);

function fmtDate(iso) {
  const target = new Date(iso + "T00:00:00");
  const today = new Date(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}T00:00:00`);
  const diff = Math.round((today - target) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return target.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderDescription(description) {
  if (!description || !description.trim()) return "";
  const lines = description.split(/\r?\n/).map((l) => l.trimEnd());
  let html = '<div class="task-desc">';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[-*•]\s+/.test(line)) {
      html += `<div class="bullet">• ${escHtml(line.replace(/^[-*•]\s+/, ""))}</div>`;
    } else if (/^\d+[.)]\s+/.test(line)) {
      html += `<div class="bullet">${escHtml(line)}</div>`;
    } else {
      html += `<div class="para">${escHtml(line)}</div>`;
    }
  }
  html += "</div>";
  return html;
}

function render() {
  const board = $("#share-board");
  let vis = tasks;
  if (filter === "pending") vis = tasks.filter((t) => t.status === "pending");
  if (filter === "done") vis = tasks.filter((t) => t.status === "done");

  board.innerHTML = "";
  if (!vis.length) {
    board.innerHTML = '<div class="empty">No tasks to show.</div>';
    return;
  }

  const groups = [];
  for (const t of vis) {
    let g = groups.find((x) => x.date === t.task_date);
    if (!g) { g = { date: t.task_date, tasks: [] }; groups.push(g); }
    g.tasks.push(t);
  }
  groups.sort((a, b) => (a.date < b.date ? 1 : -1));

  for (const g of groups) {
    const wrap = document.createElement("div");
    wrap.className = "group";
    wrap.innerHTML = `
      <div class="group-header">
        <span class="group-date">${fmtDate(g.date)}</span>
        <span class="group-sub">${g.tasks.length} task${g.tasks.length === 1 ? "" : "s"}</span>
      </div>`;
    for (const t of g.tasks) {
      const node = document.createElement("div");
      node.className = "task " + t.status;
      node.innerHTML = `
        <div class="check">${t.status === "done" ? "✓" : ""}</div>
        <div class="task-space">
          <div class="task-title"></div>
          <div class="task-desc-holder"></div>
          <div class="task-meta"><span class="status-pill ${t.status}">${t.status}</span></div>
        </div>`;
      node.querySelector(".task-title").textContent = t.title;
      node.querySelector(".task-desc-holder").innerHTML = renderDescription(t.description);
      wrap.appendChild(node);
    }
    board.appendChild(wrap);
  }
}

document.querySelectorAll(".chip").forEach((c) =>
  c.addEventListener("click", () => {
    filter = c.dataset.f;
    document.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === c));
    render();
  })
);

(async function () {
  try {
    const res = await fetch(`/api/share/${token}`);
    if (!res.ok) throw new Error("bad link");
    const body = await res.json();
    if (!body.user || !Array.isArray(body.tasks)) throw new Error("bad link");
    tasks = body.tasks;
    $("#share-app").classList.remove("hidden");
    $("#share-title").textContent = `${body.user.username}'s task board`;
    $("#share-avatar").textContent = (body.user.username[0] || "#").toUpperCase();
    $("#share-sub").textContent = `Last updated ${new Date().toLocaleString()}`;
    render();
  } catch {
    $("#share-app").classList.add("hidden");
    $("#share-error").classList.remove("hidden");
  }
})();