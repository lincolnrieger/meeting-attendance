/**
 * /api/settings — sample data management.
 */
const express = require('express');
const { seedSampleData } = require('../seed');

module.exports = function settingsRouter(db) {
  const router = express.Router();

  router.get('/sample-data', (req, res) => {
    res.json({
      participants: db.prepare('SELECT COUNT(*) FROM participants WHERE is_sample = 1').pluck().get(),
      meetings: db.prepare('SELECT COUNT(*) FROM meetings WHERE is_sample = 1').pluck().get(),
    });
  });

  // Remove every record that was created as demonstration data.
  // Real records added by the user are kept (their attendance at sample meetings is removed with the meeting).
  router.delete('/sample-data', (req, res) => {
    const result = db.transaction(() => ({
      meetings: db.prepare('DELETE FROM meetings WHERE is_sample = 1').run().changes,
      participants: db.prepare('DELETE FROM participants WHERE is_sample = 1').run().changes,
    }))();
    res.json(result);
  });

  // Re-create the demonstration data (only allowed when no sample records remain).
  router.post('/sample-data', (req, res) => {
    const existing = db.prepare('SELECT (SELECT COUNT(*) FROM participants WHERE is_sample = 1) + (SELECT COUNT(*) FROM meetings WHERE is_sample = 1)').pluck().get();
    if (existing > 0) return res.status(409).json({ error: 'Sample data is already loaded. Remove it first.' });
    res.json(seedSampleData(db));
  });

  return router;
};
