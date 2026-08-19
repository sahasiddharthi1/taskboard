const path = require("path");
const express = require("express");
const bcrypt = require("bcryptjs");
const { authRequired, signToken } = require("./src/auth");
const db = require("./src/db");

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");

app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.static(path.join(__dirname, "public")));

function publicUser(user) {
  return { id: user.id, username: user.username, shareToken: user.share_token || null, createdAt: user.created_at };
}

app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------- Auth ----------
app.post("/api/auth/register", (req, res) => {
  const { username, password } = req.body || {};
  const name = (username || "").toString().trim();
  const pass = (password || "").toString();

  if (name.length < 3) return res.status(400).json({ error: "Username must be at least 3 characters" });
  if (pass.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

  if (db.findUserByUsername(name)) return res.status(409).json({ error: "Username already taken" });

  const hash = bcrypt.hashSync(pass, 10);
  const user = db.addUser(name, hash);
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = db.findUserByUsername((username || "").toString().trim());

  if (!user || !bcrypt.compareSync((password || "").toString(), user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  const user = db.findUserById(req.user.id);
  if (!user) return res.status(401).json({ error: "Account no longer exists" });
  res.json({ user: publicUser(user) });
});

// ---------- Tasks ----------
app.get("/api/tasks", authRequired, (req, res) => {
  const date = (req.query.date || "").toString().trim() || null;
  const status = (req.query.status || "all").toString().trim() || "all";
  res.json({ tasks: db.listTasks(req.user.id, date, status) });
});

app.post("/api/tasks", authRequired, (req, res) => {
  const { title, date, description } = req.body || {};
  const text = (title || "").toString().trim();
  if (!text) return res.status(400).json({ error: "Task title is required" });

  const today = new Date().toISOString().slice(0, 10);
  const taskDate = (date || today).toString().trim() || today;

  const task = db.createTask(req.user.id, text, taskDate, (description || "").toString());
  res.status(201).json({ task });
});

app.patch("/api/tasks/:id", authRequired, (req, res) => {
  const id = Number(req.params.id);
  const { title, status, date, description } = req.body || {};

  const existing = db.getTask(id, req.user.id);
  if (!existing) return res.status(404).json({ error: "Task not found" });

  const fields = {};
  if (title !== undefined) {
    const text = title.toString().trim();
    if (!text) return res.status(400).json({ error: "Task title cannot be empty" });
    fields.title = text;
  }
  if (description !== undefined) fields.description = description.toString();
  if (status !== undefined) {
    if (!["pending", "done", "archived"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    fields.status = status;
  }
  if (date !== undefined) fields.task_date = date.toString().trim() || existing.task_date;

  res.json({ task: db.updateTask(id, req.user.id, fields) });
});

app.delete("/api/tasks/:id", authRequired, (req, res) => {
  const id = Number(req.params.id);
  if (!db.deleteTask(id, req.user.id)) return res.status(404).json({ error: "Task not found" });
  res.json({ ok: true });
});

// ---------- Share / WhatsApp ----------
app.post("/api/share", authRequired, (req, res) => {
  const token = db.ensureShareToken(req.user.id);
  const base = PUBLIC_BASE || `${req.protocol}://${req.get("host") || `localhost:${PORT}`}`;
  const url = `${base}/share/${token}`;
  res.json({ url, token });
});

app.get("/api/share/:token", (req, res) => {
  const user = db.getUserByShareToken(req.params.token);
  if (!user) return res.status(404).json({ error: "Invalid share link" });
  const tasks = db.listTasks(user.id, null, "all");
  res.json({ user: { username: user.username }, tasks });
});

app.use("/share/:token", (_req, res, next) => {
  if (_req.method === "GET") return next();
  res.status(405).json({ error: "Share links are read-only" });
});

// ---------- Static fallback ----------
app.get("/share/:token", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "share.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Taskboard running at http://localhost:${PORT}`);
});
