/**
 * demo-api.js — Intercepts all /api/* fetch calls for GitHub Pages demo mode.
 * Loaded BEFORE app.js so this script runs first.
 *
 * Responsibilities:
 *  1. Intercept window.fetch and route /api/* calls to sessionStorage or fake responses
 *  2. Block specific actions via capture-phase click listener
 *  3. Fix history.replaceState for correct URLs on GitHub Pages subdirectory hosting
 *  4. Inject the demo banner
 */

// ── 1. Demo config ─────────────────────────────────────────────────────────

const DEMO_CONFIG_KEY     = 'roampage-demo-config';
const DEMO_VERSION_KEY    = 'roampage-demo-version';

const DEFAULT_DEMO_CONFIG = {
  currentPage: 0,
  logoUrl: 'logo.png',
  pages: [
    {
      id: 'page-demo-home',
      title: 'Home',
      slug: 'home',
      columns: 2,
      categories: [
        {
          title: 'Médias',
          services: [
            {
              id: 'svc-jellyfin',
              name: 'Jellyfin',
              url: 'http://jellyfin.local:8096',
              desc: 'Serveur multimédia',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/jellyfin.png',
              servers: [{ label: 'Web', url: 'http://jellyfin.local:8096' }]
            },
            {
              id: 'svc-plex',
              name: 'Plex',
              url: 'http://plex.local:32400',
              desc: 'Media streaming',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/plex.png',
              servers: [{ label: 'Web', url: 'http://plex.local:32400' }]
            }
          ]
        },
        {
          title: 'Monitoring',
          services: [
            {
              id: 'svc-grafana',
              name: 'Grafana',
              url: 'http://grafana.local:3000',
              desc: 'Dashboards & métriques',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/grafana.png',
              servers: [{ label: 'Web', url: 'http://grafana.local:3000' }]
            },
            {
              id: 'svc-portainer',
              name: 'Portainer',
              url: 'http://portainer.local:9000',
              desc: 'Gestion des containers Docker',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/portainer.png',
              servers: [{ label: 'Web', url: 'http://portainer.local:9000' }]
            }
          ]
        },
        {
          title: 'Infrastructure',
          services: [
            {
              id: 'svc-proxmox',
              name: 'Proxmox',
              url: 'https://proxmox.local:8006',
              desc: 'Hyperviseur',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/proxmox.png',
              servers: [{ label: 'UI', url: 'https://proxmox.local:8006' }]
            },
            {
              id: 'svc-pihole',
              name: 'Pi-hole',
              url: 'http://pihole.local/admin',
              desc: 'Blocage de publicités DNS',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/pi-hole.png',
              servers: [{ label: 'Admin', url: 'http://pihole.local/admin' }]
            }
          ]
        },
        {
          title: 'Stockage',
          services: [
            {
              id: 'svc-nextcloud',
              name: 'Nextcloud',
              url: 'https://nextcloud.local',
              desc: 'Cloud personnel',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/nextcloud.png',
              servers: [{ label: 'Web', url: 'https://nextcloud.local' }]
            },
            {
              id: 'svc-syncthing',
              name: 'Syncthing',
              url: 'http://syncthing.local:8384',
              desc: 'Synchronisation de fichiers',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/syncthing.png',
              servers: [{ label: 'Web', url: 'http://syncthing.local:8384' }]
            }
          ]
        }
      ]
    },
    {
      id: 'page-demo-dev',
      title: 'Dev & Tools',
      slug: 'dev-tools',
      columns: 2,
      categories: [
        {
          title: 'Développement',
          services: [
            {
              id: 'svc-gitea',
              name: 'Gitea',
              url: 'http://gitea.local:3000',
              desc: 'Forge Git auto-hébergée',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/gitea.png',
              servers: [{ label: 'Web', url: 'http://gitea.local:3000' }]
            },
            {
              id: 'svc-code-server',
              name: 'Code Server',
              url: 'http://code.local:8080',
              desc: 'VS Code dans le navigateur',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/vscode.png',
              servers: [{ label: 'IDE', url: 'http://code.local:8080' }]
            }
          ]
        },
        {
          title: 'Outils',
          services: [
            {
              id: 'svc-uptime',
              name: 'Uptime Kuma',
              url: 'http://uptime.local:3001',
              desc: 'Monitoring de disponibilité',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/uptime-kuma.png',
              servers: [{ label: 'Web', url: 'http://uptime.local:3001' }]
            },
            {
              id: 'svc-vaultwarden',
              name: 'Vaultwarden',
              url: 'https://vault.local',
              desc: 'Gestionnaire de mots de passe',
              icon: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/vaultwarden.png',
              servers: [{ label: 'Web', url: 'https://vault.local' }]
            }
          ]
        }
      ]
    }
  ]
};

