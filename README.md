# GrowthBox — Creative & Digital Marketing Agency Website

A pixel-faithful clone of the GrowthBox agency website (black / white / yellow
creative-agency design) built with **Node.js + Express + EJS**, backed by a
complete **admin panel / CMS** so every piece of content on the site can be
edited without touching code.

## Features

### Public website
- **Homepage** with all sections: hero, trusted-by logo strip, services grid,
  scrolling marquees, "why choose us", CTA banner, social-media accordion,
  SEO cards, Google Ads accordion, web-development feature list, expertise
  cards, the "Reach! Engage! Sell! Repeat!" funnel and a lead-capture CTA.
- **About Us** page (heading, mission, animated stats, values).
- **Service pages** — Social Media Marketing, SEO, Google Ads, Web Development
  (each at `/services/<slug>`, all editable).
- **Contact Us** page with a working contact form and office details.
- Fully **responsive** (desktop / tablet / mobile) with a mobile menu.

### Admin panel (`/admin`)
- Secure login (session + bcrypt-hashed password).
- **Every section is editable** through auto-generated forms — edit any text,
  button label, link, colour, list item, service card, accordion entry, etc.
- **Add / remove** list items (services, nav links, logos, FAQ/accordion
  items, service pages…) with one click.
- **Image uploads** for the hero, section graphics and logo (stored in
  `public/uploads`).
- **Brand controls** — change site name, primary/dark colours, contact
  details and social links; changes apply site-wide instantly.
- **Contact leads** — view and delete every submission from the contact and
  homepage lead forms.
- **Account settings** — change the admin username and password.

## Getting started

```bash
npm install
npm start
```

Then open:
- Website → http://localhost:3000
- Admin panel → http://localhost:3000/admin

**Default admin login:** `admin` / `admin123`
Change it immediately from **Admin → Account** after first login.

Set a custom port with `PORT=8080 npm start`.

## How content is stored

| File | Purpose |
|------|---------|
| `data/content.json` | All website content (committed — this is the source of truth). |
| `data/config.json`  | Admin credentials & session secret (auto-generated on first run, git-ignored). |
| `data/submissions.json` | Contact-form leads (auto-generated, git-ignored). |
| `public/uploads/`   | Images uploaded via the admin panel (git-ignored). |

Editing a section in the admin panel writes straight back to
`data/content.json`, so your changes persist across restarts.

## Project structure

```
server.js              Express app, routes, auth, uploads
data/content.json      Editable website content
views/
  partials/            head, header, footer, icon set, admin sidebar
  index.ejs            Homepage
  about.ejs            About page
  service.ejs          Individual service page
  contact.ejs          Contact page
  404.ejs
  admin/               login, dashboard, edit, submissions, account
public/
  css/style.css        Public site styles
  css/admin.css        Admin panel styles
  js/main.js           Menu + accordions
  js/form-builder.js   JSON-driven admin form generator
  images/              Brand SVG graphics
```

## Storage

Content, contact submissions and the admin account are read/written through
`store.js`, which has two backends chosen automatically:

- **Database (Postgres)** — used when a connection string env var is present
  (`DATABASE_URL` or `POSTGRES_URL`). Everything is stored in a single
  `gb_store(key, value jsonb)` table, seeded on first run from the bundled
  `data/content.json`. This is what makes admin edits **persist on serverless
  hosts like Vercel**.
- **Flat files** — used when no database is configured (local development, or a
  host with a writable disk). Writes go to `./data`, or `/tmp` on a read-only
  serverless filesystem (ephemeral).

## Deployment

### Vercel + a free Postgres database (recommended — makes admin edits stick)
Vercel's filesystem is ephemeral, so admin edits only persist when a database is
attached. Setup takes ~2 minutes:

1. Import the repo in Vercel and deploy (it's Vercel-ready via `vercel.json` +
   `api/index.js`).
2. In your Vercel project → **Storage** → **Create Database** → choose
   **Postgres** (Neon). Click **Connect** to link it to the project. Vercel
   automatically adds the `POSTGRES_URL` / `DATABASE_URL` environment variables.
3. Also add these environment variables (Project → Settings → Environment
   Variables):
   - `ADMIN_PASSWORD` — your admin password (so it isn't the default)
   - `SESSION_SECRET` — any long random string
4. **Redeploy.** Done — the app creates its table, seeds it from
   `data/content.json`, and every admin edit now persists across visits and
   redeploys.

> Any Postgres works (Neon, Supabase, Railway, etc.) — just set `DATABASE_URL`
> to its connection string.

**Note on image uploads:** uploaded image *files* still go to `/tmp` on Vercel
and are not permanent. Text/content edits (the bulk of the admin panel) persist
in the database. For permanent image uploads, host the images elsewhere and
paste their URLs into the image fields, or deploy to a host with a disk (below).

### Your own server + domain + HTTPS (one command)
To host on your own VPS (Ubuntu/Debian) under your domain with a free
auto-renewing TLS certificate, use the included `deploy.sh`:

1. Point your domain's DNS **A record** (and `www`, if you want it) at the
   server's public IP. Make sure ports **80** and **443** are open.
2. Copy the project to the server (e.g. `git clone <repo>` or `scp`), then run:
   ```bash
   sudo bash deploy.sh
   ```
3. Answer the prompts (domain, email, admin password, optional `DATABASE_URL`).

The script installs Node.js, nginx and certbot; runs the app as a systemd
service (auto-restart, starts on boot); configures nginx as a reverse proxy for
your domain; and obtains + installs a **Let's Encrypt certificate** with
automatic renewal. When it finishes your site is live at `https://yourdomain`
and the admin panel at `https://yourdomain/admin`.

Manage it afterwards with:
```bash
systemctl status growthbox      # status
journalctl -u growthbox -f       # live logs
systemctl restart growthbox      # restart (e.g. after git pull)
```
Secrets live in `/etc/growthbox.env`. On a VPS the file backend is fully
persistent (`data/`, `public/uploads/`); set `DATABASE_URL` there if you prefer
Postgres.

### Render / Railway / VPS (persistent disk, no database needed)
Any host that runs `node server.js` on a writable filesystem works with the
flat-file backend:
- Build command: `npm install`
- Start command: `npm start`
- Env vars: `ADMIN_PASSWORD`, `SESSION_SECRET`
(You can still point it at a database by setting `DATABASE_URL`.)

### Environment variables (summary)
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` / `POSTGRES_URL` | Postgres connection string → enables the database backend |
| `ADMIN_USER` | Admin username (default `admin`) |
| `ADMIN_PASSWORD` | Admin password (default `admin123` — change it!) |
| `SESSION_SECRET` | Secret used to sign the login cookie |

## Notes
- The design and layout replicate the original site; body copy is original
  placeholder text you can rewrite from the admin panel.
