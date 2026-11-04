/**
 * Demonstration (sample) data.
 *
 * Everything created here is FICTIONAL and flagged with `is_sample = 1` so it
 * can be identified in the interface and removed in one step from
 * Settings → Sample data. Meeting dates are generated relative to the date the
 * database is first created, so there are always past and upcoming meetings.
 *
 * A seeded pseudo-random generator is used so the data is the same each time.
 */
const { today } = require('./validation');

const SAMPLE_NOTE = 'SAMPLE PROFILE — fictional demonstration data. Replace with real participant information.';

// reliability = probability of attending a held meeting.
// joinedMonthsAgo / leftMonthsAgo control which meetings they are invited to.
const PEOPLE = [
  { first: 'Margaret', last: 'Thompson', dob: '1958-03-14', phone: '0412 384 905', position: 'Chair', joined: '2015-07-01', rel: 0.98, note: 'Chairs the board and the Nominations Committee.' },
  { first: 'David', last: 'Nguyen', dob: '1969-11-02', phone: '0423 117 642', position: 'Deputy Chair', joined: '2017-02-15', rel: 0.94 },
  { first: 'Priya', last: 'Raman', dob: '1976-06-21', phone: '0401 552 870', position: 'Treasurer', joined: '2019-08-01', rel: 0.92, note: 'Chartered accountant (CA ANZ).' },
  { first: 'James', last: "O'Connor", dob: '1972-01-30', phone: '0438 902 116', position: 'Company Secretary', joined: '2018-03-12', rel: 0.99 },
  { first: 'Sarah', last: 'Mitchell', dob: '1974-09-08', phone: '0419 667 203', position: 'Chief Executive Officer (ex officio)', joined: '2020-01-20', rel: 0.96 },
  { first: 'Robert', last: 'Kelly', dob: '1963-04-17', phone: '0407 225 981', position: 'Chair, Audit & Risk Committee', joined: '2016-10-05', rel: 0.9 },
  { first: 'Hannah', last: 'Brooks', dob: '1980-12-03', phone: null, position: 'Chair, People & Culture Committee', joined: '2021-05-10', rel: 0.84 },
  { first: 'Liam', last: 'Walsh', dob: '1982-07-26', phone: '0450 318 774', position: 'Non-Executive Director', joined: '2022-02-01', rel: 0.8 },
  { first: 'Chloe', last: 'Anderson', dob: '1985-02-11', phone: '0466 041 239', position: 'Non-Executive Director', joined: '2021-11-15', rel: 0.87 },
  { first: 'Thomas', last: 'Papadopoulos', dob: '1967-08-19', phone: '0414 780 362', position: 'Non-Executive Director', joined: '2019-03-04', rel: 0.88 },
  { first: 'Emma', last: 'Wilson', dob: '1978-05-29', phone: null, position: 'Non-Executive Director', joined: '2020-09-14', rel: 0.72, note: 'Based in Perth — often attends online.' , online: 0.45 },
  { first: 'Benjamin', last: 'Clarke', dob: '1971-10-07', phone: '0432 556 018', position: 'Non-Executive Director', joined: '2018-06-25', rel: 0.6 },
  { first: 'Daniel', last: 'Morgan', dob: '1966-01-23', phone: '0409 873 451', position: 'Independent Director', joined: '2017-09-01', rel: 0.93 },
  { first: 'Andrew', last: 'Fraser', dob: '1979-03-31', phone: '0421 964 307', position: 'Independent Director', joined: '2022-08-08', rel: 0.76 },
  { first: 'Olivia', last: 'Campbell', dob: '1990-11-16', phone: '0455 209 684', position: 'Board Observer', joinedMonthsAgo: 8, rel: 0.68, note: 'Participating through the Emerging Directors program.' },
  { first: 'Jessica', last: 'Tran', dob: '1987-04-04', phone: '0478 330 512', position: 'Non-Executive Director', joinedMonthsAgo: 5, rel: 0.9 },
  { first: 'Aisha', last: 'Rahman', dob: '1983-09-12', phone: '0490 115 763', position: 'Non-Executive Director', joinedMonthsAgo: 1, rel: 0.9, note: 'Newly appointed — induction scheduled.' },
  { first: 'Michael', last: 'Harris', dob: '1955-12-28', phone: '0418 442 097', position: 'Non-Executive Director', joined: '2014-04-01', leftMonthsAgo: 4, rel: 0.82, status: 'inactive', note: 'Retired from the board at the end of his term.' },
  { first: 'Grace', last: 'Sullivan', dob: '1975-06-09', phone: null, position: 'Non-Executive Director', joined: '2019-11-11', leftMonthsAgo: 7, rel: 0.7, status: 'inactive', note: 'Resigned due to other commitments.' },
];

