/**
 * Server entry point: `npm start` (production) or `npm run dev` (with Vite).
 */
const { openDatabase } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3001;
const db = openDatabase();
const app = createApp(db);

const server = app.listen(PORT, () => {
  console.log(`Board attendance API listening on http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
