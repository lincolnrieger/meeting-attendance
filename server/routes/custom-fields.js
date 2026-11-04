/**
 * /api/custom-fields — define the extra details recorded for each person.
 */
const { Hono } = require('hono');
const { HttpError } = require('../validation');
const { readJson } = require('../auth');
const { MAX_FIELDS, listFields, validateFieldDef, assertFieldValid } = require('../custom-fields');

async function loadOr404(db, id) {
  const f = await db.first('SELECT id, label, type, sort_order FROM custom_fields WHERE id = ?', [Number(id)]);
  if (!f) throw new HttpError(404, 'Field not found.');
  return f;
}

/** How many people have a value for each field: { [id]: count }. */
async function usage(db) {
  const rows = await db.all(`
    SELECT j.key AS id, COUNT(*) AS n
    FROM participants p, json_each(p.custom_values) j
    GROUP BY j.key
  `);
  return Object.fromEntries(rows.map((r) => [r.id, r.n]));
}

module.exports = function customFieldRoutes() {
  const app = new Hono();

  app.get('/', async (c) => c.json({ fields: await listFields(c.var.db), usage: await usage(c.var.db) }));

  app.post('/', async (c) => {
    const db = c.var.db;
    const fields = await listFields(db);
    if (fields.length >= MAX_FIELDS) throw new HttpError(400, `You can have up to ${MAX_FIELDS} custom fields.`);
    const { value, errors } = validateFieldDef(await readJson(c), fields);
    assertFieldValid(errors);
    const order = fields.reduce((m, f) => Math.max(m, f.sort_order), 0) + 1;
    const { lastId } = await db.run('INSERT INTO custom_fields (label, type, sort_order) VALUES (?, ?, ?)', [value.label, value.type, order]);
    return c.json({ field: await loadOr404(db, lastId) }, 201);
  });

  // Reorder: body { ids: [3, 1, 2] }
  app.put('/order', async (c) => {
    const db = c.var.db;
    const { ids } = await readJson(c);
    const fields = await listFields(db);
    const known = new Set(fields.map((f) => f.id));
    if (!Array.isArray(ids) || ids.length !== known.size || !ids.every((id) => known.has(Number(id)))) {
      throw new HttpError(400, 'The order must list every field exactly once.');
    }
    await db.batch(ids.map((id, i) => ['UPDATE custom_fields SET sort_order = ? WHERE id = ?', [i + 1, Number(id)]]));
    return c.json({ fields: await listFields(db) });
  });

  app.put('/:id', async (c) => {
    const db = c.var.db;
    const existing = await loadOr404(db, c.req.param('id'));
    const others = (await listFields(db)).filter((f) => f.id !== existing.id);
    const { value, errors } = validateFieldDef(await readJson(c), others);
    assertFieldValid(errors);
    await db.run('UPDATE custom_fields SET label = ?, type = ? WHERE id = ?', [value.label, value.type, existing.id]);
    return c.json({ field: await loadOr404(db, existing.id) });
  });

  // Deleting a field also removes everyone's value for it.
  app.delete('/:id', async (c) => {
    const db = c.var.db;
    const existing = await loadOr404(db, c.req.param('id'));
    const path = `$."${existing.id}"`;
    await db.batch([
      ['DELETE FROM custom_fields WHERE id = ?', [existing.id]],
      ['UPDATE participants SET custom_values = json_remove(custom_values, ?) WHERE json_extract(custom_values, ?) IS NOT NULL', [path, path]],
    ]);
    return c.json({ ok: true });
  });

  return app;
};
