[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/browser3ncrypt/QRanalytics)

**QR code generator + link shortener with click & QR-scan analytics**

Pure Cloudflare Worker. Includes password protection, custom branding, and a full analytics dashboard with charts.

## Features

- Clean landing page with live QR generator
- Create short links (random or custom slug)
- **Password-protected** link creation (optional)
- **Custom branding** – logo URL + brand color + display name
- Track **clicks** and **QR scans** separately
- **Analytics dashboard** with charts, top links, and recent activity
- One-click **Deploy to Cloudflare** button
- Uses only Cloudflare KV (no external database)

## Quick Start

```bash
npm install

# Create KV namespace
npx wrangler kv namespace create LINKS
npx wrangler kv namespace create LINKS --preview

# Put the IDs into wrangler.toml

# Optional: set admin password
# In wrangler.toml under [vars]:
# ADMIN_PASSWORD = "your-strong-password"

npm run dev      # local
npm run deploy   # production
```

## Password Protection

Set `ADMIN_PASSWORD` in `wrangler.toml` (or as a secret):

```toml
[vars]
ADMIN_PASSWORD = "super-secret"
```

Or better, as a secret:

```bash
npx wrangler secret put ADMIN_PASSWORD
```

When set:
- Creating links requires the password (`X-Admin-Password` header or form field)
- Saving branding also requires the password
- Leave empty = anyone can create links (fine for personal use)

## Custom Branding

On the homepage you can set:
- **Logo URL** (any publicly reachable image)
- **Brand color** (used for buttons & header)
- **Display name**

Settings are stored in KV and applied site-wide.

## Analytics Dashboard

Visit `/dashboard` for:
- Total links / clicks / QR scans
- 7-day trend chart (Chart.js)
- Top performing links
- Recent activity feed (with country from Cloudflare)

QR codes are generated with `?src=qr` so scans are counted separately from normal clicks.

## API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/shorten` | Optional password | Create short link |
| `GET`  | `/api/stats/:slug` | Public | Stats for one link |
| `GET`  | `/api/dashboard` | Public | Full dashboard data |
| `POST` | `/api/settings` | Optional password | Save branding |
| `GET`  | `/:slug` | – | Redirect + track click |
| `GET`  | `/:slug?src=qr` | – | Redirect + track QR scan |

## Deploy to Cloudflare Button

Replace `YOUR_USERNAME` in `src/index.ts` with your GitHub username, then users can one-click deploy your template.

## Custom Domain

Workers → your worker → Settings → Domains → add `registermysite.com`.

## License