// ── 2. SessionStorage helpers ──────────────────────────────────────────────

function demoGetConfig() {
  try {
    const stored = sessionStorage.getItem(DEMO_CONFIG_KEY);
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return JSON.parse(JSON.stringify(DEFAULT_DEMO_CONFIG));
}

function demoGetVersion() {
  return parseInt(sessionStorage.getItem(DEMO_VERSION_KEY) || '1', 10);
}

function demoSaveConfig(cfg) {
  try {
    sessionStorage.setItem(DEMO_CONFIG_KEY, JSON.stringify(cfg));
    const v = demoGetVersion() + 1;
    sessionStorage.setItem(DEMO_VERSION_KEY, String(v));
    return v;
  } catch (_) {
    return demoGetVersion();
  }
}

// ── 3. Fake Response factory ───────────────────────────────────────────────

function fakeResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// ── 4. Fetch interceptor ───────────────────────────────────────────────────

var _origFetch = window.fetch.bind(window);

window.fetch = function demoFetch(input, init) {
  var url    = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
  var method = init && init.method ? init.method.toUpperCase() : 'GET';

  // Only intercept /api/* paths
  if (url.indexOf('/api/') === -1) {
    return _origFetch(input, init);
  }

  // Normalize to just the path (strip origin if present)
  var path = url;
  try { path = new URL(url, location.href).pathname; } catch (_) {}

  // ── GET /api/config
  if (method === 'GET' && path === '/api/config') {
    var cfg = demoGetConfig();
    cfg._version = demoGetVersion();
    return Promise.resolve(fakeResponse(cfg));
  }

  // ── POST /api/config
  if (method === 'POST' && path === '/api/config') {
    try {
      var body = JSON.parse(init && init.body);
      // Remove server-injected fields that must not persist
      delete body._version;
      delete body._auth;
      var newVersion = demoSaveConfig(body);
      return Promise.resolve(fakeResponse({ ok: true, _version: newVersion }));
    } catch (_) {
      return Promise.resolve(fakeResponse({ error: 'Invalid body' }, 400));
    }
  }

  // ── GET /api/version
  if (method === 'GET' && path === '/api/version') {
    return Promise.resolve(fakeResponse({ version: '(démo)' }));
  }

  // ── GET /api/health?url=...
  if (method === 'GET' && path === '/api/health') {
    return Promise.resolve(fakeResponse({ status: 'unknown' }));
  }

  // ── GET /api/icons
  if (method === 'GET' && path === '/api/icons') {
    return Promise.resolve(fakeResponse([]));
  }

  // ── GET /api/icons/:name/url
  if (method === 'GET' && /^\/api\/icons\/[^/]+\/url$/.test(path)) {
    return Promise.resolve(fakeResponse({ url: '' }));
  }

  // ── POST /api/integration/system  — fake homelab stats
  if (method === 'POST' && path === '/api/integration/system') {
    return Promise.resolve(fakeResponse({
      hostname: 'homelab-server',
      platform: 'linux',
      uptime: 864000,
      cpu:    { cores: 8, model: 'Intel Core i5-8500 @ 3.00GHz', percent: 23 },
      memory: { total: 17179869184, used: 9663676416, percent: 56 },
      disk:   { total: 1099511627776, used: 419669278720, available: 679842349056, percent: '38%' }
    }));
  }

  // ── GET /api/auth/session — always globally unlocked in demo
  if (method === 'GET' && path === '/api/auth/session') {
    return Promise.resolve(fakeResponse({ unlockedPages: 'global' }));
  }

  // ── POST /api/auth/unlock
  if (method === 'POST' && path === '/api/auth/unlock') {
    return Promise.resolve(fakeResponse({ ok: true }));
  }

  // ── POST /api/auth/lock
  if (method === 'POST' && path === '/api/auth/lock') {
    return Promise.resolve(fakeResponse({ ok: true }));
  }

  // ── POST /api/auth/setpin — accept but do nothing persistent
  if (method === 'POST' && path === '/api/auth/setpin') {
    return Promise.resolve(fakeResponse({ ok: true, _version: demoGetVersion() }));
  }

  // ── Weather: forward directly to Open-Meteo / Nominatim (both support CORS)
  if (path === '/api/weather/search') {
    var q = new URL(url, location.href).searchParams.get('q') || '';
    if (!q || q.length < 2) return Promise.resolve(fakeResponse([]));
    var nominatimUrl = 'https://nominatim.openstreetmap.org/search?q=' +
      encodeURIComponent(q) +
      '&format=json&limit=5&featuretype=city&addressdetails=1';
    return _origFetch(nominatimUrl).then(function(r) { return r.json(); }).then(function(results) {
      var candidates = results.map(function(r) {
        return {
          name:         r.address && (r.address.city || r.address.town || r.address.village) || r.display_name.split(',')[0].trim(),
          state:        (r.address && (r.address.state || r.address.county)) || '',
          country:      (r.address && r.address.country) || '',
          country_code: ((r.address && r.address.country_code) || '').toUpperCase(),
          lat:          r.lat,
          lon:          r.lon
        };
      });
      return fakeResponse(candidates);
    }).catch(function() { return fakeResponse([]); });
  }

  if (path === '/api/weather') {
    var params = new URL(url, location.href).searchParams;
    var lat  = params.get('lat');
    var lon  = params.get('lon');
    var city = params.get('city') || '';
    var unit = params.get('unit') === 'fahrenheit' ? 'fahrenheit' : 'celsius';
    if (!lat || !lon) return Promise.resolve(fakeResponse({ error: 'Missing lat/lon' }, 400));
    var meteoUrl = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat +
      '&longitude=' + lon +
      '&daily=weathercode,temperature_2m_max,temperature_2m_min' +
      '&temperature_unit=' + unit +
      '&timezone=auto&forecast_days=7';
    return _origFetch(meteoUrl).then(function(r) { return r.json(); }).then(function(meteo) {
      var daily = meteo.daily.time.map(function(date, i) {
        return {
          date:        date,
          weathercode: meteo.daily.weathercode[i],
          temp_max:    meteo.daily.temperature_2m_max[i],
          temp_min:    meteo.daily.temperature_2m_min[i]
        };
      });
      return fakeResponse({ city: city, lat: lat, lon: lon, daily: daily });
    }).catch(function() {
      return fakeResponse({ error: 'Weather unavailable in demo mode' }, 502);
    });
  }

  // ── Everything else (backups, config/download, wallpaper, image, etc.)
  return Promise.resolve(fakeResponse({ error: 'Non disponible en mode démo' }, 400));
};

// ── 5. Action interceptor (capture phase) ─────────────────────────────────

var BLOCKED_ACTIONS = { 'add-page': 1, 'json-pick-export': 1, 'json-pick-import': 1, 'open-backups': 1, 'upload-wallpaper': 1 };

function showDemoToast() {
  var existing = document.getElementById('demo-toast');
  if (existing) { existing.remove(); }
  var toast = document.createElement('div');
  toast.id = 'demo-toast';
  toast.style.cssText = [
    'position:fixed', 'bottom:24px', 'left:50%', 'transform:translateX(-50%)',
    'background:#1e2030', 'border:1px solid rgba(139,92,246,.4)', 'color:#c4b5fd',
    'padding:10px 18px', 'border-radius:10px', 'font-size:13px', 'font-weight:600',
    'z-index:99999', 'box-shadow:0 4px 20px rgba(0,0,0,.5)',
    'font-family:"DM Sans",sans-serif', 'white-space:nowrap', 'pointer-events:none'
  ].join(';');
  toast.textContent = 'Cette fonctionnalité n\u2019est pas disponible en mode démo.';
  document.body.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 3500);
}

