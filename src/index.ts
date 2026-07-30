import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
  QRLINKS: KVNamespace;
  SITE_NAME: string;
  SITE_URL: string;
  ADMIN_PASSWORD?: string;
};

type LinkRecord = {
  url: string;
  created: number;
  clicks: number;
  qrScans: number;
  title?: string;
  passwordProtected?: boolean; // future per-link password
};

type SiteSettings = {
  logoUrl?: string;
  brandColor?: string;
  siteName?: string;
};

type ClickEvent = {
  slug: string;
  type: "click" | "qr";
  timestamp: number;
  country?: string;
  userAgent?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("*", cors());

// ---------- Helpers ----------
function generateSlug(length = 7): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function getSettings(env: Bindings): Promise<SiteSettings> {
  const raw = await env.QRLINKS.get("site:settings");
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SiteSettings;
  } catch {
    return {};
  }
}

async function requireAdmin(c: any): Promise<Response | null> {
  const password = c.env.ADMIN_PASSWORD;
  if (!password) return null; // no password configured → open

  const auth = c.req.header("X-Admin-Password") || c.req.query("password");
  if (auth !== password) {
    return c.json({ error: "Unauthorized – admin password required" }, 401);
  }
  return null;
}

// ---------- Landing Page ----------
app.get("/", async (c) => {
  const settings = await getSettings(c.env);
  const siteName = settings.siteName || c.env.SITE_NAME || "RegisterMySite";
  const siteUrl = c.env.SITE_URL || "https://registermysite.com";
  const brandColor = settings.brandColor || "#4f46e5";
  const logoUrl = settings.logoUrl || "";
  const hasPassword = Boolean(c.env.ADMIN_PASSWORD);

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${siteName} – QR Codes & Link Shortener</title>
  <meta name="description" content="QR code generator and link shortener with click & scan analytics." />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    :root { --brand: ${brandColor}; }
    .brand-bg { background-color: var(--brand); }
    .brand-text { color: var(--brand); }
    .brand-border { border-color: var(--brand); }
    body { font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen">
  <!-- Header -->
  <header class="brand-bg text-white">
    <div class="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        ${logoUrl ? `<img src="${logoUrl}" alt="Logo" class="h-10 w-10 rounded-xl object-cover bg-white/20" />` : ""}
        <div>
          <h1 class="text-2xl font-bold tracking-tight">${siteName}</h1>
          <p class="text-white/80 text-sm">QR codes + short links with analytics</p>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <a href="/dashboard" class="text-sm bg-white/10 hover:bg-white/20 border border-white/30 rounded-xl px-4 py-2 transition">Analytics Dashboard</a>
        <a href="https://deploy.workers.cloudflare.com/?url=https://github.com/YOUR_USERNAME/registermysite"
           target="_blank" rel="noopener"
           class="inline-flex items-center gap-2 bg-white text-slate-900 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-slate-100 transition">
          Deploy to Cloudflare
        </a>
      </div>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-6 py-12 space-y-12">
    <!-- Create Short Link + QR -->
    <section class="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
      <h2 class="text-2xl font-semibold mb-6">Create a short link & QR code</h2>

      ${hasPassword ? `
      <div class="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <label class="block text-sm font-medium text-amber-800 mb-1">Admin Password</label>
        <input id="adminPassword" type="password" placeholder="Required to create links"
               class="w-full max-w-sm rounded-lg border border-amber-300 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-400" />
      </div>` : ""}

      <div class="grid md:grid-cols-2 gap-10">
        <div class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1.5">Destination URL</label>
            <input id="url" type="url" placeholder="https://example.com/your-page"
                   class="w-full rounded-xl border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1.5">Custom slug (optional)</label>
            <div class="flex rounded-xl overflow-hidden border border-slate-300">
              <span class="bg-slate-100 px-3 py-3 text-slate-500 text-sm flex items-center">${siteUrl.replace(/^https?:\/\//, "")}/</span>
              <input id="slug" type="text" placeholder="my-link" maxlength="32"
                     class="flex-1 px-3 py-3 outline-none" />
            </div>
          </div>
          <button id="createBtn" onclick="createLink()"
                  class="w-full brand-bg text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition">
            Create Short Link + QR
          </button>

          <div id="result" class="hidden mt-6 p-5 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-3">
            <div>
              <p class="text-xs font-medium text-indigo-600 uppercase tracking-wide">Short URL</p>
              <a id="shortUrl" href="#" target="_blank" class="text-lg font-semibold text-indigo-700 break-all hover:underline"></a>
            </div>
            <div class="flex gap-3">
              <button onclick="copyShort()" class="text-sm bg-white border border-indigo-200 rounded-lg px-3 py-1.5">Copy link</button>
              <button onclick="downloadQR()" class="text-sm bg-white border border-indigo-200 rounded-lg px-3 py-1.5">Download QR</button>
            </div>
          </div>
        </div>

        <div class="flex flex-col items-center justify-center">
          <div class="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-6 w-full max-w-xs aspect-square flex items-center justify-center">
            <canvas id="qrCanvas" class="max-w-full"></canvas>
            <p id="qrPlaceholder" class="text-slate-400 text-sm text-center">QR code will appear here</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Branding (admin) -->
    <section class="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
      <h2 class="text-xl font-semibold mb-4">Custom Branding</h2>
      <p class="text-sm text-slate-500 mb-6">Set a logo URL and brand color. ${hasPassword ? "Requires admin password." : ""}</p>
      <div class="grid sm:grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Logo URL</label>
          <input id="logoUrl" type="url" placeholder="https://..." class="w-full rounded-lg border px-3 py-2" value="${logoUrl}" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Brand Color</label>
          <input id="brandColor" type="color" value="${brandColor}" class="w-full h-10 rounded-lg border cursor-pointer" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Display Name</label>
          <input id="displayName" type="text" value="${siteName}" class="w-full rounded-lg border px-3 py-2" />
        </div>
      </div>
      <button onclick="saveBranding()" class="mt-4 brand-bg text-white font-medium px-5 py-2.5 rounded-xl hover:opacity-90">
        Save Branding
      </button>
      <p id="brandMsg" class="text-sm mt-2 hidden"></p>
    </section>

    <!-- Quick stats lookup -->
    <section class="bg-white rounded-3xl shadow-sm border border-slate-200 p-8">
      <h2 class="text-xl font-semibold mb-4">Quick Stats Lookup</h2>
      <div class="flex gap-3">
        <input id="statsSlug" type="text" placeholder="Enter slug" class="flex-1 rounded-xl border px-4 py-3 outline-none" />
        <button onclick="loadStats()" class="brand-bg text-white font-medium px-6 rounded-xl">View</button>
      </div>
      <div id="statsResult" class="hidden mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4"></div>
    </section>
  </main>

  <footer class="border-t mt-16 py-8 text-center text-sm text-slate-500">
    Built with Cloudflare Workers · 
    <a href="https://github.com/YOUR_USERNAME/registermysite" class="brand-text hover:underline">GitHub</a>
  </footer>

  <script>
    const SITE_URL = "${siteUrl}";
    const HAS_PASSWORD = ${hasPassword};

    function getPassword() {
      const el = document.getElementById('adminPassword');
      return el ? el.value : '';
    }

    async function createLink() {
      const url = document.getElementById('url').value.trim();
      const customSlug = document.getElementById('slug').value.trim() || undefined;
      const btn = document.getElementById('createBtn');
      if (!url) return alert('Please enter a URL');

      btn.disabled = true;
      btn.textContent = 'Creating…';

      try {
        const headers = { 'Content-Type': 'application/json' };
        if (HAS_PASSWORD) headers['X-Admin-Password'] = getPassword();

        const res = await fetch('/api/shorten', {
          method: 'POST',
          headers,
          body: JSON.stringify({ url, customSlug })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');

        const shortUrl = data.shortUrl;
        const qrTarget = shortUrl + '?src=qr';

        document.getElementById('shortUrl').textContent = shortUrl;
        document.getElementById('shortUrl').href = shortUrl;
        document.getElementById('result').classList.remove('hidden');
        document.getElementById('qrPlaceholder').classList.add('hidden');

        await QRCode.toCanvas(document.getElementById('qrCanvas'), qrTarget, {
          width: 240, margin: 2,
          color: { dark: '#1e1b4b', light: '#ffffff' }
        });
        window._lastQR = qrTarget;
        window._lastShort = shortUrl;
      } catch (e) {
        alert(e.message || 'Error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Short Link + QR';
      }
    }

    function copyShort() {
      if (window._lastShort) {
        navigator.clipboard.writeText(window._lastShort);
        alert('Copied!');
      }
    }

    function downloadQR() {
      const canvas = document.getElementById('qrCanvas');
      const a = document.createElement('a');
      a.download = 'qr-code.png';
      a.href = canvas.toDataURL();
      a.click();
    }

    async function saveBranding() {
      const headers = { 'Content-Type': 'application/json' };
      if (HAS_PASSWORD) headers['X-Admin-Password'] = getPassword();

      const res = await fetch('/api/settings', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          logoUrl: document.getElementById('logoUrl').value.trim(),
          brandColor: document.getElementById('brandColor').value,
          siteName: document.getElementById('displayName').value.trim()
        })
      });
      const msg = document.getElementById('brandMsg');
      if (res.ok) {
        msg.textContent = 'Saved! Refresh the page to see changes.';
        msg.className = 'text-sm mt-2 text-green-600';
      } else {
        const data = await res.json();
        msg.textContent = data.error || 'Failed';
        msg.className = 'text-sm mt-2 text-red-600';
      }
      msg.classList.remove('hidden');
    }

    async function loadStats() {
      const slug = document.getElementById('statsSlug').value.trim();
      if (!slug) return;
      const res = await fetch('/api/stats/' + encodeURIComponent(slug));
      const data = await res.json();
      const el = document.getElementById('statsResult');
      if (!res.ok) {
        el.innerHTML = '<p class="text-red-600 col-span-full">' + (data.error || 'Not found') + '</p>';
      } else {
        el.innerHTML = \`
          <div class="bg-slate-50 rounded-xl p-4 text-center">
            <div class="text-2xl font-bold">\${data.clicks}</div>
            <div class="text-xs text-slate-500">Clicks</div>
          </div>
          <div class="bg-slate-50 rounded-xl p-4 text-center">
            <div class="text-2xl font-bold">\${data.qrScans}</div>
            <div class="text-xs text-slate-500">QR Scans</div>
          </div>
          <div class="bg-slate-50 rounded-xl p-4 text-center col-span-2">
            <div class="text-sm font-medium truncate">\${data.url}</div>
            <div class="text-xs text-slate-500">Destination</div>
          </div>\`;
      }
      el.classList.remove('hidden');
    }
  </script>
</body>
</html>`);
});

// ---------- Analytics Dashboard ----------
app.get("/dashboard", async (c) => {
  const settings = await getSettings(c.env);
  const siteName = settings.siteName || c.env.SITE_NAME || "RegisterMySite";
  const brandColor = settings.brandColor || "#4f46e5";

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Analytics – ${siteName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>
    :root { --brand: ${brandColor}; }
    .brand-bg { background-color: var(--brand); }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">
  <header class="brand-bg text-white">
    <div class="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
      <h1 class="text-xl font-bold">${siteName} Analytics</h1>
      <a href="/" class="text-sm bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5">← Back</a>
    </div>
  </header>

  <main class="max-w-6xl mx-auto px-6 py-10 space-y-8">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4" id="summaryCards">
      <div class="bg-white rounded-2xl p-5 border shadow-sm">
        <div class="text-sm text-slate-500">Total Links</div>
        <div class="text-3xl font-bold mt-1" id="totalLinks">–</div>
      </div>
      <div class="bg-white rounded-2xl p-5 border shadow-sm">
        <div class="text-sm text-slate-500">Total Clicks</div>
        <div class="text-3xl font-bold mt-1" id="totalClicks">–</div>
      </div>
      <div class="bg-white rounded-2xl p-5 border shadow-sm">
        <div class="text-sm text-slate-500">QR Scans</div>
        <div class="text-3xl font-bold mt-1" id="totalQR">–</div>
      </div>
      <div class="bg-white rounded-2xl p-5 border shadow-sm">
        <div class="text-sm text-slate-500">Events (24h)</div>
        <div class="text-3xl font-bold mt-1" id="events24h">–</div>
      </div>
    </div>

    <div class="grid lg:grid-cols-2 gap-6">
      <div class="bg-white rounded-2xl p-6 border shadow-sm">
        <h2 class="font-semibold mb-4">Clicks vs QR Scans (Last 7 days)</h2>
        <canvas id="trendChart" height="220"></canvas>
      </div>
      <div class="bg-white rounded-2xl p-6 border shadow-sm">
        <h2 class="font-semibold mb-4">Top Links</h2>
        <div id="topLinks" class="space-y-3 text-sm"></div>
      </div>
    </div>

    <div class="bg-white rounded-2xl p-6 border shadow-sm">
      <h2 class="font-semibold mb-4">Recent Activity</h2>
      <div id="recentEvents" class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-slate-500 border-b">
            <tr>
              <th class="py-2 pr-4">Time</th>
              <th class="py-2 pr-4">Slug</th>
              <th class="py-2 pr-4">Type</th>
              <th class="py-2">Country</th>
            </tr>
          </thead>
          <tbody id="eventsBody"></tbody>
        </table>
      </div>
    </div>
  </main>

  <script>
    async function loadDashboard() {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      if (!res.ok) {
        document.getElementById('topLinks').innerHTML = '<p class="text-red-500">Failed to load</p>';
        return;
      }

      document.getElementById('totalLinks').textContent = data.totalLinks;
      document.getElementById('totalClicks').textContent = data.totalClicks;
      document.getElementById('totalQR').textContent = data.totalQR;
      document.getElementById('events24h').textContent = data.events24h;

      // Top links
      document.getElementById('topLinks').innerHTML = (data.topLinks || []).map(l => \`
        <div class="flex justify-between items-center py-2 border-b last:border-0">
          <a href="/\${l.slug}" class="font-medium text-indigo-600 hover:underline">/\${l.slug}</a>
          <span class="text-slate-500">\${l.clicks} clicks · \${l.qrScans} scans</span>
        </div>
      \`).join('') || '<p class="text-slate-400">No links yet</p>';

      // Recent events
      document.getElementById('eventsBody').innerHTML = (data.recentEvents || []).map(e => \`
        <tr class="border-b last:border-0">
          <td class="py-2 pr-4 text-slate-500">\${new Date(e.timestamp).toLocaleString()}</td>
          <td class="py-2 pr-4 font-medium">\${e.slug}</td>
          <td class="py-2 pr-4">
            <span class="px-2 py-0.5 rounded text-xs \${e.type === 'qr' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
              \${e.type === 'qr' ? 'QR Scan' : 'Click'}
            </span>
          </td>
          <td class="py-2">\${e.country || '–'}</td>
        </tr>
      \`).join('') || '<tr><td colspan="4" class="py-4 text-slate-400">No recent events</td></tr>';

      // Chart
      const labels = data.trend?.labels || [];
      const clicks = data.trend?.clicks || [];
      const qr = data.trend?.qr || [];

      new Chart(document.getElementById('trendChart'), {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'Clicks', data: clicks, borderColor: '#4f46e5', tension: 0.3, fill: false },
            { label: 'QR Scans', data: qr, borderColor: '#a855f7', tension: 0.3, fill: false }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom' } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
      });
    }
    loadDashboard();
  </script>
</body>
</html>`);
});

// ---------- API: Shorten (password protected) ----------
app.post("/api/shorten", async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  try {
    const body = await c.req.json<{ url: string; customSlug?: string }>();
    const { url, customSlug } = body;

    if (!url || !isValidUrl(url)) {
      return c.json({ error: "Valid http/https URL is required" }, 400);
    }

    let slug = customSlug?.trim().replace(/[^a-zA-Z0-9-_]/g, "") || generateSlug();
    if (slug.length < 2 || slug.length > 32) {
      return c.json({ error: "Slug must be 2–32 characters" }, 400);
    }

    const existing = await c.env.QRLINKS.get(`link:${slug}`);
    if (existing && customSlug) {
      return c.json({ error: "This slug is already taken" }, 409);
    }

    if (!customSlug) {
      for (let i = 0; i < 5; i++) {
        if (!(await c.env.QRLINKS.get(`link:${slug}`))) break;
        slug = generateSlug();
      }
    }

    const record: LinkRecord = {
      url,
      created: Date.now(),
      clicks: 0,
      qrScans: 0,
    };

    await c.env.QRLINKS.put(`link:${slug}`, JSON.stringify(record));

    // Maintain list of all slugs for dashboard
    const listRaw = await c.env.QRLINKS.get("meta:slugs");
    const slugs: string[] = listRaw ? JSON.parse(listRaw) : [];
    if (!slugs.includes(slug)) {
      slugs.push(slug);
      await c.env.QRLINKS.put("meta:slugs", JSON.stringify(slugs.slice(-500))); // keep last 500
    }

    const siteUrl = (c.env.SITE_URL || "https://registermysite.com").replace(/\/$/, "");
    return c.json({
      slug,
      shortUrl: `${siteUrl}/${slug}`,
      qrTarget: `${siteUrl}/${slug}?src=qr`,
    });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Failed to create short link" }, 500);
  }
});

// ---------- API: Settings / Branding ----------
app.post("/api/settings", async (c) => {
  const denied = await requireAdmin(c);
  if (denied) return denied;

  try {
    const body = await c.req.json<SiteSettings>();
    const current = await getSettings(c.env);
    const next: SiteSettings = {
      logoUrl: body.logoUrl || current.logoUrl,
      brandColor: body.brandColor || current.brandColor,
      siteName: body.siteName || current.siteName,
    };
    await c.env.QRLINKS.put("site:settings", JSON.stringify(next));
    return c.json({ ok: true, settings: next });
  } catch {
    return c.json({ error: "Failed to save settings" }, 500);
  }
});

app.get("/api/settings", async (c) => {
  const settings = await getSettings(c.env);
  return c.json(settings);
});

// ---------- API: Single link stats ----------
app.get("/api/stats/:slug", async (c) => {
  const slug = c.req.param("slug");
  const raw = await c.env.QRLINKS.get(`link:${slug}`);
  if (!raw) return c.json({ error: "Link not found" }, 404);

  const record = JSON.parse(raw) as LinkRecord;
  return c.json({
    slug,
    url: record.url,
    clicks: record.clicks || 0,
    qrScans: record.qrScans || 0,
    created: record.created,
  });
});

// ---------- API: Dashboard data ----------
app.get("/api/dashboard", async (c) => {
  try {
    const listRaw = await c.env.QRLINKS.get("meta:slugs");
    const slugs: string[] = listRaw ? JSON.parse(listRaw) : [];

    let totalClicks = 0;
    let totalQR = 0;
    const topLinks: { slug: string; clicks: number; qrScans: number }[] = [];

    for (const slug of slugs.slice(-100)) {
      const raw = await c.env.QRLINKS.get(`link:${slug}`);
      if (!raw) continue;
      const r = JSON.parse(raw) as LinkRecord;
      totalClicks += r.clicks || 0;
      totalQR += r.qrScans || 0;
      topLinks.push({ slug, clicks: r.clicks || 0, qrScans: r.qrScans || 0 });
    }

    topLinks.sort((a, b) => b.clicks + b.qrScans - (a.clicks + a.qrScans));

    // Recent events
    const eventsRaw = await c.env.QRLINKS.get("meta:events");
    const events: ClickEvent[] = eventsRaw ? JSON.parse(eventsRaw) : [];
    const now = Date.now();
    const day = 86400000;
    const events24h = events.filter((e) => now - e.timestamp < day).length;

    // Build 7-day trend
    const labels: string[] = [];
    const clicksData: number[] = [];
    const qrData: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * day);
      labels.push(d.toLocaleDateString(undefined, { weekday: "short" }));
      const dayStart = new Date(d).setHours(0, 0, 0, 0);
      const dayEnd = dayStart + day;
      clicksData.push(events.filter((e) => e.type === "click" && e.timestamp >= dayStart && e.timestamp < dayEnd).length);
      qrData.push(events.filter((e) => e.type === "qr" && e.timestamp >= dayStart && e.timestamp < dayEnd).length);
    }

    return c.json({
      totalLinks: slugs.length,
      totalClicks,
      totalQR,
      events24h,
      topLinks: topLinks.slice(0, 10),
      recentEvents: events.slice(0, 30),
      trend: { labels, clicks: clicksData, qr: qrData },
    });
  } catch (err) {
    console.error(err);
    return c.json({ error: "Dashboard failed" }, 500);
  }
});

// ---------- Redirect + Analytics ----------
app.get("/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (["api", "dashboard", "favicon.ico", "robots.txt"].includes(slug)) {
    return c.notFound();
  }

  const raw = await c.env.QRLINKS.get(`link:${slug}`);
  if (!raw) return c.text("Short link not found", 404);

  const record = JSON.parse(raw) as LinkRecord;
  const isQR = c.req.query("src") === "qr";

  if (isQR) {
    record.qrScans = (record.qrScans || 0) + 1;
  } else {
    record.clicks = (record.clicks || 0) + 1;
  }

  const event: ClickEvent = {
    slug,
    type: isQR ? "qr" : "click",
    timestamp: Date.now(),
    country: c.req.header("cf-ipcountry") || undefined,
    userAgent: c.req.header("user-agent")?.slice(0, 120),
  };

  c.executionCtx.waitUntil(
    (async () => {
      await c.env.QRLINKS.put(`link:${slug}`, JSON.stringify(record));

      // Append to recent events (keep last 200)
      const eventsRaw = await c.env.QRLINKS.get("meta:events");
      const events: ClickEvent[] = eventsRaw ? JSON.parse(eventsRaw) : [];
      events.unshift(event);
      await c.env.QRLINKS.put("meta:events", JSON.stringify(events.slice(0, 200)));
    })()
  );

  return c.redirect(record.url, 302);
});

export default app;
