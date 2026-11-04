/**
 * End-to-end browser test of the main workflows.
 *
 *   npm run build && npm run test:e2e
 *
 * Requires Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
 * Starts its own server on a spare port with a temporary database, so it never
 * touches your real data. Screenshots are written to tests/screenshots/.
 *
 * To test an already-running instance instead (e.g. `npm run cf:dev`, which runs
 * the app in the Cloudflare Workers runtime with a local D1 database), use a
 * fresh database and set E2E_BASE_URL and E2E_PASSWORD:
 *   E2E_BASE_URL=http://localhost:8787 E2E_PASSWORD=... npm run test:e2e
 * (the server-restart check is skipped in that mode).
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const EXTERNAL = process.env.E2E_BASE_URL;
const PASSWORD = process.env.E2E_PASSWORD || 'admin123';
const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = EXTERNAL || `http://localhost:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'board-e2e-'));
const DB_PATH = path.join(tmp, 'e2e.db');
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });

if (!EXTERNAL && !fs.existsSync(path.join(ROOT, 'client', 'dist', 'index.html'))) {
  console.error('Build the frontend first: npm run build');
  process.exit(1);
}

let serverProc;
function startServer() {
  if (EXTERNAL) return Promise.resolve();
  return new Promise((resolve, reject) => {
    serverProc = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: { ...process.env, PORT, DB_PATH } });
    serverProc.stdout.on('data', (d) => d.toString().includes('listening') && resolve());
    serverProc.stderr.on('data', (d) => process.stderr.write(d));
    serverProc.on('exit', (code) => code && reject(new Error(`server exited ${code}`)));
  });
}
function stopServer() {
  if (EXTERNAL) return Promise.resolve();
  return new Promise((resolve) => { serverProc.on('exit', resolve); serverProc.kill('SIGTERM'); });
}

const step = (name) => console.log(`\n▸ ${name}`);
const ok = (msg) => console.log(`  ✓ ${msg}`);

(async () => {
  await startServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));

  try {
    step('Sign in');
    await page.goto(`${BASE}/participants`);
    await page.waitForURL('**/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'wrong');
    await page.click('button:has-text("Sign in")');
    await page.getByText('Incorrect username or password').waitFor();
    ok('wrong password rejected');
    await page.fill('#password', PASSWORD);
    await page.click('button:has-text("Sign in")');
    await page.waitForURL('**/participants');
    ok('signed in and returned to the requested page');

    step('1. Add a participant');
    await page.click('text=Add participant');
    await page.click('button:has-text("Add participant")');
    await page.getByText('First name is required.').waitFor();
    ok('validation messages shown for empty form');
    await page.fill('#first_name', 'Rebecca');
    await page.fill('#last_name', 'Lindqvist');
    await page.fill('#email', 'margaret.thompson@example.com'); // duplicate of a sample record
    await page.fill('#position', 'Non-Executive Director');
    await page.fill('#date_of_birth', '1981-08-14');
    await page.fill('#date_joined', '2024-02-01');
    await page.click('button:has-text("Add participant")');
    await page.getByText('Another participant already uses this email address.').waitFor();
    ok('duplicate email rejected');
    await page.fill('#email', 'rebecca.lindqvist@example.org');
    await page.fill('#phone', '0411 222 333');
    await page.click('button:has-text("Add participant")');
    await page.waitForURL(/\/participants\/\d+$/);
    await page.getByRole('heading', { name: /Rebecca Lindqvist/ }).waitFor();
    const participantUrl = page.url();
    ok('participant created and profile opened');

    step('2. Edit the participant');
    await page.click('a:has-text("Edit")');
    await page.fill('#position', 'Treasurer');
    await page.fill('#notes', 'Finance and audit background.');
    await page.click('button:has-text("Save changes")');
    await page.waitForURL(participantUrl);
    await page.getByText('Finance and audit background.').waitFor();
    assert.ok(await page.locator('.title-sub', { hasText: 'Treasurer' }).isVisible());
    ok('changes saved and shown on profile');

    step('Search and filter participants');
    await page.goto(`${BASE}/participants`);
    await page.waitForSelector('tbody tr');
    await page.fill('input[type=search]', 'lindqvist');
    await page.locator('.table-foot', { hasText: 'Showing 1 of' }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 1);
    await page.fill('input[type=search]', '');
    await page.click('.segmented button:has-text("Inactive")');
    await page.waitForFunction(() => [...document.querySelectorAll('tbody .badge')].every((b) => b.textContent === 'Inactive'));
    assert.ok((await page.locator('tbody tr').count()) >= 1);
    assert.equal(await page.locator('tbody tr', { hasText: 'Lindqvist' }).count(), 0);
    ok('search by name and status filter work');

    step('3. Create a meeting');
    await page.goto(`${BASE}/meetings/new`);
    await page.fill('#title', 'Special Meeting — Hall Renovation');
    await page.fill('#date', '2026-10-28');
    await page.fill('#start_time', '18:00');
    await page.fill('#end_time', '17:00');
    await page.fill('#location', 'Meeting Room 2, Level 4');
    await page.click('button:has-text("Clear")');
    await page.click('button:has-text("Create meeting")');
    await page.getByText('Finish time must be after the start time.').waitFor();
    await page.getByText('Select at least one participant to invite.').waitFor();
    ok('time and invitee validation shown');
    await page.fill('#end_time', '19:30');
    await page.fill('#description', '1. Capital works proposal\n2. Resolution');
    for (const name of ['Rebecca Lindqvist', 'Margaret Thompson', 'David Nguyen']) {
      await page.locator('.picker-item', { hasText: name }).click();
    }
    await page.click('button:has-text("Create meeting")');
    await page.waitForURL(/\/meetings\/\d+$/);
    const meetingUrl = page.url();
    await page.waitForSelector('.register-row');
    assert.equal(await page.locator('.register-row').count(), 3);
    ok('meeting created with 3 invitees');

    step('4. Add participants to the meeting');
    await page.click('a:has-text("Edit")');
    await page.locator('.picker-item', { hasText: 'Priya Raman' }).click();
    await page.click('button:has-text("Save changes")');
    await page.waitForURL(meetingUrl);
    await page.locator('.register-row', { hasText: 'Priya Raman' }).waitFor();
    assert.equal(await page.locator('.register-row').count(), 4);
    assert.equal(await page.locator('.register-row.unrecorded').count(), 4);
    ok('4 participants now on the register, all flagged "not recorded"');

    step('5. Record attendance');
    const row = (name) => page.locator('.register-row', { hasText: name });
    await row('Rebecca Lindqvist').locator('button.sb-present').click();
    await page.getByText('All changes saved').waitFor();
    await page.click('button:has-text("Mark remaining 3 present")');
    await page.getByText('3 participants marked present.').waitFor();
    await row('David Nguyen').locator('button.sb-apology').click();
    await row('David Nguyen').locator('text=+ Add note').click();
    await row('David Nguyen').locator('input').fill('Travelling for work.');
    await row('David Nguyen').locator('input').press('Enter');
    await row('Priya Raman').locator('button.sb-late').click();
    await page.waitForFunction(() => !document.body.innerText.includes('Saving…'));
    assert.equal((await page.locator('.rt-rate').textContent()).trim(), '75%');
    await page.screenshot({ path: path.join(SHOTS, 'register.png'), fullPage: true });
    await page.reload();
    await page.waitForSelector('.register-row');
    assert.equal(await row('David Nguyen').locator('button.sb-apology').getAttribute('aria-checked'), 'true');
    assert.equal(await row('David Nguyen').locator('input').inputValue(), 'Travelling for work.');
    assert.equal(await row('Priya Raman').locator('button.sb-late').getAttribute('aria-checked'), 'true');
    assert.equal(await page.locator('.register-row.unrecorded').count(), 0);
    ok('attendance, notes and totals (75%) persist after page reload');

    step('6. Review individual attendance history');
    await page.goto(participantUrl);
    const histRow = page.locator('tr', { hasText: 'Special Meeting — Hall Renovation' });
    await histRow.waitFor();
    assert.ok(await histRow.locator('.badge-present').isVisible());
    assert.equal((await page.locator('.kpi', { hasText: 'Attendance rate' }).locator('.kpi-value').textContent()).trim(), '100%');
    const dl1 = page.waitForEvent('download');
    await page.click('button:has-text("Export history")');
    const historyCsv = fs.readFileSync(await (await dl1).path(), 'utf8');
    assert.match(historyCsv, /Special Meeting — Hall Renovation.*Present/);
    ok('history shows the meeting as Present; history CSV exported');

    step('7. Generate and export reports');
    await page.goto(`${BASE}/reports?range=custom&from=2026-10-27&to=2026-10-29&view=meetings`);
    await page.locator('tbody tr', { hasText: 'Hall Renovation' }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 1);
    const dl2 = page.waitForEvent('download');
    await page.click('button:has-text("Export CSV")');
    const reportCsv = fs.readFileSync(await (await dl2).path(), 'utf8');
    assert.match(reportCsv, /Date,Start,Meeting,Location,Invited/);
    assert.match(reportCsv, /2026-10-28,18:00,Special Meeting — Hall Renovation,"Meeting Room 2, Level 4",4,4,3/);
    ok('date-filtered meeting report exported to CSV');
    await page.click('.tabs button:has-text("By participant")');
    await page.locator('tbody tr', { hasText: 'Lindqvist' }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 4);
    await page.goto(`${BASE}/reports`);
    await page.locator('.kpi', { hasText: 'Meetings held' }).waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'reports.png'), fullPage: true });
    ok('by-member report and overview render');

    step('CSV import and export of participants');
    const csvPath = path.join(tmp, 'import.csv');
    fs.writeFileSync(csvPath, 'First name,Last name,Email,Phone,Role,Date of birth,Date joined,Status,Notes\n' +
      'Sam,Okafor,sam.okafor@example.org,,Parent Helper,03/04/1992,01/09/2025,active,"Imported, with comma"\n' +
      'Dup,Person,rebecca.lindqvist@example.org,,Director,,2025-01-01,active,\n');
    await page.goto(`${BASE}/participants`);
    await page.click('button:has-text("Import CSV")');
    await page.setInputFiles('.modal input[type=file]', csvPath);
    await page.getByText('2 rows found').waitFor();
    await page.click('.modal button:has-text("Import 2 participants")');
    await page.getByText('Imported 1 participant. 1 row skipped.').waitFor();
    await page.click('.modal button:has-text("Close")');
    await page.locator('tbody tr', { hasText: 'Sam Okafor' }).waitFor();
    const dl3 = page.waitForEvent('download');
    await page.click('button:has-text("Export")');
    const exportCsv = fs.readFileSync(await (await dl3).path(), 'utf8');
    assert.match(exportCsv, /Sam,Okafor,sam\.okafor@example\.org,,Parent Helper,1992-04-03,2025-09-01,active,"Imported, with comma"/);
    ok('CSV import (with duplicate skipped, AU dates) and export round-trip');

    step('Duplicate and cancel a meeting');
    await page.goto(meetingUrl);
    await page.click('a:has-text("Duplicate")');
    await page.waitForURL(/duplicate=/);
    assert.equal(await page.inputValue('#title'), 'Special Meeting — Hall Renovation');
    assert.equal(await page.inputValue('#date'), '');
    await page.fill('#date', '2027-03-10');
    await page.fill('#title', 'Special Meeting — Follow-up');
    await page.click('button:has-text("Create meeting")');
    await page.waitForURL(/\/meetings\/\d+$/);
    await page.waitForSelector('.register-row');
    assert.equal(await page.locator('.register-row').count(), 4);
    await page.click('button:has-text("Cancel meeting")');
    await page.click('.modal button:has-text("Cancel meeting")');
    await page.getByText('This meeting was cancelled.').waitFor();
    assert.ok(await page.locator('.status-buttons button').first().isDisabled());
    ok('duplicated with invitees, cancelled, register locked');

    step('Delete confirmation');
    await page.goto(`${BASE}/participants`);
    await page.locator('tr', { hasText: 'Sam Okafor' }).locator('button[title=Delete]').click();
    await page.getByText('Permanently delete').waitFor();
    await page.click('.modal button:has-text("Cancel")');
    assert.equal(await page.locator('tr', { hasText: 'Sam Okafor' }).count(), 1);
    await page.locator('tr', { hasText: 'Sam Okafor' }).locator('button[title=Delete]').click();
    await page.click('.modal button:has-text("Delete participant")');
    await page.getByText('Sam Okafor was deleted.').waitFor();
    ok('delete asks for confirmation; cancel keeps the record, confirm removes it');

    step('Customise organisation, terminology and suggestions');
    await page.goto(`${BASE}/settings`);
    await page.waitForSelector('#organisation_name');
    await page.selectOption('#preset', 'school');
    await page.click('button:has-text("Apply template")');
    await page.click('.modal button:has-text("Apply template")');
    assert.equal(await page.inputValue('#participant_plural'), 'Students');
    assert.match(await page.inputValue('#role_suggestions'), /^Student\n.*Teacher/s);
    await page.fill('#organisation_name', 'Riverside Primary School');
    await page.fill('#role_suggestions', (await page.inputValue('#role_suggestions')) + '\nLibrary Monitor');
    await page.click('button:has-text("Save settings")');
    await page.getByText('Settings saved.').waitFor();
    await page.reload();
    await page.waitForSelector('#organisation_name');
    assert.equal(await page.inputValue('#organisation_name'), 'Riverside Primary School');
    assert.equal(await page.locator('.brand-name').textContent(), 'Riverside Primary School');
    assert.ok(await page.locator('.nav-item', { hasText: 'Students' }).isVisible());
    assert.ok(await page.locator('.nav-item', { hasText: 'Classes' }).isVisible());
    await page.screenshot({ path: path.join(SHOTS, 'settings.png'), fullPage: true });
    ok('school template applied, edited, saved and reflected in the navigation after reload');
    await page.goto(`${BASE}/participants/new`);
    await page.getByRole('heading', { name: 'Add student' }).waitFor();
    const roleOptions = await page.locator('#role-suggestions option').evaluateAll((els) => els.map((e) => e.value));
    assert.ok(roleOptions.includes('Teacher') && roleOptions.includes('Library Monitor'));
    await page.goto(`${BASE}/meetings/new`);
    await page.getByRole('heading', { name: 'New class' }).waitFor();
    const titleOptions = await page.locator('#title-suggestions option').evaluateAll((els) => els.map((e) => e.value));
    assert.ok(titleOptions.includes('Mathematics'));
    ok('forms use the new terms and suggest the customised roles and titles');

    step(EXTERNAL ? 'Persistence across a fresh page load' : 'Persistence across an application restart');
    await stopServer();
    await startServer();
    await page.goto(meetingUrl);
    await page.waitForSelector('.register-row');
    assert.equal(await row('David Nguyen').locator('button.sb-apology').getAttribute('aria-checked'), 'true');
    await page.goto(`${BASE}/`);
    await page.waitForSelector('.kpis');
    await page.locator('.kpi-label', { hasText: 'Classes held' }).waitFor();
    await page.screenshot({ path: path.join(SHOTS, 'dashboard.png'), fullPage: true });
    ok(EXTERNAL ? 'data still present' : 'data and login session survive a server restart');

    assert.deepEqual(pageErrors, [], 'no uncaught browser errors');
    console.log('\nAll end-to-end workflows passed.');
  } catch (err) {
    await page.screenshot({ path: path.join(SHOTS, 'failure.png'), fullPage: true }).catch(() => {});
    console.error('\n✗ E2E failure:', err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
    await stopServer();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();
