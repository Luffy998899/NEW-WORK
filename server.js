const express = require('express');
const cookieSession = require('cookie-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const app = express();
const PORT = process.env.PORT || 3000;

// Small wrapper so rejected promises in async handlers become Express errors.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------- App setup ----------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));

// Stateless signed-cookie session — survives across serverless instances
// (the session lives in the signed cookie, not per-instance memory).
app.use(cookieSession({
  name: 'gb_sess',
  keys: [store.sessionSecret],
  maxAge: 1000 * 60 * 60 * 8, // 8 hours
  httpOnly: true,
  sameSite: 'lax'
}));

// Sections shown on the admin dashboard (key -> friendly label + description).
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

// Load content once per request and expose it (and helpers) to every view.
app.use(wrap(async (req, res, next) => {
  res.locals.content = await store.getContent();
  res.locals.currentPath = req.path;
  res.locals.sections = SECTIONS;
  res.locals.active = '';
  res.locals.activeKey = '';
  next();
}));

// ---------- File uploads ----------
const UPLOAD_DIR = store.uploadDir;
try { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (e) { /* read-only */ }
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
  res.render('index', { content: res.locals.content, query: req.query });
});

app.get('/about-us', (req, res) => {
  res.render('about', { content: res.locals.content });
});

app.get('/blog', (req, res) => {
  res.render('blog', { content: res.locals.content });
});

app.get('/career', (req, res) => {
  res.render('career', { content: res.locals.content });
});

app.get('/services/:slug', (req, res) => {
  const content = res.locals.content;
  const service = ((content.pages && content.pages.services) || []).find(s => s.slug === req.params.slug);
  if (!service) return res.status(404).render('404', { content });
  res.render('service', { content, service });
});

app.get('/contact-us', (req, res) => {
  res.render('contact', { content: res.locals.content, sent: req.query.sent === '1', error: null });
});

app.post('/contact-us', wrap(async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !email) {
    return res.render('contact', { content: res.locals.content, sent: false, error: 'Please provide at least your name and email.' });
  }
  const subs = await store.getSubmissions();
  subs.unshift({
    id: Date.now(),
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    phone: String(phone || '').slice(0, 50),
    message: String(message || '').slice(0, 5000),
    date: new Date().toISOString()
  });
  await store.saveSubmissions(subs);
  res.redirect('/contact-us?sent=1');
}));

// Lightweight inline form used on homepage final CTA.
app.post('/lead', wrap(async (req, res) => {
  const { name, email, phone } = req.body;
  const subs = await store.getSubmissions();
  subs.unshift({
    id: Date.now(),
    name: String(name || '').slice(0, 200),
    email: String(email || '').slice(0, 200),
    phone: String(phone || '').slice(0, 50),
    message: '[Homepage lead form]',
    date: new Date().toISOString()
  });
  await store.saveSubmissions(subs);
  res.redirect('/?lead=1#final-cta');
}));

// ================= ADMIN ROUTES =================
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.authed) return res.redirect('/admin');
  res.render('admin/login', { content: res.locals.content, error: null });
});

app.post('/admin/login', wrap(async (req, res) => {
  const { username, password } = req.body;
  const cfg = await store.getConfig();
  if (username === cfg.username && bcrypt.compareSync(password || '', cfg.passwordHash)) {
    req.session.authed = true;
    req.session.username = username;
    return res.redirect('/admin');
  }
  res.render('admin/login', { content: res.locals.content, error: 'Invalid username or password.' });
}));

app.get('/admin/logout', (req, res) => {
  req.session = null;
  res.redirect('/admin/login');
});

app.get('/admin', requireAuth, wrap(async (req, res) => {
  const subs = await store.getSubmissions();
  res.render('admin/dashboard', {
    content: res.locals.content,
    sections: SECTIONS,
    username: req.session.username,
    submissionCount: subs.length,
    active: 'dashboard'
  });
}));

app.get('/admin/edit/:key', requireAuth, (req, res) => {
  const key = req.params.key;
  const section = SECTIONS.find(s => s.key === key);
  const content = res.locals.content;
  if (!section || !(key in content)) return res.redirect('/admin');
  res.render('admin/edit', {
    content,
    section,
    data: content[key],
    saved: req.query.saved === '1',
    activeKey: key
  });
});

app.post('/admin/edit/:key', requireAuth, wrap(async (req, res) => {
  const key = req.params.key;
  const section = SECTIONS.find(s => s.key === key);
  const content = res.locals.content;
  if (!section || !(key in content)) return res.redirect('/admin');
  let updated;
  try {
    updated = JSON.parse(req.body.payload);
  } catch (e) {
    return res.status(400).send('Invalid data submitted: ' + e.message);
  }
  content[key] = updated;
  const ok = await store.saveContent(content);
  if (!ok) return res.status(500).send('Could not save changes — storage is not writable. See the deployment notes in the README.');
  res.redirect('/admin/edit/' + key + '?saved=1');
}));

// Image upload endpoint (used by the admin editor). Returns JSON with the path.
app.post('/admin/upload', requireAuth, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// Contact submissions
app.get('/admin/submissions', requireAuth, wrap(async (req, res) => {
  const subs = await store.getSubmissions();
  res.render('admin/submissions', { content: res.locals.content, submissions: subs, active: 'submissions' });
}));

app.post('/admin/submissions/delete/:id', requireAuth, wrap(async (req, res) => {
  let subs = await store.getSubmissions();
  subs = subs.filter(s => String(s.id) !== String(req.params.id));
  await store.saveSubmissions(subs);
  res.redirect('/admin/submissions');
}));

// Account / password
app.get('/admin/account', requireAuth, (req, res) => {
  res.render('admin/account', { content: res.locals.content, username: req.session.username, message: null, error: null, active: 'account' });
});

app.post('/admin/account', requireAuth, wrap(async (req, res) => {
  const { currentPassword, newUsername, newPassword, confirmPassword } = req.body;
  const cfg = await store.getConfig();
  if (!bcrypt.compareSync(currentPassword || '', cfg.passwordHash)) {
    return res.render('admin/account', { content: res.locals.content, username: req.session.username, message: null, error: 'Current password is incorrect.', active: 'account' });
  }
  if (newUsername) cfg.username = newUsername.trim();
  if (newPassword) {
    if (newPassword !== confirmPassword) {
      return res.render('admin/account', { content: res.locals.content, username: req.session.username, message: null, error: 'New passwords do not match.', active: 'account' });
    }
    cfg.passwordHash = bcrypt.hashSync(newPassword, 10);
  }
  await store.saveConfig(cfg);
  req.session.username = cfg.username;
  res.render('admin/account', { content: res.locals.content, username: cfg.username, message: 'Account updated successfully.', error: null, active: 'account' });
}));

// 404 fallback
app.use((req, res) => {
  res.status(404).render('404', { content: res.locals.content || {} });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Request error:', err);
  res.status(500).send('Something went wrong. Please try again.');
});

// Start a listening server only when run directly (local / traditional hosts).
// On serverless (Vercel), server.js is required as a module and the exported
// Express app is used as the request handler instead.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`GrowthBox running at http://localhost:${PORT}  (storage: ${store.usingDatabase ? 'database' : 'files'})`);
    console.log(`Admin panel at http://localhost:${PORT}/admin  (default login: admin / admin123)`);
  });
}

module.exports = app;