const AUDIT_COMMITTEE = ['Kelly', 'Raman', "O'Connor", 'Mitchell', 'Fraser', 'Morgan'];

const BOARD_AGENDA = `1. Welcome, apologies and declarations of interest
2. Minutes of the previous meeting and action items
3. CEO report
4. Finance report and management accounts
5. Risk register review
6. Committee reports
7. General business
8. Meeting close`;

const AUDIT_AGENDA = `1. Apologies and conflicts of interest
2. Internal audit program update
3. External auditor report
4. Risk register and incident review
5. Compliance and policy updates
6. Other business`;

const STRATEGY_AGENDA = `Full-day planning session to review the three-year strategic plan.
- Morning: environmental scan and performance against current plan
- Afternoon: priorities, investment options and measures of success
Lunch provided.`;

const AGM_AGENDA = `1. Opening and confirmation of quorum
2. Minutes of the previous Annual General Meeting
3. Chair's address
4. Presentation of the annual financial report
5. Election of directors
6. Appointment of auditor
7. Close`;

// ---- helpers ---------------------------------------------------------------

function mulberry32(seed) {
  return function rand() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n) => String(n).padStart(2, '0');
const fmt = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** Returns {y, m} (m is 1-12) offset by `delta` months from the given year/month. */
function addMonths(y, m, delta) {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

/** Date of the nth given weekday (0=Sun) in a month, e.g. 3rd Wednesday. */
function nthWeekday(y, m, weekday, n) {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  return fmt(y, m, day);
}

function monthsAgoDate(now, months) {
  const { y, m } = addMonths(now.y, now.m, -months);
  return fmt(y, m, Math.min(now.d, 28));
}

// ---- seed -------------------------------------------------------------------

function seedSampleData(db) {
  const rand = mulberry32(20240617);
  const t = today();
  const now = { y: Number(t.slice(0, 4)), m: Number(t.slice(5, 7)), d: Number(t.slice(8, 10)) };

  const insertPerson = db.prepare(`
    INSERT OR IGNORE INTO participants (first_name, last_name, date_of_birth, email, phone, position, date_joined, status, notes, is_sample)
    VALUES (@first_name, @last_name, @date_of_birth, @email, @phone, @position, @date_joined, @status, @notes, 1)
  `);
  const insertMeeting = db.prepare(`
    INSERT INTO meetings (title, date, start_time, end_time, location, description, status, is_sample)
    VALUES (@title, @date, @start_time, @end_time, @location, @description, @status, 1)
  `);
  const insertAttendance = db.prepare(`
    INSERT OR IGNORE INTO attendance (meeting_id, participant_id, status, notes, recorded_at) VALUES (?, ?, ?, ?, ?)
  `);

  return db.transaction(() => {
    // People
    const people = [];
    for (const p of PEOPLE) {
      const email = `${p.first}.${p.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@example.com';
      const joined = p.joined || monthsAgoDate(now, p.joinedMonthsAgo);
      const info = insertPerson.run({
        first_name: p.first,
        last_name: p.last,
        date_of_birth: p.dob,
        email,
        phone: p.phone,
        position: p.position,
        date_joined: joined,
        status: p.status || 'active',
        notes: p.note ? `${SAMPLE_NOTE}\n${p.note}` : SAMPLE_NOTE,
      });
      if (!info.changes) continue; // email already used by a real record
      people.push({ ...p, id: Number(info.lastInsertRowid), joined, left: p.leftMonthsAgo ? monthsAgoDate(now, p.leftMonthsAgo) : null });
    }

    // Meetings: [{ title, date, start, end, location, agenda, status, invite: person => bool, online }]
    const meetings = [];
    for (let k = -12; k <= 2; k++) {
      const { y, m } = addMonths(now.y, now.m, k);
      if (m === 1) continue; // no board meeting in January
      const date = nthWeekday(y, m, 3, 3); // third Wednesday
      const videoConf = k === -9;
      meetings.push({
        title: `Board Meeting — ${MONTHS[m - 1]} ${y}`,
        date,
        start: '17:30',
        end: '19:30',
        location: videoConf ? 'Video conference (Microsoft Teams)' : 'Boardroom, Level 4, 120 Collins Street, Melbourne',
        agenda: BOARD_AGENDA,
        cancelled: k === -6,
        online: videoConf,
      });
      if (m % 3 === 2) {
        // Audit & Risk Committee in Feb, May, Aug, Nov (first Tuesday)
        meetings.push({
          title: `Audit & Risk Committee — ${MONTHS[m - 1]} ${y}`,
          date: nthWeekday(y, m, 2, 1),
          start: '16:00',
          end: '17:30',
          location: 'Meeting Room 2, Level 4',
          agenda: AUDIT_AGENDA,
          invite: (p) => AUDIT_COMMITTEE.includes(p.last),
        });
      }
    }
    {
      const { y, m } = addMonths(now.y, now.m, -5);
      meetings.push({
        title: 'Strategic Planning Day',
        date: nthWeekday(y, m, 5, 2), // second Friday
        start: '09:00',
        end: '16:00',
        location: 'Function Room 2, Rydges Hotel, Melbourne',
        agenda: STRATEGY_AGENDA,
      });
      const next = addMonths(now.y, now.m, 1);
      meetings.push({
        title: `Annual General Meeting ${next.y}`,
        date: nthWeekday(next.y, next.m, 4, 1), // first Thursday next month
        start: '18:00',
        end: '19:30',
        location: 'Auditorium, Ground Floor, 120 Collins Street, Melbourne',
        agenda: AGM_AGENDA,
      });
    }
    meetings.sort((a, b) => a.date.localeCompare(b.date));

    const pastBoard = meetings.filter((m) => m.date < t && !m.cancelled && m.title.startsWith('Board'));
    const latestPast = pastBoard[pastBoard.length - 1];
    const firstUpcomingBoard = meetings.find((m) => m.date >= t && m.title.startsWith('Board'));

    for (const m of meetings) {
      const past = m.date < t;
      const status = m.cancelled ? 'cancelled' : past ? 'completed' : 'upcoming';
      const description = m.cancelled ? `${m.agenda}\n\nCancelled — insufficient numbers for a quorum. Items deferred to the next meeting.` : m.agenda;
      const meetingId = Number(insertMeeting.run({
        title: m.title, date: m.date, start_time: m.start, end_time: m.end,
        location: m.location, description, status,
      }).lastInsertRowid);

      const invitees = people.filter((p) => p.joined <= m.date && (!p.left || p.left > m.date) && (!m.invite || m.invite(p)));
      invitees.forEach((p, idx) => {
        let st = null;
        let note = null;
        if (past && !m.cancelled) {
          if (m === latestPast && idx % 6 === 5) {
            st = null; // deliberately left unrecorded to demonstrate outstanding records
          } else if (rand() < p.rel) {
            const r = rand();
            if (m.online || r < (p.online || 0.06)) st = 'online';
            else if (r < (p.online || 0.06) + 0.07) { st = 'late'; note = 'Arrived 20 minutes late — traffic.'; }
            else if (r < (p.online || 0.06) + 0.12) { st = 'left_early'; note = 'Left before general business.'; }
            else st = 'present';
          } else {
            st = rand() < 0.68 ? 'apology' : 'absent';
            if (st === 'apology') note = ['Travelling interstate.', 'Unwell.', 'Prior work commitment.', 'Family commitment.'][Math.floor(rand() * 4)];
          }
        } else if (m === firstUpcomingBoard && p.last === 'Clarke') {
          st = 'apology';
          note = 'Overseas — apology sent in advance.';
        }
        insertAttendance.run(meetingId, p.id, st, note, st ? `${m.date} 20:00:00` : null);
      });
    }

    db.prepare(`INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sample_seeded_at', datetime('now'))`).run();
    return { participants: people.length, meetings: meetings.length };
  })();
}

/** Seed on first launch only (when the database has no participants or meetings and was never seeded). */
function seedIfEmpty(db) {
  if (process.env.SEED_SAMPLE_DATA === 'false') return;
  const seeded = db.prepare(`SELECT value FROM app_meta WHERE key = 'sample_seeded_at'`).get();
  const hasData = db.prepare('SELECT (SELECT COUNT(*) FROM participants) + (SELECT COUNT(*) FROM meetings)').pluck().get();
  if (seeded || hasData) return;
  const r = seedSampleData(db);
  console.log(`[seed] Loaded sample data: ${r.participants} participants, ${r.meetings} meetings.`);
}

module.exports = { seedSampleData, seedIfEmpty };
