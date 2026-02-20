const express = require("express");
const fs = require("fs");
const path = require("path");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;
const CONFIG_PATH = process.env.CONFIG_PATH || "/data/config.json";
const WALLPAPER_DIR = path.join(path.dirname(CONFIG_PATH), "wallpapers");

const healthCache = new Map();
const HEALTH_CACHE_TTL = 60 * 1000; // 60 seconds

app.use(express.json({ limit: "20mb" }));
app.use(morgan("combined", { skip: (req) => req.url.startsWith("/api/health") || req.url.startsWith("/health") || (req.headers["user-agent"]||"").includes("Go-http-client") }));
app.use(express.static(path.join(__dirname, "..", "public")));
// Serve wallpapers from /data/wallpapers (no cache)
app.use("/wallpapers", (req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
}, express.static(WALLPAPER_DIR));

// ── Health check ─────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// ── API: Health check proxy ───────────────────────────────────
app.get("/api/health", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing url" });

  const now = Date.now();
  if (healthCache.has(url)) {
    const { status, timestamp } = healthCache.get(url);
    if (now - timestamp < HEALTH_CACHE_TTL) {
      return res.json({ status });
    }
  }

  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), 3000); // 3 seconds max
    
    let response;
    try {
      // Try HEAD first
      response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow'
      });
    } catch (headError) {
      // Fallback to GET if HEAD fails (some services don't support HEAD)
      response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow'
      });
    }
    
    clearTimeout(timeout);
    
    // Consider 2xx and 3xx as "up", anything else as "down"
    const status = response.status < 400 ? 'up' : 'down';
    const prev = healthCache.get(url)?.status;
    if (prev && prev !== status) console.log(`[Health] ${url} → ${status} (was ${prev})`);
    healthCache.set(url, { status, timestamp: now });
    res.json({ status });
  } catch (e) {
    clearTimeout(timeout);
    const prev = healthCache.get(url)?.status;
    if (prev !== 'down') console.log(`[Health] ${url} → down (${e.message})`);
    healthCache.set(url, { status: 'down', timestamp: now });
    res.json({ status: 'down' });
  }
});

// ── API: Get config ──────────────────────────────────────────
app.get("/api/config", (req, res) => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      res.json(JSON.parse(data));
    } else {
      res.json(null);
    }
  } catch (err) {
    console.error("Error reading config:", err.message);
    res.status(500).json({ error: "Failed to read config" });
  }
});

// ── API: Save config ─────────────────────────────────────────
app.post("/api/config", (req, res) => {
  try {
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Create backup before overwriting
    if (fs.existsSync(CONFIG_PATH)) {
      fs.copyFileSync(CONFIG_PATH, CONFIG_PATH + ".bak");
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (err) {
    console.error("Error saving config:", err.message);
    res.status(500).json({ error: "Failed to save config" });
  }
});

// ── API: Download config as file ─────────────────────────────
app.get("/api/config/download", (req, res) => {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      res.setHeader("Content-Disposition", "attachment; filename=roampage-config.json");
      res.setHeader("Content-Type", "application/json");
      res.sendFile(path.resolve(CONFIG_PATH));
    } else {
      res.status(404).json({ error: "No config found" });
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to download config" });
  }
});

// ── API: Backup system ──────────────────────────────────────
const BACKUP_DIR = path.join(path.dirname(CONFIG_PATH), "backups");
const MAX_BACKUPS = 10;

function createBackup(label, pageData, pageSlug) {
  if (!pageData) return null;
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-");
  const slug = (pageSlug || "page").replace(/[^a-z0-9-]/g, "");
  const name = `${slug}-${label}-${ts}.json`;
  const dest = path.join(BACKUP_DIR, name);
  fs.writeFileSync(dest, JSON.stringify(pageData, null, 2), "utf-8");
  // Prune old backups for this page slug (keep MAX_BACKUPS)
  const prefix = slug + "-";
  const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith(prefix) && f.endsWith(".json")).sort().reverse();
  for (const old of files.slice(MAX_BACKUPS)) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, old)); } catch {}
  }
  const stat = fs.statSync(dest);
  return { name, date: stat.mtime.toISOString(), size: stat.size };
}

