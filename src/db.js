const path = require("path");
const fs = require("fs");

const REMOTE_URL = process.env.DATABASE_URL;
const REMOTE_TOKEN = process.env.TURSO_AUTH_TOKEN;

// Common async primitive so the rest of the code works identically on both
// local SQLite (better-sqlite3) and hosted SQLite (Turso/libSQL).
let run, all, get, exec;

if (REMOTE_URL) {
  const { createClient } = require("@libsql/client");
  const client = createClient({
    url: REMOTE_URL,
    authToken: REMOTE_TOKEN,
    rowMode: "object",
  });
  run = async (sql, params = []) => {
    const r = await client.execute({ sql, args: params });
    return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.rowsAffected };
  };
  all = async (sql, params = []) => {
    const r = await client.execute({ sql, args: params });
    return r.rows;
  };
  get = async (sql, params = []) => (await all(sql, params))[0];
  exec = async (sql) => client.executeMultiple(sql);
} else {
  const Database = require("better-sqlite3");
  const DATA_DIR = path.join(__dirname, "..", "data");
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const local = new Database(path.join(DATA_DIR, "taskboard.db"));
  local.pragma("journal_mode = WAL");
  local.pragma("foreign_keys = ON");

  run = async (sql, params = []) => {
    const r = local.prepare(sql).run(...params);
    return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.changes };
  };
  all = async (sql, params = []) => local.prepare(sql).all(...params);
  get = async (sql, params = []) => local.prepare(sql).get(...params);
  exec = async (sql) => local.exec(sql);
}

exec(`
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

async function ensureColumns() {
  const rows = await all("PRAGMA table_info(tasks)");
  const cols = rows.map((c) => c.name);
  if (!cols.includes("description")) {
    await exec("ALTER TABLE tasks ADD COLUMN description TEXT");
  }
}
ensureColumns();

async function addUser(username, passwordHash) {
  const info = await run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, passwordHash]);
  return get("SELECT id, username, share_token, created_at FROM users WHERE id = ?", [info.lastInsertRowid]);
}

function findUserByUsername(username) {
  return get("SELECT * FROM users WHERE username = ? COLLATE NOCASE", [username]);
}

function findUserById(id) {
  return get("SELECT id, username, share_token, created_at FROM users WHERE id = ?", [id]);
}

function getUserByShareToken(token) {
  return get("SELECT id, username, created_at FROM users WHERE share_token = ?", [token]);
}

async function ensureShareToken(userId) {
  const existing = await get("SELECT share_token FROM users WHERE id = ?", [userId]);
  if (existing && existing.share_token) return existing.share_token;
  const token = require("crypto").randomBytes(24).toString("hex");
  await run("UPDATE users SET share_token = ? WHERE id = ?", [token, userId]);
  return token;
}

async function listTasks(userId, date, status) {
  const where = ["user_id = ?"];
  const params = [userId];
  if (date) { where.push("task_date = ?"); params.push(date); }
  if (status && status !== "all") { where.push("status = ?"); params.push(status); }
  return all(`SELECT * FROM tasks WHERE ${where.join(" AND ")} ORDER BY task_date DESC, id DESC`, params);
}

async function createTask(userId, title, taskDate, description) {
  const info = await run("INSERT INTO tasks (user_id, title, task_date, description) VALUES (?, ?, ?, ?)", [userId, title, taskDate, description || null]);
  return get("SELECT * FROM tasks WHERE id = ?", [info.lastInsertRowid]);
}

function getTask(id, userId) {
  return get("SELECT * FROM tasks WHERE id = ? AND user_id = ?", [id, userId]);
}

async function updateTask(id, userId, fields) {
  const allowed = ["title", "status", "task_date", "description"];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (fields[key] !== undefined) { sets.push(`${key} = ?`); params.push(fields[key]); }
  }
  if (!sets.length) return getTask(id, userId);
  sets.push("updated_at = datetime('now')");
  params.push(id, userId);
  await run(`UPDATE tasks SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`, params);
  return getTask(id, userId);
}

async function deleteTask(id, userId) {
  const r = await run("DELETE FROM tasks WHERE id = ? AND user_id = ?", [id, userId]);
  return r.changes > 0;
}

module.exports = {
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