document.addEventListener('click', function(e) {
  var el = e.target;
  while (el && el !== document) {
    if (el.dataset && el.dataset.action && BLOCKED_ACTIONS[el.dataset.action]) {
      e.stopImmediatePropagation();
      e.preventDefault();
      showDemoToast();
      return;
    }
    el = el.parentElement;
  }
}, true);

// Also block the wallpaper file input via change event
document.addEventListener('change', function(e) {
  if (e.target && e.target.dataset && e.target.dataset.action === 'upload-wallpaper') {
    e.stopImmediatePropagation();
    e.preventDefault();
    showDemoToast();
  }
}, true);

// ── 6. Fix history.replaceState for GitHub Pages subdirectory ──────────────
// app.js calls history.replaceState(null,"","/slug") which breaks on subdir hosting.
// We prefix the path with the subdirectory (e.g. /roampage).

var _demoBasePath = (function() {
  var s = document.currentScript;
  if (s && s.src) {
    try {
      var p = new URL(s.src).pathname;          // e.g. /roampage/demo-api.js
      return p.replace(/\/[^/]+$/, '');         // → /roampage
    } catch (_) {}
  }
  return location.pathname.replace(/\/$/, '').replace(/\/[^/]*$/, '') || '';
}());

var _origReplaceState = history.replaceState.bind(history);
history.replaceState = function(state, title, url) {
  if (url && typeof url === 'string' && url.charAt(0) === '/' && _demoBasePath) {
    // Only prefix if it doesn't already start with the base path
    if (url.indexOf(_demoBasePath + '/') !== 0 && url !== _demoBasePath) {
      url = _demoBasePath + url;
    }
  }
  return _origReplaceState(state, title, url);
};

