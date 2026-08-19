const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Bundled (read-only on serverless) data shipped with the repo.
const DATA_DIR = path.join(__dirname, 'data');
const BUNDLED_CONTENT = path.join(DATA_DIR, 'content.json');

// On serverless hosts (Vercel, AWS Lambda) the project filesystem is
// read-only — only /tmp is writable, and it is per-instance & ephemeral.
// Locally we just use ./data. WRITE_DIR is where edits/uploads/config go.
const IS_SERVERLESS = !!(process.env.VERCEL || process.env.AWS_REGION || process.env.NOW_REGION);
const WRITE_DIR = process.env.DATA_DIR || (IS_SERVERLESS ? path.join('/tmp', 'growthbox-data') : DATA_DIR);
const UPLOAD_DIR = IS_SERVERLESS ? path.join('/tmp', 'growthbox-uploads') : path.join(__dirname, 'public', 'uploads');

const W_CONTENT = path.join(WRITE_DIR, 'content.json');
const W_CONFIG = path.join(WRITE_DIR, 'config.json');
const W_SUBMISSIONS = path.join(WRITE_DIR, 'submissions.json');

function ensureDir(dir) {
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* read-only */ }
}
ensureDir(WRITE_DIR);
ensureDir(UPLOAD_DIR);

// ---------- Data helpers ----------
function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}
// Never throw on write — on a read-only FS we just log and carry on so the
// site keeps serving (edits simply won't persist).
function writeJSON(file, data) {
  try {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return true;
  } catch (e) {
    console.warn('writeJSON failed (read-only filesystem?):', file, e.message);
    return false;
  }
}
// Read the writable copy if present, otherwise the bundled read-only copy.
function getContent() {
  if (fs.existsSync(W_CONTENT)) return readJSON(W_CONTENT, {});
  return readJSON(BUNDLED_CONTENT, {});
}
function saveContent(data) {
  return writeJSON(W_CONTENT, data);
}
function getSubmissions() {
  return readJSON(W_SUBMISSIONS, []);
}
function saveSubmissions(data) {
  return writeJSON(W_SUBMISSIONS, data);
}

// Initialise admin config with a default account if missing.
function getConfig() {
  let cfg = readJSON(W_CONFIG, null);
  if (!cfg) {
    cfg = {
      username: process.env.ADMIN_USER || 'admin',
      // default password: admin123 (override with ADMIN_PASSWORD env var)
      passwordHash: bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10),
      sessionSecret: process.env.SESSION_SECRET || 'growthbox-static-secret-change-me'
    };
    writeJSON(W_CONFIG, cfg);
  }
  return cfg;
}
function saveConfig(cfg) {
  return writeJSON(W_CONFIG, cfg);
}
const config = getConfig();

// ---------- App setup ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));
// Stateless signed-cookie session. Unlike an in-memory store, this survives
// across serverless instances (fixes being "logged out" on Vercel) because the
// session lives in the signed cookie itself, not in per-instance memory.
app.use(cookieSession({
  name: 'gb_sess',
  keys: [config.sessionSecret],
  maxAge: 1000 * 60 * 60 * 8, // 8 hours
  httpOnly: true,
  sameSite: 'lax'
}));

// Make content + helpers available to every view.
app.use((req, res, next) => {
  res.locals.content = getContent();
  res.locals.currentPath = req.path;
  res.locals.sections = SECTIONS;
  res.locals.active = '';
  res.locals.activeKey = '';
  next();
});

// ---------- File uploads ----------
// Serve uploaded images from the writable dir (on serverless this is /tmp,
// which is not under /public, so it needs its own static mount).
app.use('/uploads', express.static(UPLOAD_DIR));
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    cb(null, Date.now() + '-' + safe);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// ---------- Auth ----------
function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  return res.redirect('/admin/login');
}

// ================= PUBLIC ROUTES =================
app.get('/', (req, res) => {
  res.render('index', { content: getContent(), query: req.query });
});

app.get('/about-us', (req, res) => {
  res.render('about', { content: getContent() });
});

app.get('/blog', (req, res) => {
  res.render('blog', { content: getContent() });
});

app.get('/career', (req, res) => {
  res.render('career', { content: getContent() });
});

app.get('/services/:slug', (req, res) => {
  const content = getContent();
  const service = (content.pages.services || []).find(s => s.slug === req.params.slug);
  if (!service) return res.status(404).render('404', { content });
  res.render('service', { content, service });
});

app.get('/contact-us', (req, res) => {
  res.render('contact', { content: getContent(), sent: req.query.sent === '1', error: null });
});

app.post('/contact-us', (req, res) => {
  const content = getContent();
  const { name, email, phone, message } = req.body;
  if (!name || !email) {
    return res.render('contact', { content, sent: false, error: 'Please provide at least your name and email.' });
  }
  const subs = getSubmissions();
  subs.unshift({
    id: Date.now(),
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    phone: String(phone || '').slice(0, 50),
    message: String(message || '').slice(0, 5000),
    date: new Date().toISOString()
  });
  saveSubmissions(subs);
  res.redirect('/contact-us?sent=1');
});

// Lightweight inline form used on homepage final CTA.
app.post('/lead', (req, res) => {
  const { name, email, phone } = req.body;
  const subs = getSubmissions();
  subs.unshift({
    id: Date.now(),
    name: String(name || '').slice(0, 200),
    email: String(email || '').slice(0, 200),
    phone: String(phone || '').slice(0, 50),
    message: '[Homepage lead form]',
    date: new Date().toISOString()
  });
  saveSubmissions(subs);
  res.redirect('/?lead=1#final-cta');
});

