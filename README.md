# Taskboard — Slack-style personal task board

A lightweight, self-hosted daily task board with a Slack-like UI.

- **JWT auth** — register/login, 30-day tokens, passwords hashed with bcrypt.
- **Persistent storage** — SQLite file (`data/taskboard.db`). Nothing is auto-deleted; completed tasks stay archived until you remove them.
- **WhatsApp sharing** — one click generates a read-only public link and opens WhatsApp with it prefilled.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000, register a user, and start adding tasks.

## Share via WhatsApp

Click **Share on WhatsApp** → a read-only link is generated (usable on any device, no login needed) and WhatsApp opens with a prefilled message. The link stays stable across restarts.

## API

| Method | Path                 | Auth | Description                        |
| ------ | -------------------- | ---- | ---------------------------------- |
| POST   | `/api/auth/register` | no   | Create account → `{token, user}`   |
| POST   | `/api/auth/login`    | no   | Login → `{token, user}`            |
| GET    | `/api/auth/me`       | yes  | Current user                       |
| GET    | `/api/tasks`         | yes  | List tasks (`?date=`, `?status=`)  |
| POST   | `/api/tasks`         | yes  | Add task `{title, date}`           |
| PATCH  | `/api/tasks/:id`     | yes  | Update `{title?, status?, date?}`  |
| DELETE | `/api/tasks/:id`     | yes  | Delete forever                     |
| POST   | `/api/share`         | yes  | Get/create share link              |
| GET    | `/api/share/:token`  | no   | Read-only tasks for a share link   |

## Data
- All data lives in `data/` (SQLite DB + JWT secret). Back up that folder to keep your history.
- Task history is only removed when you explicitly delete it.