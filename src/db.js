const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "taskboard.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    share_token  TEXT UNIQUE,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','archived')),
    task_date  TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user_date ON tasks (user_id, task_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks (user_id, status);
`);

function addUser(username, passwordHash) {
  const info = db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, passwordHash);
  return db.prepare("SELECT id, username, share_token, created_at FROM users WHERE id = ?").get(info.lastInsertRowid);
}

function findUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
}

function findUserById(id) {
  return db.prepare("SELECT id, username, share_token, created_at FROM users WHERE id = ?").get(id);
}

function getUserByShareToken(token) {
  return db.prepare("SELECT id, username, created_at FROM users WHERE share_token = ?").get(token);
}

function ensureShareToken(userId) {
  const existing = db.prepare("SELECT share_token FROM users WHERE id = ?").get(userId);
  if (existing && existing.share_token) return existing.share_token;
  const token = require("crypto").randomBytes(24).toString("hex");
  db.prepare("UPDATE users SET share_token = ? WHERE id = ?").run(token, userId);
  return token;
}

function listTasks(userId, date, status) {
  const where = ["user_id = ?"];
  const params = [userId];
  if (date) { where.push("task_date = ?"); params.push(date); }
  if (status && status !== "all") { where.push("status = ?"); params.push(status); }
  return db.prepare(`SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY task_date DESC, id DESC`).all(...params);
}

function createTask(userId, title, taskDate) {
  const info = db.prepare("INSERT INTO tasks (user_id, title, task_date) VALUES (?, ?, ?)").run(userId, title, taskDate);
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(info.lastInsertRowid);
}

function getTask(id, userId) {
  return db.prepare("SELECT * FROM tasks WHERE id = ? AND user_id = ?").get(id, userId);
}

function updateTask(id, userId, fields) {
  const allowed = ["title", "status", "task_date"];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) { sets.push(`${key} = ?`); params.push(fields[key]); }
  }
  if (!sets.length) return getTask(id, userId);
  sets.push("updated_at = datetime('now')");
  params.push(id, userId);
  db.prepare(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(...params);
  return getTask(id, userId);
}

function deleteTask(id, userId) {
  return db.prepare("DELETE FROM tasks WHERE id = ? AND user_id = ?").run(id, userId).changes > 0;
}

module.exports = {
  db,
  addUser,
  findUserByUsername,
  findUserById,
  getUserByShareToken,
  ensureShareToken,
  listTasks,
  createTask,
  getTask,
  updateTask,
  deleteTask,
};
