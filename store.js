/* Storage abstraction for GrowthBox.
 *
 * - If a Postgres connection string is provided via env (DATABASE_URL /
 *   POSTGRES_URL / etc.), all content, submissions and admin config are stored
 *   in a single `gb_store(key, value jsonb)` table — this persists across
 *   serverless instances (Vercel) and restarts.
 * - Otherwise it falls back to flat JSON files: ./data locally, or /tmp on a
 *   read-only serverless filesystem (ephemeral, dev/demo only).
 *
 * All public functions are async so the same API works for both backends.
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
const BUNDLED_CONTENT = path.join(DATA_DIR, 'content.json');

const DB_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  '';
const USE_DB = !!DB_URL;

// ---------- shared helpers ----------
function readJSONFile(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function bundledContent() {
  return readJSONFile(BUNDLED_CONTENT, {});
}
function defaultConfig() {
  return {
    username: process.env.ADMIN_USER || 'admin',
    passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10)
  };
}

// ============================================================
//  Flat-file backend (local dev / hosts with a writable disk)
// ============================================================
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_REGION || process.env.NOW_REGION);
const WRITE_DIR = process.env.DATA_DIR || (IS_SERVERLESS ? path.join('/tmp', 'growthbox-data') : DATA_DIR);
const F_CONTENT = path.join(WRITE_DIR, 'content.json');
const F_CONFIG = path.join(WRITE_DIR, 'config.json');
const F_SUBMISSIONS = path.join(WRITE_DIR, 'submissions.json');

function ensureDir(dir) {
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* read-only */ }
}
function writeJSONFile(file, data) {
  try { ensureDir(path.dirname(file)); fs.writeFileSync(file, JSON.stringify(data, null, 2)); return true; }
  catch (e) { console.warn('writeJSONFile failed:', file, e.message); return false; }
}

const fileBackend = {
  async getContent() { return fs.existsSync(F_CONTENT) ? readJSONFile(F_CONTENT, bundledContent()) : bundledContent(); },
  async saveContent(data) { return writeJSONFile(F_CONTENT, data); },
  async getSubmissions() { return readJSONFile(F_SUBMISSIONS, []); },
  async saveSubmissions(data) { return writeJSONFile(F_SUBMISSIONS, data); },
  async getConfig() {
    let cfg = readJSONFile(F_CONFIG, null);
    if (!cfg) { cfg = defaultConfig(); writeJSONFile(F_CONFIG, cfg); }
    return cfg;
  },
  async saveConfig(cfg) { return writeJSONFile(F_CONFIG, cfg); }
};

// ============================================================
//  Postgres backend (persistent, serverless-friendly)
// ============================================================
let _pool = null;
function pool() {
  if (!_pool) {
    const { Pool } = require('pg');
    const local = /localhost|127\.0\.0\.1/.test(DB_URL);
    _pool = new Pool({
      connectionString: DB_URL,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 3
    });
  }
  return _pool;
}

let _ready = null;
function ready() {
  if (!_ready) {
    _ready = (async () => {
      const p = pool();
      await p.query('CREATE TABLE IF NOT EXISTS gb_store (key text PRIMARY KEY, value jsonb NOT NULL)');
      // Seed content from the bundled file on first run.
      const r = await p.query('SELECT 1 FROM gb_store WHERE key = $1', ['content']);
      if (!r.rowCount) {
        await p.query(
          'INSERT INTO gb_store (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO NOTHING',
          ['content', JSON.stringify(bundledContent())]
        );
      }
    })().catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}
async function dbGet(key, fallback) {
  await ready();
  const r = await pool().query('SELECT value FROM gb_store WHERE key = $1', [key]);
  return r.rowCount ? r.rows[0].value : fallback;
}
async function dbSet(key, value) {
  await ready();
  await pool().query(
    'INSERT INTO gb_store (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, JSON.stringify(value)]
  );
  return true;
}

const dbBackend = {
  async getContent() {
    try { return await dbGet('content', bundledContent()); }
    catch (e) { console.error('DB getContent failed, serving bundled:', e.message); return bundledContent(); }
  },
  async saveContent(data) { return dbSet('content', data); },
  async getSubmissions() {
    try { return await dbGet('submissions', []); }
    catch (e) { console.error('DB getSubmissions failed:', e.message); return []; }
  },
  async saveSubmissions(data) { return dbSet('submissions', data); },
  async getConfig() {
    let cfg = await dbGet('config', null);
    if (!cfg) { cfg = defaultConfig(); await dbSet('config', cfg); }
    return cfg;
  },
  async saveConfig(cfg) { return dbSet('config', cfg); }
};

const backend = USE_DB ? dbBackend : fileBackend;

module.exports = {
  usingDatabase: USE_DB,
  isServerless: IS_SERVERLESS,
  sessionSecret: process.env.SESSION_SECRET || 'growthbox-static-secret-change-me',
  uploadDir: IS_SERVERLESS ? path.join('/tmp', 'growthbox-uploads') : path.join(__dirname, 'public', 'uploads'),
  getContent: (...a) => backend.getContent(...a),
  saveContent: (...a) => backend.saveContent(...a),
  getSubmissions: (...a) => backend.getSubmissions(...a),
  saveSubmissions: (...a) => backend.saveSubmissions(...a),
  getConfig: (...a) => backend.getConfig(...a),
  saveConfig: (...a) => backend.saveConfig(...a)
};
