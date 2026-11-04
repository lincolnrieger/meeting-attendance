/**
 * /api/settings — sample data management.
 */
const { Hono } = require('hono');
const { seedSampleData } = require('../seed');

async function counts(db) {
  return {
    participants: await db.value('SELECT COUNT(*) FROM participants WHERE is_sample = 1'),
    meetings: await db.value('SELECT COUNT(*) FROM meetings WHERE is_sample = 1'),
  };
}

module.exports = function settingsRoutes() {
  const app = new Hono();

  app.get('/sample-data', async (c) => c.json(await counts(c.var.db)));

  // Remove every record that was created as demonstration data. Records added by
  // the user are kept (their attendance at sample meetings goes with the meeting).
  app.delete('/sample-data', async (c) => {
    const before = await counts(c.var.db);
    await c.var.db.batch([
      ['DELETE FROM meetings WHERE is_sample = 1'],
      ['DELETE FROM participants WHERE is_sample = 1'],
    ]);
    return c.json(before);
  });

  // Re-create the demonstration data (only allowed when no sample records remain).
  app.post('/sample-data', async (c) => {
    const n = await counts(c.var.db);
    if (n.participants + n.meetings > 0) return c.json({ error: 'Sample data is already loaded. Remove it first.' }, 409);
    return c.json(await seedSampleData(c.var.db));
  });

  return app;
};
