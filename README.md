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

## Deployment

### Vercel (serverless)
The repo is Vercel-ready: `vercel.json` routes all requests to the Express app
via `api/index.js`. Just import the repo in Vercel and deploy — no build config
needed.

**Important — content persistence on Vercel:** Vercel's filesystem is
**read-only** except `/tmp`, which is per-instance and wiped on every redeploy.
The public site always renders the content committed in `data/content.json`.
Admin edits are written to `/tmp`, so they work **within a running instance but
are not permanent** — a redeploy or a new serverless instance resets them.

To make admin edits permanent you have two options:
1. **Edit locally** and commit `data/content.json` (the site reads it as the
   source of truth), or
2. **Deploy to a host with a persistent disk** — Render, Railway, Fly.io, or a
   VPS — where `data/content.json` stays writable and edits persist across
   restarts (see below).

Optional Vercel environment variables: `ADMIN_USER`, `ADMIN_PASSWORD`,
`SESSION_SECRET` (set these so the admin login isn't the public default).

### Render / Railway / VPS (persistent — recommended for the admin panel)
Any host that runs `node server.js` on a normal (writable) filesystem gives you
a fully persistent admin panel:
- Build command: `npm install`
- Start command: `npm start`
- Set `ADMIN_PASSWORD` and `SESSION_SECRET` env vars.

Here `data/content.json`, `data/submissions.json` and `public/uploads/` are all
writable, so every admin edit persists.

## Notes
- The design and layout replicate the original site; body copy is original
  placeholder text you can rewrite from the admin panel.
- No external database is required — everything runs on flat JSON files, so it
  deploys anywhere Node runs.
