/**
 * API integration tests. Run with `npm test`.
 * Each run uses a fresh temporary SQLite database.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../server/db');
const { createApp } = require('../server/app');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-attendance-test-'));
const dbPath = path.join(dir, 'test.db');
let db;
let server;
let base;
let cookie = '';

async function call(method, url, body, { auth = true } = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(auth && cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data, headers: res.headers };
}

function startServer() {
  db = openDatabase(dbPath);
  const app = createApp(db);
  return new Promise((resolve) => {
    server = app.listen(0, () => {
      base = `http://127.0.0.1:${server.address().port}/api`;
      resolve();
    });
  });
}

function stopServer() {
  return new Promise((resolve) => server.close(() => { db.close(); resolve(); }));
}

const person = (over = {}) => ({
  first_name: 'Alex', last_name: 'Citizen', email: 'alex.citizen@test.example', position: 'Non-Executive Director',
  date_joined: '2023-01-01', date_of_birth: '1980-05-17', phone: '0400 000 000', status: 'active', notes: 'Test', ...over,
});

before(async () => {
  process.env.SEED_SAMPLE_DATA = 'true';
  await startServer();
});

after(async () => {
  await stopServer();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('rejects unauthenticated requests and bad credentials', async () => {
  assert.equal((await call('GET', '/participants', null, { auth: false })).status, 401);
  assert.equal((await call('POST', '/auth/login', { username: 'admin', password: 'wrong' })).status, 401);
});

test('logs in as administrator', async () => {
  const r = await call('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  assert.equal(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^bma_session=/);
  assert.equal((await call('GET', '/auth/me')).data.user.username, 'admin');
});

test('seeds sample data on first launch, flagged as sample', async () => {
  const { data } = await call('GET', '/participants');
  assert.ok(data.participants.length >= 15 && data.participants.length <= 20);
  assert.ok(data.participants.every((p) => p.is_sample === 1));
  const dash = (await call('GET', '/dashboard')).data;
  assert.ok(dash.meetings.held > 5);
  assert.ok(dash.meetings.upcoming >= 2);
  assert.ok(dash.overall.rate > 0);
});

let participantId;
test('validates and creates a participant', async () => {
  const bad = await call('POST', '/participants', { first_name: '', email: 'not-an-email' });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.errors.first_name && bad.data.errors.email && bad.data.errors.position && bad.data.errors.date_joined);

  const future = await call('POST', '/participants', person({ date_of_birth: '2999-01-01' }));
  assert.equal(future.status, 422);
  assert.ok(future.data.errors.date_of_birth);

  const ok = await call('POST', '/participants', person());
  assert.equal(ok.status, 201);
  participantId = ok.data.participant.id;
  assert.equal(ok.data.participant.is_sample, 0);

  const dup = await call('POST', '/participants', person({ email: 'ALEX.CITIZEN@test.example' }));
  assert.equal(dup.status, 422);
  assert.ok(dup.data.errors.email);
});

test('edits a participant', async () => {
  const r = await call('PUT', `/participants/${participantId}`, person({ position: 'Treasurer', phone: '' }));
  assert.equal(r.status, 200);
  assert.equal(r.data.participant.position, 'Treasurer');
  assert.equal(r.data.participant.phone, null);
});

let meetingId;
test('validates and creates a meeting with invitees', async () => {
  const bad = await call('POST', '/meetings', { title: 'X', date: '2026-02-30', start_time: '18:00', end_time: '17:00', location: '' });
  assert.equal(bad.status, 422);
  assert.ok(bad.data.errors.date && bad.data.errors.location);

  const badTime = await call('POST', '/meetings', { title: 'X', date: '2026-02-03', start_time: '18:00', end_time: '17:00', location: 'Room' });
  assert.ok(badTime.data.errors.end_time);

  const others = (await call('GET', '/participants?status=active')).data.participants.slice(0, 3).map((p) => p.id);
  const ok = await call('POST', '/meetings', {
    title: 'Test Board Meeting', date: '2020-03-04', start_time: '17:30', end_time: '19:30', location: 'Boardroom',
    description: 'Agenda', participant_ids: [participantId, participantId, ...others], // duplicate id on purpose
  });
  assert.equal(ok.status, 201);
  meetingId = ok.data.meeting.id;
  const detail = (await call('GET', `/meetings/${meetingId}`)).data;
  assert.equal(detail.attendees.length, 4, 'duplicate invitee ids collapse to one record');
  assert.equal(detail.summary.unrecorded, 4);
});

test('prevents duplicate attendance records at the database level', () => {
  assert.throws(() => db.prepare('INSERT INTO attendance (meeting_id, participant_id) VALUES (?, ?)').run(meetingId, participantId), /UNIQUE|PRIMARY KEY/);
});

test('records attendance and computes totals', async () => {
  const r = await call('PUT', `/meetings/${meetingId}/attendance/${participantId}`, { status: 'late', notes: 'Traffic' });
  assert.equal(r.status, 200);
  assert.equal(r.data.record.status, 'late');
  assert.equal(r.data.summary.attended, 1);
  assert.equal(r.data.summary.unrecorded, 3);

  assert.equal((await call('PUT', `/meetings/${meetingId}/attendance/${participantId}`, { status: 'asleep' })).status, 400);
  assert.equal((await call('PUT', `/meetings/${meetingId}/attendance/999999`, { status: 'present' })).status, 404);

  const bulk = await call('POST', `/meetings/${meetingId}/attendance/bulk`, { status: 'present', only_unrecorded: true });
  assert.equal(bulk.data.updated, 3);
  assert.equal(bulk.data.summary.unrecorded, 0);
  assert.equal(bulk.data.summary.late, 1, 'existing records are kept when only marking unrecorded');
  assert.equal(bulk.data.summary.rate, 100);

  const cleared = await call('PUT', `/meetings/${meetingId}/attendance/${participantId}`, { status: null });
  assert.equal(cleared.data.summary.unrecorded, 1);
  await call('PUT', `/meetings/${meetingId}/attendance/${participantId}`, { status: 'apology' });
});

test('shows individual attendance history', async () => {
  const { data } = await call('GET', `/participants/${participantId}`);
  assert.equal(data.summary.invited, 1);
  assert.equal(data.summary.apology, 1);
  assert.equal(data.summary.rate, 0);
  assert.equal(data.history[0].meeting_id, meetingId);
  assert.equal(data.history[0].notes, 'Traffic');
});

test('removing an invitee removes their record; cancelled meetings are read-only', async () => {
  const m = (await call('GET', `/meetings/${meetingId}`)).data;
  const keep = m.attendees.filter((a) => a.participant_id !== participantId).map((a) => a.participant_id);
  await call('PUT', `/meetings/${meetingId}`, { ...m.meeting, participant_ids: keep });
  assert.equal((await call('GET', `/participants/${participantId}`)).data.history.length, 0);
  await call('PUT', `/meetings/${meetingId}`, { ...m.meeting, participant_ids: [...keep, participantId] });

  assert.equal((await call('PATCH', `/meetings/${meetingId}/status`, { status: 'cancelled' })).status, 200);
  assert.equal((await call('PUT', `/meetings/${meetingId}/attendance/${participantId}`, { status: 'present' })).status, 409);
  await call('PATCH', `/meetings/${meetingId}/status`, { status: 'completed' });
});

test('reports filter by date range', async () => {
  const r = (await call('GET', '/reports?from=2020-03-01&to=2020-03-31')).data;
  assert.equal(r.summary.meetings, 1);
  assert.equal(r.byMeeting[0].id, meetingId);
  assert.equal(r.byMember.length, 4);
  assert.equal(r.trend[0].month, '2020-03');
  assert.equal((await call('GET', '/reports?from=2021-01-01&to=2020-01-01')).status, 400);
});

test('imports participants from CSV rows, skipping invalid and duplicate rows', async () => {
  const r = await call('POST', '/participants/import', {
    rows: [
      person({ email: 'new.one@test.example', first_name: 'New' }),
      person({ email: 'alex.citizen@test.example' }),
      person({ email: 'bad', first_name: 'Bad' }),
      person({ email: 'new.two@test.example', status: 'Inactive' }),
    ],
  });
  assert.equal(r.data.created, 2);
  assert.equal(r.data.skipped.length, 2);
});

test('deleting a participant cascades to attendance', async () => {
  assert.equal((await call('DELETE', `/participants/${participantId}`)).status, 200);
  const n = db.prepare('SELECT COUNT(*) FROM attendance WHERE participant_id = ?').pluck().get(participantId);
  assert.equal(n, 0);
  assert.equal((await call('GET', `/participants/${participantId}`)).status, 404);
});

test('data persists across a server restart', async () => {
  await stopServer();
  await startServer();
  const r = await call('GET', `/meetings/${meetingId}`);
  assert.equal(r.status, 200, 'session and meeting survive restart');
  assert.equal(r.data.meeting.title, 'Test Board Meeting');
  const sampleCount = (await call('GET', '/settings/sample-data')).data.participants;
  assert.ok(sampleCount > 0, 'sample data is not re-seeded or duplicated');
});

test('removes all sample data but keeps real records', async () => {
  const r = await call('DELETE', '/settings/sample-data');
  assert.ok(r.data.participants > 0 && r.data.meetings > 0);
  const left = (await call('GET', '/participants')).data.participants;
  assert.ok(left.length >= 2 && left.every((p) => !p.is_sample));
  assert.equal((await call('GET', `/meetings/${meetingId}`)).status, 200);
});

test('changes the administrator password', async () => {
  assert.equal((await call('POST', '/auth/change-password', { current_password: 'nope', new_password: 'longenough' })).status, 422);
  assert.equal((await call('POST', '/auth/change-password', { current_password: 'admin123', new_password: 'short' })).status, 422);
  assert.equal((await call('POST', '/auth/change-password', { current_password: 'admin123', new_password: 'new-password-1' })).status, 200);
  assert.equal((await call('POST', '/auth/login', { username: 'admin', password: 'new-password-1' })).status, 200);
});