// List backups (filtered by page slug)
app.get("/api/backups", (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json([]);
    const slug = req.query.slug || "";
    const prefix = slug ? slug.replace(/[^a-z0-9-]/g, "") + "-" : "";
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith(".json") && (!prefix || f.startsWith(prefix))).sort().reverse();
    const backups = files.map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, date: stat.mtime.toISOString(), size: stat.size };
    });
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create manual backup (for a specific page)
app.post("/api/backups", (req, res) => {
  try {
    const { page, slug } = req.body;
    if (!page) return res.status(400).json({ error: "Missing page data" });
    const backup = createBackup("manual", page, slug);
    if (!backup) return res.status(400).json({ error: "Failed to create backup" });
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Restore backup (returns the page JSON to the client)
app.post("/api/backups/restore", (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing backup name" });
    const src = path.join(BACKUP_DIR, path.basename(name));
    if (!fs.existsSync(src)) return res.status(404).json({ error: "Backup not found" });
    const data = JSON.parse(fs.readFileSync(src, "utf-8"));
    res.json({ ok: true, page: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete backup
app.delete("/api/backups/:name", (req, res) => {
  try {
    const file = path.join(BACKUP_DIR, path.basename(req.params.name));
    if (fs.existsSync(file)) fs.unlinkSync(file);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto-backup every Sunday at 3:00 AM
function scheduleWeeklyBackup() {
  function msUntilNextSunday3AM() {
    const now = new Date();
    const next = new Date(now);
    next.setDate(now.getDate() + (7 - now.getDay()) % 7);
    next.setHours(3, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 7);
    return next - now;
  }
  function slugify(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "page"; }
  function doBackup() {
    try {
      if (fs.existsSync(CONFIG_PATH)) {
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
        const pages = config.pages || [];
        pages.forEach((pg, i) => {
          const slug = pg.slug || slugify(pg.title) || "page-" + i;
          createBackup("auto", pg, slug);
        });
        console.log(`[Backup] Auto-backup: ${pages.length} page(s) saved`);
      }
    } catch (e) { console.error("[Backup] Auto-backup failed:", e.message); }
    setTimeout(doBackup, msUntilNextSunday3AM());
  }
  const msNext = msUntilNextSunday3AM();
  setTimeout(doBackup, msNext);
  console.log(`📦 Next auto-backup in ${Math.round(msNext / 3600000)}h`);
}
scheduleWeeklyBackup();

// ── API: Wallpaper upload (base64) ───────────────────────────
app.post("/api/wallpaper", (req, res) => {
  try {
    const { name, data } = req.body; // name: "desktop.jpg", data: "base64string"
    if (!name || !data) return res.status(400).json({ error: "Missing name or data" });

    // Validate extension
    const ext = path.extname(name).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(ext)) {
      return res.status(400).json({ error: "Unsupported format" });
    }

    // Sanitize filename
    const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_");
    if (!fs.existsSync(WALLPAPER_DIR)) fs.mkdirSync(WALLPAPER_DIR, { recursive: true });

    // Strip data URL prefix if present
    const base64 = data.replace(/^data:image\/[^;]+;base64,/, "");
    fs.writeFileSync(path.join(WALLPAPER_DIR, safe), Buffer.from(base64, "base64"));

    res.json({ ok: true, url: "/wallpapers/" + safe });
  } catch (err) {
    console.error("Wallpaper upload error:", err.message);
    res.status(500).json({ error: "Failed to upload wallpaper" });
  }
});

// ── API: Delete wallpaper ────────────────────────────────────
app.delete("/api/wallpaper/:name", (req, res) => {
  try {
    const safe = req.params.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const fp = path.join(WALLPAPER_DIR, safe);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ── API: Dashboard icons list (cached) ───────────────────────
let iconsCache = null;
let iconsCacheTime = 0;
const ICONS_CACHE_TTL = 24 * 60 * 60 * 1000;

function extractIconNames(tree) {
  const names = new Set();
  if (Array.isArray(tree)) {
    tree.forEach(s => names.add(s.replace(/\.(svg|png|webp)$/i, "")));
  } else {
    for (const [key, val] of Object.entries(tree)) {
      if (Array.isArray(val)) {
        val.forEach(f => { if (typeof f === "string") names.add(f.replace(/\.(svg|png|webp)$/i, "")); });
      }
    }
    if (names.size === 0 && Object.keys(tree).length > 10) {
      Object.keys(tree).forEach(k => names.add(k));
    }
  }
  return [...names].filter(n => !n.endsWith("-light") && !n.endsWith("-dark") && !n.includes("-wordmark")).sort();
}

let formatMap = {};
function buildFormatMap(tree) {
  const map = {};
  if (!tree || Array.isArray(tree)) return map;
  for (const [fmt, files] of Object.entries(tree)) {
    if (!Array.isArray(files)) continue;
    const ext = fmt.toLowerCase();
    files.forEach(f => {
      const name = f.replace(/\.(svg|png|webp)$/i, "");
      if (!map[name]) map[name] = [];
      if (!map[name].includes(ext)) map[name].push(ext);
    });
  }
  return map;
}

app.get("/api/icons", async (req, res) => {
  try {
    if (iconsCache && Date.now() - iconsCacheTime < ICONS_CACHE_TTL) return res.json(iconsCache);
    const urls = [
      "https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons@main/tree.json",
      "https://raw.githubusercontent.com/homarr-labs/dashboard-icons/main/tree.json",
    ];
    let tree = null;
    for (const url of urls) {
      try { const resp = await fetch(url, { signal: AbortSignal.timeout(10000) }); if (resp.ok) { tree = await resp.json(); break; } } catch (e) { console.warn(`Failed: ${url} - ${e.message}`); }
    }
    if (!tree) throw new Error("All icon sources failed");
    formatMap = buildFormatMap(tree);
    const icons = extractIconNames(tree);
    console.log(`Loaded ${icons.length} icons`);
    iconsCache = icons;
    iconsCacheTime = Date.now();
    res.json(icons);
  } catch (err) {
    console.error("Error fetching icons:", err.message);
    if (iconsCache) return res.json(iconsCache);
    res.status(500).json({ error: "Failed to fetch icons" });
  }
});

app.get("/api/icons/:name/url", (req, res) => {
  const name = req.params.name;
  const fmts = formatMap[name] || ["svg"];
  const fmt = fmts.includes("svg") ? "svg" : fmts.includes("png") ? "png" : "webp";
  res.json({ name, format: fmt, url: `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/${fmt}/${name}.${fmt}` });
});

// ── API: Integration proxy ───────────────────────────────────
const integrationCache = new Map();
const INTEGRATION_CACHE_TTL = 30 * 1000; // 30 seconds

async function proxyFetch(url, headers = {}, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { headers, signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!res.ok) { console.error(`[proxyFetch] ${res.status} on ${url}`); throw new Error(`HTTP ${res.status}`); }
    return await res.json();
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

function cachedProxy(key, fetcher) {
  return async (req, res) => {
    const cacheKey = key + ":" + (req.query.url || "");
    const now = Date.now();
    if (integrationCache.has(cacheKey)) {
      const { data, timestamp } = integrationCache.get(cacheKey);
      if (now - timestamp < INTEGRATION_CACHE_TTL) return res.json(data);
    }
    try {
      const data = await fetcher(req);
      integrationCache.set(cacheKey, { data, timestamp: now });
      res.json(data);
    } catch (e) {
      console.error(`[Integration] ${key} error: ${e.message} | url=${req.query.url||""}`);
      res.status(502).json({ error: e.message });
    }
  };
}

// Jellyfin: currently playing sessions
app.get("/api/integration/jellyfin", cachedProxy("jellyfin", async (req) => {
  const { url, apiKey } = req.query;
  if (!url || !apiKey) throw new Error("Missing url or apiKey");
  const headers = {
    "X-Emby-Token": apiKey,
    "Authorization": `MediaBrowser Token="${apiKey}"`,
  };
  const sessions = await proxyFetch(`${url}/Sessions?activeWithinSeconds=960`, headers);
  const playing = sessions.filter(s => s.NowPlayingItem);
  // If nothing playing, show recent active sessions instead
  if (!playing.length) {
    return sessions
      .filter(s => s.UserName)
      .slice(0, 5)
      .map(s => ({
        user: s.UserName,
        title: s.NowPlayingItem?.Name || "Idle",
        series: s.NowPlayingItem?.SeriesName || null,
        type: s.NowPlayingItem?.Type || "idle",
        year: s.NowPlayingItem?.ProductionYear || null,
        player: s.Client || s.DeviceName,
        state: "idle",
        device: s.DeviceName,
      }));
  }
  return playing.map(s => ({
    user: s.UserName,
    title: s.NowPlayingItem.Name,
    series: s.NowPlayingItem.SeriesName || null,
    type: s.NowPlayingItem.Type,
    year: s.NowPlayingItem.ProductionYear,
    player: s.Client || s.DeviceName,
    state: s.PlayState?.IsPaused ? "paused" : "playing",
    device: s.DeviceName,
    sessionId: s.Id,
  }));
}));

// Jellyfin: play/pause control
app.post("/api/integration/jellyfin/command", express.json(), async (req, res) => {
  const { url, apiKey, sessionId, command } = req.body;
  if (!url || !apiKey || !sessionId || !command) return res.status(400).json({ error: "Missing params" });
  if (!["Pause", "Unpause", "Stop", "NextItem", "PreviousItem"].includes(command)) return res.status(400).json({ error: "Invalid command" });
  try {
    const headers = {
      "X-Emby-Token": apiKey,
      "Authorization": `MediaBrowser Token="${apiKey}"`,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${url}/Sessions/${sessionId}/Playing/${command}`, {
      method: "POST",
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);
    // Clear cache so next poll reflects new state
    for (const [key] of integrationCache) { if (key.startsWith("jellyfin:")) integrationCache.delete(key); }
    res.json({ ok: true, status: r.status });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Pi-hole v6: stats (session-based auth)
const piholeSessions = new Map(); // url -> { sid, expires }
async function piholeAuth(url, password) {
  const cached = piholeSessions.get(url);
  if (cached && cached.expires > Date.now()) return cached.sid;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(`${url}/api/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Auth HTTP ${res.status}`);
    const data = await res.json();
    // Pi-hole v6 with no password set returns session without sid — treat as unauthenticated OK
    if (data.session?.valid === false) throw new Error(data.session?.message || "Auth failed");
    const sid = data.session?.sid || null;
    if (sid) piholeSessions.set(url, { sid, expires: Date.now() + (data.session.validity || 300) * 1000 });
    console.log(`[piholeAuth] v6 auth OK for ${url} — sid=${sid ? "yes" : "none (no password)"}`);
    return sid;
  } catch (e) {
    clearTimeout(timer);
    const reason = e.name === "AbortError" ? "timeout (5s)" : e.message;
    console.error(`[piholeAuth] failed for ${url}: ${reason}`);
    throw e;
  }
}

app.get("/api/integration/pihole", cachedProxy("pihole", async (req) => {
  const { url, apiKey } = req.query;
  if (!url) throw new Error("Missing url");
  // Helper: fetch v6 stats, invalidate session cache on 400/401 and retry once
  async function fetchV6(retried = false) {
    const sid = apiKey ? await piholeAuth(url, apiKey) : null;
    const headers = sid ? { "X-FTL-SID": sid } : {};
    try {
      const data = await proxyFetch(`${url}/api/stats/summary`, headers);
      return {
        domains_blocked: data.gravity?.domains_being_blocked || 0,
        queries_today: data.queries?.total || 0,
        blocked_today: data.queries?.blocked || 0,
        percent_blocked: data.queries?.percent_blocked || 0,
        status: data.gravity ? "enabled" : "unknown",
      };
    } catch (e) {
      // Session expired — clear cached SID and retry once
      if (!retried && (e.message.includes("400") || e.message.includes("401"))) {
        piholeSessions.delete(url);
        return fetchV6(true);
      }
      throw e;
    }
  }
  return await fetchV6();
}));

// System info (reads from /proc - Linux only, works inside Docker if mounted)
app.get("/api/integration/system", cachedProxy("system", async (req) => {
  const os = require("os");
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  // CPU usage: compute delta between two /proc/stat reads (100ms apart)
  let cpuPercent = null;
  try {
    function readProcStat() {
      const stat = fs.readFileSync("/proc/stat", "utf-8");
      const line = stat.split("\n")[0].split(/\s+/).slice(1).map(Number);
      return { idle: line[3], total: line.reduce((a, b) => a + b, 0) };
    }
    const s1 = readProcStat();
    await new Promise(r => setTimeout(r, 100));
    const s2 = readProcStat();
    const deltaIdle = s2.idle - s1.idle;
    const deltaTotal = s2.total - s1.total;
    cpuPercent = deltaTotal > 0 ? Math.round((1 - deltaIdle / deltaTotal) * 100) : 0;
  } catch {
    cpuPercent = Math.round(os.loadavg()[0] / cpus.length * 100);
  }

  // Disk usage from / 
  let disk = null;
  try {
    const { execSync } = require("child_process");
    const df = execSync("df -B1 / | tail -1", { encoding: "utf-8" }).trim().split(/\s+/);
    disk = { total: parseInt(df[1]), used: parseInt(df[2]), available: parseInt(df[3]), percent: parseInt(df[4]) };
  } catch {}

  return {
    hostname: os.hostname(),
    platform: os.platform(),
    uptime: os.uptime(),
    cpu: { cores: cpus.length, model: cpus[0]?.model, percent: cpuPercent },
    memory: { total: totalMem, used: usedMem, percent: Math.round(usedMem / totalMem * 100) },
    disk,
  };
}));

// ── API: Weather (Open-Meteo + Nominatim, no API key needed) ─
const weatherCache = new Map(); // "lat,lon:unit" -> { data, timestamp }
const WEATHER_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Search endpoint: returns up to 5 geocoding candidates for disambiguation
app.get("/api/weather/search", async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json([]);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&featuretype=city&addressdetails=1`;
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Roampage/1.0 self-hosted-dashboard" }
    });
    if (!resp.ok) throw new Error("Geocoding failed");
    const results = await resp.json();
    const candidates = results.map(r => ({
      name: r.address?.city || r.address?.town || r.address?.village || r.display_name.split(",")[0].trim(),
      state: r.address?.state || r.address?.county || "",
      country: r.address?.country || "",
      country_code: (r.address?.country_code || "").toUpperCase(),
      lat: r.lat,
      lon: r.lon,
    }));
    res.json(candidates);
  } catch (e) {
    console.error("[Weather/search]", e.message);
    res.status(502).json({ error: e.message });
  }
});

// Forecast endpoint: requires lat+lon (resolved at config time, no ambiguity)
app.get("/api/weather", async (req, res) => {
  const { lat, lon, city, unit = "celsius" } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: "Missing lat/lon" });

  const cacheKey = `${parseFloat(lat).toFixed(4)},${parseFloat(lon).toFixed(4)}:${unit}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < WEATHER_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const tempUnit = unit === "fahrenheit" ? "fahrenheit" : "celsius";
    const meteoUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&temperature_unit=${tempUnit}&timezone=auto&forecast_days=7`;
    const meteoResp = await fetch(meteoUrl, { signal: AbortSignal.timeout(8000) });
    if (!meteoResp.ok) throw new Error("Weather fetch failed");
    const meteo = await meteoResp.json();

    const daily = meteo.daily.time.map((date, i) => ({
      date,
      weathercode: meteo.daily.weathercode[i],
      temp_max: meteo.daily.temperature_2m_max[i],
      temp_min: meteo.daily.temperature_2m_min[i],
    }));

    const data = { city: city || "", lat, lon, daily };
    weatherCache.set(cacheKey, { data, timestamp: Date.now() });
    res.json(data);
  } catch (e) {
    console.error("[Weather]", e.message);
    res.status(502).json({ error: e.message });
  }
});

// ── SPA fallback ─────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🏕 Roampage running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Config: ${CONFIG_PATH}`);
  console.log(`🖼  Wallpapers: ${WALLPAPER_DIR}`);
});
