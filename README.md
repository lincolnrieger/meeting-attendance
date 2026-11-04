# Attendance Register

A general-purpose attendance register for any group that meets regularly — classes, scout
groups, sports teams, clubs, committees, volunteer shifts or workplace training. Keep a
list of people, schedule sessions and record attendance over time.

Everything adapts to your group in **Settings**: the organisation name, what people and
sessions are called (e.g. *Students* and *Classes*, *Scouts* and *Troop Nights*), and the
suggestions offered in forms for roles (e.g. Teacher, Scout Leader, Coach), session titles
and locations. **Custom fields** let you record any extra details for each person (membership
number, emergency contact, screening expiry…), and an Excel/CSV import can create them
straight from your spreadsheet's column headings.

It includes a dashboard, participant profiles with
individual attendance histories, a fast attendance register, and date-filtered reports
with CSV export.

- **Frontend:** React 19 + React Router, built with Vite. Plain CSS (no UI framework), [Lucide](https://lucide.dev) icons, IBM Plex Sans.
- **Backend:** a [Hono](https://hono.dev) JSON API that runs unchanged on **Cloudflare Workers** (production) and **Node.js** (local development, tests, or self-hosting).
- **Database:** SQLite — **Cloudflare D1** in production; a local SQLite file (`data/attendance.db`, via `better-sqlite3`) when running on Node.
- **Auth:** single administrator login with server-side sessions (HttpOnly cookie) and PBKDF2-hashed passwords.

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

### Deploying to Cloudflare (Workers + D1)

The repository is set up for [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/):
every push to `main` builds the frontend and deploys the Worker defined in `wrangler.toml`
(Worker name `meeting-attendance`).

1. **Set the administrator password** — in the Cloudflare dashboard open
   *Workers & Pages → meeting-attendance → Settings → Variables and Secrets*, click **Add**,
   choose type **Secret**, name it `ADMIN_PASSWORD` and enter a strong password.
   On Cloudflare there is *no* default password; the admin account (username `admin`, or
   `ADMIN_USERNAME` if you set it) is created from this secret the first time the app runs.
   Changing the secret later does not change an existing password — use **Settings** in the app.
2. **Build settings** — the defaults work: deploy command `npx wrangler deploy` (Wrangler runs
   `npm run build` itself, as configured in `wrangler.toml`). Leave the build command empty or set it to `npm run build`.
3. **Push to `main`** (or click *Retry build*). On the first deploy Wrangler automatically
   creates the D1 database `meeting-attendance-db` and binds it as `DB`. The app creates its
   tables and loads the sample data on the first request.

Settings in `wrangler.toml` `[vars]`: `APP_TIMEZONE` (default `Australia/Melbourne` — decides
which meetings count as past or upcoming) and `SEED_SAMPLE_DATA` (set to `"false"` before the
first deploy to start empty).

You can also deploy from your own machine with `npx wrangler login` then `npm run deploy`,
and run the Cloudflare version locally (Workers runtime + local D1) with `npm run cf:dev`
— put `ADMIN_PASSWORD=...` in a `.dev.vars` file first.

### Self-hosting on Node.js

Build the frontend once, then run a single Node process that serves both the app and the API:

```bash
npm run build
```

```bash
npm start
```

Then open <http://localhost:3001>.

### Configuration

Optional environment variables for Node, e.g. `PORT=8080 npm start`:

| Variable           | Default                       | Purpose |
| ------------------ | ----------------------------- | ------- |
| `PORT`             | `3001`                        | Port for the API / production server |
| `DB_PATH`          | `data/attendance.db`          | Location of the SQLite database file |
| `ADMIN_USERNAME`   | `admin`                       | Username for the administrator account created on first launch |
| `ADMIN_PASSWORD`   | `admin123`                    | Initial password for that account |
| `SEED_SAMPLE_DATA` | `true`                        | Set to `false` to start with an empty database |
| `APP_TIMEZONE`     | `Australia/Melbourne`         | Time zone used to decide what "today" is |

The admin account and sample data are only created when the database is new. On Node,
`admin` / `admin123` is used when `ADMIN_PASSWORD` is not set (never on Cloudflare).

---

## Sample data

On first launch the database is populated with **fictional demonstration data** for a
community group:

- 19 people with Australian names and general roles (Coordinator, Secretary, Treasurer,
  Member, Volunteer, Guest…), 17 active and 2 inactive. All use `@example.com` addresses and
  their notes begin with *"SAMPLE PROFILE — fictional demonstration data"*.
- Around 20 sessions: monthly general meetings for the past year, quarterly committee
  meetings, a skills workshop, one cancelled meeting, and upcoming meetings including an
  AGM. Dates are generated relative to the day the database is created.
- Realistic attendance records, including late arrivals, online attendance, apologies,
  absences and a few deliberately unrecorded entries so the "outstanding records"
  features can be seen.

Sample records are marked with a **SAMPLE** tag throughout the interface. They can be
edited or deleted like any other record, or removed all at once from
**Settings → Sample data → Remove all sample data** (records you added yourself are kept).
They can be reloaded from the same place.

---

## Features

**Settings → Organisation and terminology** — organisation name (sidebar, sign-in page,
browser tab); and what people and sessions are called, used throughout the interface.
**Restore defaults** puts the standard terminology and suggestions back.

**Settings → Custom fields** — define extra details recorded for every person: text, long
text, number, date or yes/no. Rename, retype, reorder or delete them (deleting removes
everyone's values for that field). Fields can also be added straight from the add / edit
person form. They appear in the form, on profiles (only filled-in values are shown), in
search, and as extra columns in the people export.

**Settings → Form suggestions** — editable lists (one per line) of suggested **roles**,
**session titles** and **locations**. These appear as you type in the person and session
forms; any other value can still be typed in.

**Dashboard** — registered participants, meetings held, upcoming meetings, overall
attendance %, latest meeting attendance, highest-attending members, and members with
outstanding (unrecorded) attendance, with links to fix them. Upcoming meetings show date,
time, location and expected attendees (invited minus apologies already received).

**Participants** — add, edit and delete profiles (name, date of birth, email, optional
phone, position, date joined, optional photo or initials avatar, active/inactive status,
notes, plus any custom fields). Search by name, email, role or any custom detail; filter by
status; export to CSV.

**Import (Excel .xlsx or CSV)** — choose the sheet and the row holding the column headings
(both detected automatically), then decide what each column becomes: a standard field
(a single "Name" column can be split into first and last name), an existing custom field,
a **new custom field** (name and type guessed from the data), or skipped. Calculated
(formula) columns and blank template rows are skipped by default. Defaults can be given
for role and date joined; rows with problems or an email that already exists are skipped
and listed with the reason. Excel files are read in the browser — no extra dependency.

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
wrangler.toml         Cloudflare Workers configuration (Worker name, D1 binding, static assets)
worker/
  index.mjs           Cloudflare Workers entry point (D1 database, static assets)
server/
  index.js            Node.js entry point (local SQLite file, serves the built frontend)
  app.js              Hono app factory (routes, one-time setup, error handling)
  database.js         Database adapter API, D1 adapter, migrations runner, SQL helpers
  node-database.js    better-sqlite3 adapter for Node.js
  schema.js           Schema migrations
  auth.js             Login/logout, sessions, password hashing, password change
  validation.js       Input validation, shared constants, time zone handling
  app-settings.js     Organisation name, terminology and suggestion lists
  stats.js            Shared SQL for attendance statistics
  seed.js             Fictional sample data
  routes/
    participants.js   Participant CRUD, profile/history, CSV import
    meetings.js       Meeting CRUD, invitations, attendance register
    dashboard.js      Dashboard figures
    reports.js        Date-range reports
    settings.js       Organisation settings and sample data
    custom-fields.js  Custom field definitions
client/
  index.html
  src/
    App.jsx           Routes and auth state
    styles.css        All styling (design tokens at the top)
    components/       Layout, charts, dialogs/toasts, shared UI pieces
    lib/              API client, settings context, custom fields, CSV / Excel import, formatting
    pages/            One file per screen
tests/
  api.test.js         API integration tests (node:test)
  e2e.js              Browser end-to-end test of the main workflows (Playwright)
data/                 Local SQLite database when running on Node (git-ignored)
```

The route code talks to the database only through the small async adapter in
`server/database.js` (`all`, `first`, `value`, `run`, `batch`), which is why the same code runs
on D1 and on a local SQLite file. Multi-step changes use `batch`, which is atomic on both.

### Data model

| Table          | Purpose |
| -------------- | ------- |
| `participants` | People whose attendance is recorded (the `position` column holds their role). `email` is unique (case-insensitive). `is_sample` marks demonstration data. |
| `meetings`     | Meetings with status `upcoming` / `completed` / `cancelled`. |
| `attendance`   | One row per invited participant per meeting. **Primary key `(meeting_id, participant_id)`** makes duplicate records impossible. `status` is `NULL` until recorded. Foreign keys cascade, so deleting a meeting or participant removes its attendance rows and records always point at a valid participant and meeting. |
| `app_settings` | Organisation name, terminology and suggestion lists (JSON values). |
| `users`, `sessions` | Administrator account and login sessions. |

Schema changes go in the `MIGRATIONS` array in `server/schema.js` (append, never edit a
deployed one). Applied versions are recorded in the `schema_migrations` table and new ones are
applied automatically on startup / first request.

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
To run the same test against the Cloudflare runtime, start `npm run cf:dev` with a fresh local
database and run `E2E_BASE_URL=http://localhost:8787 E2E_PASSWORD=<your .dev.vars password> npm run test:e2e`.

---

## Backups

- **Cloudflare D1:** D1 keeps point-in-time recovery (Time Travel) for the last 30 days. To
  take a copy: `npx wrangler d1 export meeting-attendance-db --remote --output backup.sql`.
- **Node:** all data lives in the SQLite file (`data/attendance.db` by default). Copy it
  while the app is stopped, or run `sqlite3 data/attendance.db ".backup backup.db"`.

If you self-host on Node for others, put it behind HTTPS and set a strong `ADMIN_PASSWORD`.