// ── 7. Demo banner ─────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
  if (sessionStorage.getItem('demo-banner-closed')) return;

  var banner = document.createElement('div');
  banner.id = 'demo-banner';
  banner.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:10000',
    'background:rgba(30,32,48,.95)', 'border-bottom:1px solid rgba(139,92,246,.3)',
    'padding:8px 16px', 'display:flex', 'align-items:center', 'justify-content:center',
    'gap:12px', 'font-family:"DM Sans",sans-serif', 'font-size:12px',
    'font-weight:600', 'color:#c4b5fd', 'backdrop-filter:blur(4px)'
  ].join(';');

  banner.innerHTML = '<span>Mode D\u00e9mo \u2014 Les donn\u00e9es sont r\u00e9initialis\u00e9es \u00e0 la fermeture de l\u2019onglet.</span>' +
    '<a href="https://github.com/Anagraphy/roampage" style="color:#a78bfa;text-decoration:underline" target="_blank" rel="noopener">GitHub</a>' +
    '<button id="demo-banner-close" style="background:none;border:none;color:#64748b;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;margin-left:4px" title="Fermer">\u00d7</button>';

  document.body.insertBefore(banner, document.body.firstChild);

  var h = banner.offsetHeight;
  document.body.style.paddingTop = h + 'px';

  document.getElementById('demo-banner-close').addEventListener('click', function() {
    banner.remove();
    document.body.style.paddingTop = '';
    sessionStorage.setItem('demo-banner-closed', '1');
  });
});