// ================= ADMIN ROUTES =================
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.authed) return res.redirect('/admin');
  res.render('admin/login', { content: getContent(), error: null });
});

app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  const cfg = getConfig();
  if (username === cfg.username && bcrypt.compareSync(password || '', cfg.passwordHash)) {
    req.session.authed = true;
    req.session.username = username;
    return res.redirect('/admin');
  }
  res.render('admin/login', { content: getContent(), error: 'Invalid username or password.' });
});

app.get('/admin/logout', (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

// Sections shown on the dashboard (key -> friendly label + description).
const SECTIONS = [
  { key: 'site', label: 'Site Settings', desc: 'Brand name, colours, contact details & social links' },
  { key: 'nav', label: 'Navigation Menu', desc: 'Top navigation links' },
  { key: 'hero', label: 'Hero Section', desc: 'Main banner heading, text, buttons & image' },
  { key: 'trustedBy', label: 'Trusted By / Logos', desc: 'Client logo strip' },
  { key: 'services', label: 'Services', desc: 'Spectrum of services cards' },
  { key: 'marquee', label: 'Scrolling Channels', desc: 'The scrolling marquee of channels' },
  { key: 'whyChoose', label: 'Why Choose Us', desc: 'Reasons to choose the agency' },
  { key: 'ctaBanner', label: 'CTA Banner', desc: 'The yellow "Elevate Your Success" banner' },
  { key: 'socialSpark', label: 'Social Media Section', desc: 'Social spark accordion section' },
  { key: 'seoSection', label: 'SEO Section', desc: 'SEO services cards' },
  { key: 'googleAds', label: 'Google Ads Section', desc: 'Google Ads accordion section' },
  { key: 'architects', label: 'Web Development Section', desc: '"Architects of Digital Experiences" features' },
  { key: 'expertise', label: 'Expertise Section', desc: '"Diverse Expertise in Action" cards' },
  { key: 'funnel', label: 'Funnel Section', desc: 'Reach! Engage! Sell! Repeat! diagram labels' },
  { key: 'finalCta', label: 'Final CTA', desc: 'Bottom "Ready to Boost" call to action' },
  { key: 'footer', label: 'Footer', desc: 'Footer text, copyright & link columns' },
  { key: 'pages', label: 'Pages (About & Services)', desc: 'About Us page & individual service pages' }
];

app.get('/admin', requireAuth, (req, res) => {
  const subs = getSubmissions();
  res.render('admin/dashboard', {
    content: getContent(),
    sections: SECTIONS,
    username: req.session.username,
    submissionCount: subs.length,
    active: 'dashboard'
  });
});

app.get('/admin/edit/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  const section = SECTIONS.find(s => s.key === key);
  const content = getContent();
  if (!section || !(key in content)) return res.redirect('/admin');
  res.render('admin/edit', {
    content,
    section,
    data: content[key],
    saved: req.query.saved === '1',
    activeKey: key
  });
});

app.post('/admin/edit/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  const section = SECTIONS.find(s => s.key === key);
  const content = getContent();
  if (!section || !(key in content)) return res.redirect('/admin');
  try {
    const updated = JSON.parse(req.body.payload);
    content[key] = updated;
    saveContent(content);
    res.redirect('/admin/edit/' + key + '?saved=1');
  } catch (e) {
    res.status(400).send('Invalid data submitted: ' + e.message);
  }
});

// Image upload endpoint (used by the admin editor). Returns JSON with the path.
app.post('/admin/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// Contact submissions
app.get('/admin/submissions', requireAuth, (req, res) => {
  const subs = getSubmissions();
  res.render('admin/submissions', { content: getContent(), submissions: subs, active: 'submissions' });
});

app.post('/admin/submissions/delete/:id', requireAuth, (req, res) => {
  let subs = getSubmissions();
  subs = subs.filter(s => String(s.id) !== String(req.params.id));
  saveSubmissions(subs);
  res.redirect('/admin/submissions');
});

// Account / password
app.get('/admin/account', requireAuth, (req, res) => {
  res.render('admin/account', { content: getContent(), username: req.session.username, message: null, error: null, active: 'account' });
});

app.post('/admin/account', requireAuth, (req, res) => {
  const { currentPassword, newUsername, newPassword, confirmPassword } = req.body;
  const cfg = getConfig();
  if (!bcrypt.compareSync(currentPassword || '', cfg.passwordHash)) {
    return res.render('admin/account', { content: getContent(), username: req.session.username, message: null, error: 'Current password is incorrect.', active: 'account' });
  }
  if (newUsername) cfg.username = newUsername.trim();
  if (newPassword) {
    if (newPassword !== confirmPassword) {
      return res.render('admin/account', { content: getContent(), username: req.session.username, message: null, error: 'New passwords do not match.', active: 'account' });
    }
    cfg.passwordHash = bcrypt.hashSync(newPassword, 10);
  }
  saveConfig(cfg);
  req.session.username = cfg.username;
  res.render('admin/account', { content: getContent(), username: cfg.username, message: 'Account updated successfully.', error: null, active: 'account' });
});

// 404 fallback
app.use((req, res) => {
  res.status(404).render('404', { content: getContent() });
});

// Start a listening server only when run directly (local / traditional
// hosts). On serverless (Vercel), server.js is required as a module and the
// exported Express app is used as the request handler instead.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`GrowthBox site running at http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}/admin  (default login: admin / admin123)`);
  });
}

module.exports = app;
