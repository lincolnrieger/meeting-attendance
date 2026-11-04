# Board Register — Board Meeting Attendance Management

A web application for keeping track of board members, organising board meetings and
recording attendance over time. It includes a dashboard, participant profiles with
individual attendance histories, a fast attendance register, and date-filtered reports
with CSV export.

- **Frontend:** React 19 + React Router, built with Vite. Plain CSS (no UI framework), [Lucide](https://lucide.dev) icons, IBM Plex Sans.
- **Backend:** Node.js + Express 5 JSON API.
- **Database:** SQLite (via `better-sqlite3`), stored in a single file at `data/board-attendance.db`.
- **Auth:** single administrator login with server-side sessions (HttpOnly cookie) and bcrypt-hashed passwords.

---

## Quick start

Requires **Node.js 20 or later**.

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5173> and sign in with:

| Username | Password   |
| -------- | ---------- |
| `admin`  | `admin123` |

Change the password straight away under **Settings → Change password**.

`npm run dev` starts the API (port 3001, auto-restarts on server changes) and the Vite
dev server (port 5173, hot reload) together.

### Running for everyday use

Build the frontend once, then run a single Node process that serves both the app and the API:

```bash
npm run build
```

```bash
npm start
```

Then open <http://localhost:3001>.

### Configuration

Optional environment variables, e.g. `PORT=8080 npm start`:

| Variable           | Default                       | Purpose |
| ------------------ | ----------------------------- | ------- |
| `PORT`             | `3001`                        | Port for the API / production server |
| `DB_PATH`          | `data/board-attendance.db`    | Location of the SQLite database file |
| `ADMIN_USERNAME`   | `admin`                       | Username for the administrator account created on first launch |
| `ADMIN_PASSWORD`   | `admin123`                    | Initial password for that account |
| `SEED_SAMPLE_DATA` | `true`                        | Set to `false` to start with an empty database |

The admin account and sample data are only created when the database is new.

---

## Sample data

On first launch the database is populated with **fictional demonstration data**:

- 19 board member profiles with Australian names (17 active, 2 inactive). All use
  `@example.com` addresses and their notes begin with *"SAMPLE PROFILE — fictional
  demonstration data"*.
- Around 20 meetings: monthly board meetings for the past year, quarterly Audit & Risk
  Committee meetings, a strategy day, one cancelled meeting, and upcoming meetings
  including an AGM. Dates are generated relative to the day the database is created.
- Realistic attendance records, including late arrivals, online attendance, apologies,
  absences and a few deliberately unrecorded entries so the "outstanding records"
  features can be seen.

Sample records are marked with a **SAMPLE** tag throughout the interface. They can be
edited or deleted like any other record, or removed all at once from
**Settings → Sample data → Remove all sample data** (records you added yourself are kept).
They can be reloaded from the same place.

---

## Features

**Dashboard** — registered participants, meetings held, upcoming meetings, overall
attendance %, latest meeting attendance, highest-attending members, and members with
outstanding (unrecorded) attendance, with links to fix them. Upcoming meetings show date,
time, location and expected attendees (invited minus apologies already received).

**Participants** — add, edit and delete profiles (name, date of birth, email, optional
phone, position, date joined, optional photo or initials avatar, active/inactive status,
notes). Search by name, email or position; filter by status; import from CSV (with
preview, validation and duplicate detection — a template is provided); export to CSV.

**Participant profile** — personal information, totals (meetings invited, attended,
absences, apologies, attendance %), a trend chart (rolling attendance rate plus a
per-meeting status strip), upcoming invitations and the full chronological history.
History can be exported to CSV.

**Meetings** — create, edit, duplicate (copies details and invitation list), cancel /
reinstate, mark completed, delete. Upcoming, previous, cancelled and all-meeting views.
Each meeting has a title, date, start/finish time, location, agenda, invitation list
and status.

**Attendance register** — every invited participant with a one-click status selector
(Present, Late, Left early, Online, Apology, Absent; a dropdown on phones), optional notes,
**Mark all present** / **Mark remaining present**, live totals and attendance %, and clear
highlighting and filtering of participants not yet recorded. Every change is saved
immediately; the register shows "Saving…" / "All changes saved". Registers can be
exported to CSV.

**Reports** — any date range (presets for last 3/12 months, calendar year, Australian
financial year, all time, or custom). Overview (summary figures, monthly trend chart,
absence & apology breakdown, highest/lowest attendance), **By member** and **By meeting**
tables (sortable). Every view exports to CSV.

### How attendance is calculated

- A meeting counts as **held** once it is marked *Completed*, or when it is still
  *Upcoming* but its date has passed. *Cancelled* meetings are excluded from statistics.
- **Attended** = Present, Late, Left early or Online.
- **Attendance %** = attended ÷ recorded entries. Entries not yet recorded are shown
  separately ("Not recorded") rather than counted as absences.

---

## Project structure

```
server/
  index.js            Server entry point
  app.js              Express app factory (routes, static files, error handling)
  db.js               SQLite connection + schema migrations
  auth.js             Login/logout, sessions, password change
  validation.js       Input validation and shared constants
  stats.js            Shared SQL for attendance statistics
  seed.js             Fictional sample data
  routes/
    participants.js   Participant CRUD, profile/history, CSV import
    meetings.js       Meeting CRUD, invitations, attendance register
    dashboard.js      Dashboard figures
    reports.js        Date-range reports
    settings.js       Sample data management
client/
  index.html
  src/
    App.jsx           Routes and auth state
    styles.css        All styling (design tokens at the top)
    components/       Layout, charts, dialogs/toasts, shared UI pieces
    lib/              API client, formatting, CSV helpers, attendance constants
    pages/            One file per screen
tests/
  api.test.js         API integration tests (node:test)
  e2e.js              Browser end-to-end test of the main workflows (Playwright)
data/                 SQLite database (git-ignored)
```

### Data model

| Table          | Purpose |
| -------------- | ------- |
| `participants` | Board member profiles. `email` is unique (case-insensitive). `is_sample` marks demonstration data. |
| `meetings`     | Meetings with status `upcoming` / `completed` / `cancelled`. |
| `attendance`   | One row per invited participant per meeting. **Primary key `(meeting_id, participant_id)`** makes duplicate records impossible. `status` is `NULL` until recorded. Foreign keys cascade, so deleting a meeting or participant removes its attendance rows and records always point at a valid participant and meeting. |
| `users`, `sessions` | Administrator account and login sessions. |

Schema changes go in the `MIGRATIONS` array in `server/db.js`; the database's
`user_version` tracks which have been applied.

---

## Testing

```bash
npm test
```

Runs the API integration tests against a temporary database (authentication, validation,
CRUD, duplicate prevention, attendance recording, reports, CSV import, cascade deletes,
sample-data removal, persistence across restarts).

```bash
npm run build && npm run test:e2e
```

Drives a real browser through the main workflows — adding and editing a participant,
creating a meeting, adding invitees, recording attendance, reviewing a participant's
history, filtering and exporting reports, CSV import/export, duplicating and cancelling
a meeting, delete confirmations, and checking that data persists after a server restart.
It needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).

---

## Backups and deployment notes

- All data lives in the SQLite file (`data/board-attendance.db` by default). Back it up by
  copying the file while the app is stopped, or with `sqlite3 data/board-attendance.db ".backup backup.db"`.
- If you host the app for others, put it behind HTTPS (e.g. a reverse proxy) and change
  the administrator password. Session cookies are marked `Secure` automatically when the
  request is served over HTTPS (configure your proxy / Express `trust proxy` accordingly).
