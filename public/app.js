// ── Image error handler (replaces inline onerror= attributes) ──────────────
// Handles data-onerr="hide"     → hides the image
//         data-onerr="fade"     → fades the image to 20% opacity
//         data-onerr="fallback" → replaces src with an SVG initial letter
//   (capture=true because 'error' events on images do not bubble)
document.addEventListener("error", function(e) {
  const el = e.target;
  if (el.tagName !== "IMG") return;
  const mode = el.dataset.onerr;
  if (mode === "hide") {
    el.style.display = "none";
  } else if (mode === "fade") {
    el.style.opacity = "0.2";
  } else if (mode === "fallback") {
    el.removeAttribute("data-onerr"); // prevent loop if the fallback SVG itself fails
    const i = el.dataset.oerrInitial || encodeURIComponent("?");
    el.src = "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect width=%2240%22 height=%2240%22 rx=%228%22 fill=%22%23334155%22/><text x=%2220%22 y=%2225%22 text-anchor=%22middle%22 fill=%22%2394a3b8%22 font-size=%2216%22>" + i + "</text></svg>";
  }
}, true);

// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const EMPTY_PAGE = () => ({id:"page_"+uid(),title:"New Page",tags:{PWA:"#8b5cf6",APP:"#10b981",SELFHOSTED:"#6b7280",CLOUD:"#f59e0b",DOCKER:"#3b82f6",API:"#ec4899"},wallpaperDesktop:"",categories:[]});

const DEFAULT_CONFIG = {
  currentPage: 0,
  pages: [{
    id:"page_1", title:"ROAMPAGE",
    tags:{PWA:"#8b5cf6",APP:"#10b981",SELFHOSTED:"#6b7280",CLOUD:"#f59e0b",DOCKER:"#3b82f6",API:"#ec4899"},
    categories:[]
  }]
};

const DEFAULT_TAG_COLORS=["#8b5cf6","#10b981","#6b7280","#f59e0b","#3b82f6","#ec4899","#ef4444","#06b6d4","#f97316","#84cc16"];
let config=JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let configVersion=null;
let editMode=false, popupService=null, jsonModal="", jsonText="", jsonLoading=false, saveTimeout=null;
let backupModal=false, backups=[];
// Auth / lock state
let lockPinDigits="", lockError="";
let pinFormTarget=null;   // null | "global" | pageId — drives the inline set-PIN form
let pinFormType="pin";    // "pin" | "password"
let pinRemoveTarget=null; // null | "global" | pageId — drives the inline remove-PIN confirmation form
let iconBrowserOpen=false, iconBrowserCat=0, iconBrowserSvc=0, iconBrowserSearch="", allIcons=null, iconBrowserLoading=false;
let widgetPickerCat=-1; // -1 = hidden, >=0 = category index
let bmIconTarget=null; // {ci, si, li} for bookmark icon browser
let cssScope=null; // null | "page" | "global"
// Health: keyed by URL for per-server granularity
let healthByUrl={};
let healthInterval=null;
const openSvcBodies=new Set();
let searchQuery = "";
// Load health cache from localStorage and validate each entry (guards against
// tampered localStorage data: keys must be URL strings, values must be
// {status:'up'|'down'|'checking', timestamp:number}).
const VALID_STATUSES = new Set(["up","down","checking"]);
function loadHealthCache() {
  try {
    const raw = JSON.parse(localStorage.getItem('roampage-health') || '{}');
    if (typeof raw !== 'object' || Array.isArray(raw)) return {};
    const clean = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof k !== 'string' || !k.startsWith('http') || k.length > 2048) continue;
      if (!v || typeof v !== 'object') continue;
      if (!VALID_STATUSES.has(v.status)) continue;
      if (typeof v.timestamp !== 'number') continue;
      clean[k] = {status: v.status, timestamp: v.timestamp};
    }
    return clean;
  } catch { return {}; }
}
let healthCache = loadHealthCache();
const HEALTH_CACHE_MAX_ENTRIES = 200;
function saveHealthCache() {
  // Prune oldest entries if cache is too large
  const keys = Object.keys(healthCache);
  if (keys.length > HEALTH_CACHE_MAX_ENTRIES) {
    keys.sort((a, b) => (healthCache[a].timestamp || 0) - (healthCache[b].timestamp || 0));
    for (const k of keys.slice(0, keys.length - HEALTH_CACHE_MAX_ENTRIES)) delete healthCache[k];
  }
  try { localStorage.setItem('roampage-health', JSON.stringify(healthCache)); } catch (e) {
    // QuotaExceededError: clear and retry
    healthCache = {};
    try { localStorage.removeItem('roampage-health'); } catch {}
  }
}

const uid=()=>Math.random().toString(36).slice(2,10);
const isMobile=()=>window.innerWidth<700;
const $=s=>document.querySelector(s);
const h=s=>(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");

function page(){return config.pages[config.currentPage]||config.pages[0];}
function slugify(s){return(s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")||"page";}
function pageSlug(pg){return pg.slug||slugify(pg.title);}
function findPageBySlug(slug){if(!slug||slug==="/")return 0;slug=slug.replace(/^\//,"");const i=config.pages.findIndex(p=>pageSlug(p)===slug);return i>=0?i:0;}
function pushPageUrl(){const slug=pageSlug(page());history.replaceState(null,"","/"+slug);}
function shellScrollTop(){const sh=document.getElementById("shell");if(sh)sh.scrollTop=0;}
window.addEventListener("popstate",()=>{config.currentPage=findPageBySlug(location.pathname);cssScope=page().customCss?(cssScope==="global"?"global":"page"):config.customCss?"global":null;render();shellScrollTop();startHealthLoop();});
function getTagColor(t){const p=page();return p.tags&&p.tags[t]?p.tags[t]:"#6b7280";}
function tagTextColor(hex){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return(0.299*r+0.587*g+0.114*b)/255>0.5?"#000":"#fff";}
function getAllTags(){const p=page();return p.tags?Object.keys(p.tags):[];}

function autoPrefix(url){url=(url||"").trim();if(!url)return url;
// Check the raw string AND the percent-decoded version to catch java%73cript: bypasses
const decoded=url.replace(/%[0-9a-f]{2}/gi,m=>decodeURIComponent(m));
if(/^(javascript|vbscript|data):/i.test(url)||/^(javascript|vbscript|data):/i.test(decoded))return"#";
if(/^https?:\/\//i.test(url))return url;if(/^(\d{1,3}\.){3}\d{1,3}(:\d+)?/.test(url))return"http://"+url;if(/^localhost(:\d+)?/.test(url))return"http://"+url;return"https://"+url;}

function compressImage(file,maxWidth,maxHeight,quality){
  return new Promise((resolve)=>{
    const img=new Image();const reader=new FileReader();
    reader.onload=()=>{
      img.onload=()=>{
        let w=img.width,ht=img.height;
        const isPortrait=ht>w;
        const ratio=Math.min(w>maxWidth?maxWidth/w:1,ht>maxHeight?maxHeight/ht:1);
        w=Math.round(w*ratio);ht=Math.round(ht*ratio);
        const c=document.createElement("canvas");c.width=w;c.height=ht;
        const ctx=c.getContext("2d");ctx.drawImage(img,0,0,w,ht);
        // Try webp first, fallback to jpeg
        let dataUrl=c.toDataURL("image/webp",quality);
        if(!dataUrl.startsWith("data:image/webp"))dataUrl=c.toDataURL("image/jpeg",quality);
        const origKB=Math.round(file.size/1024);
        const newKB=Math.round(dataUrl.length*0.75/1024);
        console.log(`Wallpaper compressed: ${origKB}KB → ${newKB}KB (${w}×${ht}) ${isPortrait?"portrait":"landscape"}`);
        resolve({dataUrl,isPortrait});
      };
      img.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════
async function loadConfig(){
  try{const res=await fetch("/api/config");const data=await res.json();
    if(data&&data._version)configVersion=data._version;
    if(data&&data.pages)config=data;
    else if(data&&data.categories){config={currentPage:0,pages:[data]};} // migrate old format
  }catch(e){}
  if(!config.pages||!config.pages.length)config.pages=[EMPTY_PAGE()];
  if(config.currentPage>=config.pages.length)config.currentPage=0;
  // Route to page based on URL slug
  const urlPage=findPageBySlug(location.pathname);
  if(urlPage>=0)config.currentPage=urlPage;
  const now = Date.now();
  for (const [url, data] of Object.entries(healthCache)) {
    // Only pre-populate from cache if the entry is recent (< 5 min)
    if (data.timestamp && now - data.timestamp < 5 * 60 * 1000) {
      healthByUrl[url] = data.status;
    } else {
      delete healthCache[url]; // prune stale entries at startup
    }
  }
  cssScope=page().customCss?"page":config.customCss?"global":null;
  render();startHealthLoop();pushPageUrl();
}
// Re-fetch config from server and re-render (keeps current page / edit mode)
async function refreshConfig(){
  try{const res=await fetch("/api/config");const data=await res.json();if(data&&data._version)configVersion=data._version;if(data&&data.pages)config=data;}catch(e){}
  render();
}

// Attempt to unlock a page scope. On success, refreshes config and restarts health loop.
async function submitUnlock(scope,secret){
  try{
    const res=await fetch("/api/auth/unlock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scope,secret})});
    if(res.ok){
      lockPinDigits="";lockError="";
      await refreshConfig();startHealthLoop();
    }else{
      const data=await res.json().catch(()=>({}));
      lockError=res.status===429?"Too many attempts — wait 15 min":"Incorrect PIN";
      lockPinDigits="";render();
      setTimeout(()=>{if(lockError){lockError="";render();}},2500);
    }
  }catch(e){
    lockError="Error — try again";lockPinDigits="";render();
    setTimeout(()=>{if(lockError){lockError="";render();}},2500);
  }
}

function saveConfig(){clearTimeout(saveTimeout);saveTimeout=setTimeout(async()=>{try{const headers={"Content-Type":"application/json"};if(configVersion!=null)headers["If-Match"]=String(configVersion);const res=await fetch("/api/config",{method:"POST",headers,body:JSON.stringify(config)});if(res.status===409){const data=await res.json();configVersion=data.version;fetch("/api/config").then(r=>r.json()).then(d=>{if(d&&d._version)configVersion=d._version;if(d&&d.pages){config=d;render();}const t=document.createElement("div");t.style.cssText="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e2030;border:1px solid rgba(245,158,11,.4);color:#fbbf24;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.5)";t.textContent="Configuration modifiée sur un autre appareil — rechargé.";document.body.appendChild(t);setTimeout(()=>t.remove(),4000);}).catch(()=>{});}else if(res.ok){const d=await res.json();if(d&&d._version)configVersion=d._version;}}catch(e){}},500);}

// ═══════════════════════════════════════════════════════════════
// HEALTH CHECKS (client-side, per URL)
// ═══════════════════════════════════════════════════════════════
// fetchFromServer always hits the server (which has its own 60s cache).
// Used by the health loop so status actually refreshes every 60s.
// Always use server relay: direct fetch with no-cors cannot read HTTP status,
// so a 500 or 404 would incorrectly appear as "up".
async function fetchFromServer(url) {
  try {
    const resp = await fetch(`/api/health?url=${encodeURIComponent(url)}`);
    const data = await resp.json();
    const result = { status: data.status, timestamp: Date.now() };
    healthCache[url] = result;
    saveHealthCache();
    return result;
  } catch (e) {
    console.warn(`[Client] Server health check failed for ${url}:`, e.message);
    const result = { status: 'down', timestamp: Date.now() };
    healthCache[url] = result;
    saveHealthCache();
    return result;
  }
}

// checkUrl reads the localStorage cache (5 min TTL) — used only for
// the initial display on page load before the health loop has run.
async function checkUrl(url) {
  const cached = healthCache[url];
  if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) return cached;
  return fetchFromServer(url);
}

async function runHealthChecks(){
  const urls=[];
  // Only check services on the current page to avoid generating excessive requests
  // (checking all pages at once would trigger CrowdSec rate-limiting rules)
  for(const cat of page().categories)for(const svc of cat.services)if(svc.healthcheckEnabled!==false)for(const srv of svc.servers||[])if(srv.url){const u=autoPrefix(srv.url);if(!urls.includes(u))urls.push(u);if(!healthByUrl[u])healthByUrl[u]="checking";}
  updateAllStatus();
  // Sequential checks with a short delay to avoid triggering CrowdSec / WAF
  // rate-limiting rules that fire on rapid bursts from the same IP.
  // Always bypass the client cache — the server has its own 60s cache that
  // prevents excessive TCP pings regardless of how often the client asks.
  for(const u of urls){
    const result=await fetchFromServer(u);
    healthByUrl[u]=result.status;
    updateAllStatus();
    await new Promise(r=>setTimeout(r,800));
  }
}
function getServerStatus(url){return healthByUrl[autoPrefix(url)]||"checking";}
function getSvcStatus(svc){
  if(svc.type)return null; // widgets have no status
  if(svc.healthcheckEnabled===false)return null;
  const servers=(svc.servers||[]).filter(s=>s.url);
  if(!servers.length)return"checking";
  // Green only if ALL servers are up; red if ALL down; orange if partial or still loading
  const statuses=servers.map(s=>getServerStatus(s.url));
  if(statuses.every(s=>s==="up"))return"up";
  if(statuses.every(s=>s==="down"))return"down";
  return"checking";
}
function updateAllStatus(){
  document.querySelectorAll("[data-health-url]").forEach(el=>{
    const s=getServerStatus(el.dataset.healthUrl);
    const dot=el.querySelector(".status-dot"),lbl=el.querySelector(".status-label");
    if(dot)dot.className="status-dot "+s;if(lbl){lbl.className="status-label "+s;lbl.textContent=s==="checking"?"":s;}
  });
  document.querySelectorAll("[data-health-svc]").forEach(el=>{
    const id=el.dataset.healthSvc;
    for(const cat of page().categories){const svc=cat.services.find(s=>s.id===id);if(svc){
      const s=getSvcStatus(svc);const dot=el.querySelector(".status-dot"),lbl=el.querySelector(".status-label");
      if(dot)dot.className="status-dot "+s;if(lbl){lbl.className="status-label "+s;lbl.textContent=s==="checking"?"":s;}
      break;
    }}
  });
}
function startHealthLoop(){if(healthInterval)clearInterval(healthInterval);runHealthChecks();healthInterval=setInterval(runHealthChecks,60000);}
function stopHealthLoop(){if(healthInterval){clearInterval(healthInterval);healthInterval=null;}}

// ═══════════════════════════════════════════════════════════════
// ICON BROWSER
// ═══════════════════════════════════════════════════════════════
async function loadIcons(){if(allIcons)return;iconBrowserLoading=true;renderIconBrowserContent();try{const res=await fetch("/api/icons");allIcons=await res.json();}catch(e){allIcons=[];}iconBrowserLoading=false;renderIconBrowserContent();}
function getFilteredIcons(){if(!allIcons)return[];const q=iconBrowserSearch.toLowerCase().trim();if(!q)return allIcons.slice(0,80);return allIcons.filter(n=>n.includes(q)).slice(0,80);}
function renderIconBrowserContent(){const c=document.getElementById("icon-browser-results");if(!c)return;if(iconBrowserLoading){c.innerHTML='<div class="icon-browser-loading">Loading icons...</div>';return;}const f=getFilteredIcons();if(!f.length){c.innerHTML='<div class="icon-browser-empty">No icons found</div>';return;}const cur=page().categories[iconBrowserCat]?.services[iconBrowserSvc]?.icon||"";c.innerHTML=f.map(n=>{const p="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/"+n+".png";const sel=cur.includes("/"+n+".")?" selected":"";return`<div class="icon-browser-item${sel}" data-action="pick-icon" data-icon-name="${h(n)}"><img src="${h(p)}" alt="${h(n)}" loading="lazy" data-onerr="fade"><span>${h(n)}</span></div>`;}).join("");}
function renderIconBrowser(){if(!iconBrowserOpen)return"";const sn=page().categories[iconBrowserCat]?.services[iconBrowserSvc]?.name||"service";return`<div class="icon-browser-overlay" id="icon-browser-overlay"><div class="icon-browser"><div style="display:flex;align-items:center;justify-content:space-between"><div style="font-weight:700;color:#e2e8f0;font-size:15px">🔍 Pick an icon</div><button class="icon-btn" data-action="close-icon-browser" style="padding:4px"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><div style="font-size:12px;color:#64748b">Selecting icon for <strong style="color:#e2e8f0">${h(sn)}</strong> — ${allIcons?allIcons.length+" icons":"loading..."}</div><input class="edit-input" id="icon-search-input" value="${h(iconBrowserSearch)}" placeholder="Search icons..." data-action="icon-search" autofocus><div class="icon-browser-grid" id="icon-browser-results"></div></div></div>`;}

function renderWidgetPicker(){
  if(widgetPickerCat<0)return"";
  const ci=widgetPickerCat;
  const w=(type,icon,name,desc)=>`<button class="widget-type-btn" data-action="add-widget" data-wtype="${type}" data-cat="${ci}"><span class="widget-type-icon">${icon}</span><div><div style="font-weight:600">${name}</div><div style="font-size:11px;color:#94a3b8">${desc}</div></div></button>`;
  const ig=(itype,icon,name,desc)=>`<button class="widget-type-btn" data-action="add-integration" data-itype="${itype}" data-cat="${ci}"><span class="widget-type-icon">${icon}</span><div><div style="font-weight:600">${name}</div><div style="font-size:11px;color:#94a3b8">${desc}</div></div></button>`;
  return`<div class="overlay" id="widget-picker-overlay"><div class="popup" style="min-width:320px;max-height:80vh;overflow-y:auto"><div style="font-weight:700;color:#e2e8f0;font-size:15px;margin-bottom:12px">Widgets</div><div style="display:flex;flex-direction:column;gap:6px">${w("widget-clock","🕐","Clock","Time and date display")}${w("widget-weather","🌤","Weather","7-day forecast by city")}${w("widget-bookmarks","🔗","Bookmarks","Quick links grid")}${w("widget-text","📝","Text","Rich text with formatting")}${w("widget-image","🖼","Image","Display an image or banner")}${w("widget-iframe","🪟","Iframe","Embed an external page")}${w("widget-countdown","⏳","Countdown","Countdown to a date")}${w("widget-separator","➖","Separator","Divider line with optional label")}</div><div style="font-weight:700;color:#e2e8f0;font-size:15px;margin:16px 0 12px;border-top:1px solid rgba(255,255,255,.08);padding-top:16px">Integrations</div><div style="display:flex;flex-direction:column;gap:6px">${ig("system","💻","System","CPU, RAM, Disk usage")}</div></div></div>`;
}

// ═══════════════════════════════════════════════════════════════
// RENDER HELPERS
// ═══════════════════════════════════════════════════════════════
function renderTag(t){const bg=getTagColor(t);return`<span class="tag" style="background:${bg};color:${tagTextColor(bg)}">${h(t)}</span>`;}
function renderSvcStatus(svc){
  const status = getSvcStatus(svc);
  if(!status)return"";
  return `<div class="status" data-health-svc="${h(svc.id)}"><span class="status-dot ${status}"></span><span class="status-label ${status}">${status==="checking"?"":status}</span></div>`;
}

function renderClockWidget(svc){
  return`<div class="widget widget-clock" id="clock-${h(svc.id)}"><div class="clock-time"><span class="clock-hm">--:--</span><span class="clock-seconds">:--</span></div><div class="clock-date">---</div></div>`;
}
function renderTextWidget(svc){
  return`<div class="widget widget-text" id="text-widget-${h(svc.id)}" data-widget-id="${h(svc.id)}"><div class="pell-home-wrap" id="pell-home-${h(svc.id)}" data-widget-id="${h(svc.id)}"></div></div>`;
}
function renderBookmarksWidget(svc){
  const links=(svc.links||[]).map(lk=>{
    const icon=lk.icon?`<img src="${h(lk.icon)}" alt="" data-onerr="hide">`:"";
    return`<a class="bookmark-item" href="${h(autoPrefix(lk.url))}" target="_blank" rel="noopener noreferrer">${icon}${h(lk.label)}</a>`;
  }).join("");
  return`<div class="widget widget-bookmarks"><div class="bookmarks-grid">${links||'<span style="color:#64748b;font-size:12px">No bookmarks yet</span>'}</div></div>`;
}
function renderImageWidget(svc){
  if(!svc.imageUrl)return`<div class="widget widget-image" style="padding:16px"><div style="color:#64748b;font-size:12px;text-align:center">No image set</div></div>`;
  const link=svc.linkUrl?`<a href="${h(autoPrefix(svc.linkUrl))}" target="_blank" rel="noopener noreferrer">`:"";
  const linkEnd=svc.linkUrl?"</a>":"";
  const caption=svc.imageCaption?`<div class="img-caption">${h(svc.imageCaption)}</div>`:"";
  return`<div class="widget widget-image">${link}<img src="${h(svc.imageUrl)}" alt="${h(svc.altText||"")}" loading="lazy" decoding="async">${linkEnd}${caption}</div>`;
}
function renderSeparatorWidget(svc){
  if(svc.label){return`<div class="widget widget-separator has-label"><span class="sep-line"></span><span class="sep-label">${h(svc.label)}</span><span class="sep-line"></span></div>`;}
  return`<div class="widget widget-separator"><hr></div>`;
}
function renderCountdownWidget(svc){
  return`<div class="widget widget-countdown" id="cd-${h(svc.id)}" data-target="${h(svc.targetDate||"")}" data-label="${h(svc.label||"")}"><div class="countdown-label">${h(svc.label||"Countdown")}</div><div class="countdown-boxes"><div class="countdown-box"><span class="cd-num cd-days">--</span><span class="cd-unit">days</span></div><div class="countdown-box"><span class="cd-num cd-hrs">--</span><span class="cd-unit">hrs</span></div><div class="countdown-box"><span class="cd-num cd-min">--</span><span class="cd-unit">min</span></div><div class="countdown-box"><span class="cd-num cd-sec">--</span><span class="cd-unit">sec</span></div></div></div>`;
}
// WMO weather code → emoji + label
function weatherIcon(code){
  if(code===0)return{icon:"☀️",label:"Clear"};
  if(code<=2)return{icon:"⛅",label:"Partly cloudy"};
  if(code===3)return{icon:"☁️",label:"Overcast"};
  if(code<=49)return{icon:"🌫️",label:"Fog"};
  if(code<=59)return{icon:"🌦️",label:"Drizzle"};
  if(code<=69)return{icon:"🌧️",label:"Rain"};
  if(code<=79)return{icon:"❄️",label:"Snow"};
  if(code<=82)return{icon:"🌧️",label:"Showers"};
  if(code<=84)return{icon:"🌨️",label:"Snow showers"};
  if(code<=99)return{icon:"⛈️",label:"Thunderstorm"};
  return{icon:"🌡️",label:"Unknown"};
}
const DAYS=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function renderWeatherWidget(svc){
  const d=svc._weatherData;
  if(!svc.weatherLat||!svc.weatherLon)return`<div class="widget widget-weather"><span class="integ-loading">Configure a city in settings</span></div>`;
  if(!d)return`<div class="widget widget-weather" id="weather-${h(svc.id)}"><div class="weather-header"><span class="weather-city">${h(svc.weatherCity)}</span></div><span class="integ-loading">Loading...</span></div>`;
  if(d.error)return`<div class="widget widget-weather" id="weather-${h(svc.id)}"><span class="integ-error">⚠ ${h(d.error)}</span></div>`;
  const today=d.daily[0];
  const {icon,label}=weatherIcon(today.weathercode);
  const unit=svc.weatherUnit==="fahrenheit"?"°F":"°C";
  const forecast=d.daily.slice(1).map(day=>{
    const {icon:di}=weatherIcon(day.weathercode);
    const name=DAYS[new Date(day.date).getDay()];
    return`<div class="weather-day"><span class="weather-day-name">${name}</span><span class="weather-day-icon">${di}</span><span class="weather-day-temp">${Math.round(day.temp_max)}${unit}</span><span class="weather-day-min">${Math.round(day.temp_min)}${unit}</span></div>`;
  }).join("");
  return`<div class="widget widget-weather" id="weather-${h(svc.id)}"><div class="weather-today"><span class="weather-today-icon">${icon}</span><span class="weather-today-temp">${Math.round(today.temp_max)}${unit}</span><span class="weather-today-desc">${label} · ${Math.round(today.temp_min)}${unit} min</span><span class="weather-city">📍 ${h(d.city||svc.weatherCity)}</span></div><div class="weather-forecast">${forecast}</div></div>`;
}
function renderIframeWidget(svc){
  if(!svc.iframeUrl)return`<div class="widget widget-iframe" style="padding:16px"><div style="color:#64748b;font-size:12px;text-align:center">No URL set</div></div>`;
  const ht=svc.iframeHeight||200;
  // No sandbox: homelab dashboards embed trusted self-hosted services (Grafana, Portainer,
  // Home Assistant, etc.) that need their full origin to function. Cross-origin SOP already
  // prevents embedded pages from accessing Roampage's cookies/DOM. Only embed trusted services.
  return`<div class="widget widget-iframe"><iframe src="${h(svc.iframeUrl)}" height="${ht}" loading="lazy" allowfullscreen></iframe></div>`;
}

// ═══════════════════════════════════════════════════════════════
// INTEGRATION WIDGETS
// ═══════════════════════════════════════════════════════════════
function renderIntegrationWidget(svc){
  return`<div class="widget widget-integration" id="integ-${h(svc.id)}" data-integ-type="${h(svc.integType)}" data-integ-id="${h(svc.id)}"><div class="integ-header"><span class="integ-icon">${integIcons[svc.integType]||"📊"}</span><span class="integ-title">${h(svc.integLabel||svc.integType)}</span></div><div class="integ-body"><span class="integ-loading">Loading...</span></div></div>`;
}

const integIcons={system:"💻"};

function formatBytes(b){if(!b)return"0 B";const u=["B","KB","MB","GB","TB"];const i=Math.floor(Math.log(b)/Math.log(1024));return(b/Math.pow(1024,i)).toFixed(i>1?1:0)+" "+u[i];}
function formatUptime(s){const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60);return d>0?`${d}d ${h}h`:h>0?`${h}h ${m}m`:`${m}m`;}

function renderIntegrationData(el,type,data){
  const body=el.querySelector(".integ-body");if(!body)return;
  if(data.error){body.innerHTML=`<span class="integ-error">⚠ ${h(data.error)}</span>`;return;}

  if(type==="system"){
    const cpuPct=data.cpu?.percent||0;const memPct=data.memory?.percent||0;const diskPct=data.disk?.percent||0;
    const barColor=(v)=>v>85?"#ef4444":v>60?"#f59e0b":"#22c55e";
    const bar=(label,pct,detail)=>`<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px"><span style="color:#94a3b8;font-weight:600">${label}</span><span style="color:#64748b">${detail}</span></div><div class="integ-bar"><div class="integ-bar-fill" style="width:${pct}%;background:${barColor(pct)}"></div></div></div>`;
    body.innerHTML=`<div style="font-size:11px;color:#64748b;margin-bottom:8px">${h(data.hostname||"")} · up ${formatUptime(data.uptime||0)}</div>${bar("CPU",cpuPct,cpuPct+"%")}${bar("RAM",memPct,formatBytes(data.memory?.used)+" / "+formatBytes(data.memory?.total))}${data.disk?bar("Disk",diskPct,formatBytes(data.disk?.used)+" / "+formatBytes(data.disk?.total)):""}`;
  }
}

let integInterval=null;
let integCurrentPage=-1; // tracks which page integrations are running for
const integDataCache=new Map(); // id → {data, type, ts}
const INTEG_CLIENT_TTL=8*1000; // reuse cached data if fresher than 8s

// Repaint integration widgets from client cache (instant, no network)
function repaintIntegrations(){
  document.querySelectorAll(".widget-integration").forEach(el=>{
    const id=el.dataset.integId;const type=el.dataset.integType;
    const cached=integDataCache.get(id);
    if(cached)renderIntegrationData(el,type,cached.data);
  });
}

function startIntegrations(){
  if(integInterval)clearInterval(integInterval);
  function fetchAll(){
    // Integration widgets
    document.querySelectorAll(".widget-integration").forEach(async el=>{
      const id=el.dataset.integId;const type=el.dataset.integType;
      let svc=null;
      for(const pg of config.pages)for(const cat of pg.categories)for(const s of cat.services)if(s.id===id){svc=s;break;}
      if(!svc)return;
      // Repaint from cache immediately while waiting for network
      const cached=integDataCache.get(id);
      if(cached)renderIntegrationData(el,type,cached.data);
      // Skip network fetch if cache is still fresh
      if(cached&&Date.now()-cached.ts<INTEG_CLIENT_TTL)return;
      const body={};
      if(svc.integUrl)body.url=svc.integUrl;
      if(svc.integApiKey)body.apiKey=svc.integApiKey;
      try{
        const res=await fetch(`/api/integration/${type}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        const data=await res.json();
        if(!data.error)integDataCache.set(id,{data,type,ts:Date.now()});
        renderIntegrationData(el,type,data);
      }catch(e){
        renderIntegrationData(el,type,{error:e.message});
      }
    });
    // Weather widgets — update innerHTML only, never replace the node (avoids layout shifts)
    document.querySelectorAll(".widget-weather").forEach(async el=>{
      const id=el.id.replace("weather-","");
      let svc=null;
      for(const pg of config.pages)for(const cat of pg.categories)for(const s of cat.services)if(s.id===id){svc=s;break;}
      if(!svc||!svc.weatherLat||!svc.weatherLon)return;
      try{
        const params=new URLSearchParams({lat:svc.weatherLat,lon:svc.weatherLon,city:svc.weatherCity||"",unit:svc.weatherUnit||"celsius"});
        const res=await fetch(`/api/weather?${params}`);
        const data=await res.json();
        svc._weatherData=data;
      }catch(e){
        svc._weatherData={error:e.message};
      }
      // Parse the rendered HTML and inject only the inner content into the existing node
      const tmp=document.createElement("div");
      tmp.innerHTML=renderWeatherWidget(svc);
      const newEl=tmp.firstElementChild;
      if(newEl)el.innerHTML=newEl.innerHTML;
    });
  }
  integCurrentPage=config.currentPage;
  fetchAll();
  // Integration widgets need frequent refresh;
  // weather is cached server-side for 30 min so fetching every 10s is fine (no extra API calls).
  integInterval=setInterval(fetchAll,10*1000);
}
function stopIntegrations(){if(integInterval){clearInterval(integInterval);integInterval=null;}}

function initHomeTextWidgets(){
  document.querySelectorAll(".pell-home-wrap").forEach(container=>{
    if(container.dataset.pellInit)return;
    container.dataset.pellInit="1";
    const wid=container.dataset.widgetId;
    // Find the svc in config
    let svc=null;
    for(const pg of config.pages)for(const cat of pg.categories)for(const s of cat.services)if(s.id===wid){svc=s;break;}
    if(!svc)return;
    const editor=pell.init({
      element:container,
      onChange:html=>{svc.content=DOMPurify.sanitize(html);saveConfig();},
      actions:["bold","italic","underline","strikethrough","heading1","heading2","olist","ulist","link"]
    });
    editor.content.innerHTML=DOMPurify.sanitize(svc.content||"<em>Click to edit...</em>");
    // Strip inline styles on paste to preserve font consistency
    editor.content.addEventListener("paste",function(e){
      e.preventDefault();
      const html=e.clipboardData.getData("text/html");
      if(html){
        // Convert block-level closing tags to <br> BEFORE sanitizing,
        // so line breaks survive even when <div>/<p> wrappers are stripped
        const prepped=html.replace(/<\/(p|div|li|tr|h[1-6])>/gi,"<br>");
        const clean=DOMPurify.sanitize(prepped,{ALLOWED_TAGS:["b","i","u","s","strong","em","h1","h2","h3","ul","ol","li","a","br","p"],ALLOWED_ATTR:["href"]});
        // Trim leading/trailing <br> artifacts
        const trimmed=clean.replace(/^(<br\s*\/?>\s*)+|(<br\s*\/?>\s*)+$/gi,"");
        document.execCommand("insertHTML",false,trimmed);
      }else{
        const text=e.clipboardData.getData("text/plain");
        const escaped=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        document.execCommand("insertHTML",false,escaped.replace(/\n/g,"<br>"));
      }
    });
    // Force dynamic height - remove any inline/inherited min-height
    editor.content.style.minHeight="0";
    editor.content.style.height="auto";
    // Fix: ensure clicking pell-content always places cursor correctly
    editor.content.addEventListener("mousedown",function(e){
      // Let the default mousedown place the caret
      this.focus();
    });
    // Select all on first focus when empty or placeholder
    editor.content.addEventListener("focus",function(){
      const txt=this.textContent.trim();
      if(txt==="Click to edit..."){
        const range=document.createRange();
        range.selectNodeContents(this);
        const sel=window.getSelection();
        sel.removeAllRanges();sel.addRange(range);
      }
    });
  });
}

let clockInterval=null;
function startClocks(){
  if(clockInterval)clearInterval(clockInterval);
  function tick(){
    document.querySelectorAll(".widget-clock").forEach(el=>{
      const now=new Date();
      const hm=el.querySelector(".clock-hm");
      const sec=el.querySelector(".clock-seconds");
      const dt=el.querySelector(".clock-date");
      if(hm)hm.textContent=now.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",hour12:false});
      if(sec)sec.textContent=":"+String(now.getSeconds()).padStart(2,"0");
      if(dt)dt.textContent=now.toLocaleDateString([],{weekday:"long",day:"numeric",month:"long",year:"numeric"});
    });
    document.querySelectorAll(".widget-countdown").forEach(el=>{
      const target=el.dataset.target;if(!target)return;
      const diff=new Date(target).getTime()-Date.now();
      const past=diff<0;const abs=Math.abs(diff);
      const d=Math.floor(abs/86400000),hr=Math.floor((abs%86400000)/3600000),mn=Math.floor((abs%3600000)/60000),sc=Math.floor((abs%60000)/1000);
      const dd=el.querySelector(".cd-days"),hh=el.querySelector(".cd-hrs"),mm=el.querySelector(".cd-min"),ss=el.querySelector(".cd-sec");
      if(dd)dd.textContent=(past?"-":"")+d;if(hh)hh.textContent=hr;if(mm)mm.textContent=mn;if(ss)ss.textContent=sc;
      el.querySelector(".countdown-boxes").classList.toggle("countdown-past",past);
    });
  }
  tick();
  clockInterval=setInterval(tick,1000);
}

function renderServiceRow(svc){
  // Handle widgets
  if(svc.type==="widget-clock")return renderClockWidget(svc);
  if(svc.type==="widget-text")return renderTextWidget(svc);
  if(svc.type==="widget-bookmarks")return renderBookmarksWidget(svc);
  if(svc.type==="widget-image")return renderImageWidget(svc);
  if(svc.type==="widget-separator")return renderSeparatorWidget(svc);
  if(svc.type==="widget-countdown")return renderCountdownWidget(svc);
  if(svc.type==="widget-iframe")return renderIframeWidget(svc);
  if(svc.type==="widget-weather")return renderWeatherWidget(svc);
  if(svc.type==="widget-integration")return renderIntegrationWidget(svc);
  if(!svc.servers||!svc.servers.length)svc.servers=[{label:"Main",url:""}];
  const multi=svc.servers.length>1;const href=multi?"#":h(autoPrefix(svc.servers[0]?.url)||"#");
  const target=multi?"":" target=\"_blank\" rel=\"noopener noreferrer\"";
  const badge=multi?`<span class="multi-badge">×${svc.servers.length}</span>`:"";
  const tags=(svc.tags||[]).map(renderTag).join("");
  const desc=svc.description?`<div class="svc-desc">${h(svc.description)}</div>`:"";
  const i=encodeURIComponent((svc.name||"?")[0]);
  return`<a class="svc-row" href="${href}"${target} data-svc-id="${h(svc.id)}" data-multi="${multi}"><img class="svc-icon" src="${h(svc.icon)}" alt="" data-onerr="fallback" data-oerr-initial="${i}"><div class="svc-info"><div class="svc-name-row"><span class="svc-name">${h(svc.name)}</span>${badge}${tags}</div>${desc}</div>${renderSvcStatus(svc)}</a>`;
}
function renderCategory(cat){
  const filteredServices = cat.services.filter(svc => svc.type || !searchQuery || (svc.name||"").toLowerCase().includes(searchQuery.toLowerCase()) || (svc.description||"").toLowerCase().includes(searchQuery.toLowerCase()));
  if (!filteredServices.length) return "";
  return `<div class="category"><div class="cat-title">${h(cat.name)}</div>${filteredServices.map(renderServiceRow).join("")}</div>`;
}

function renderPopup(svc){
  if(!svc)return"";
  const choices=svc.servers.map((s,i)=>{
    const st=getServerStatus(s.url);
    const stHtml=svc.healthcheckEnabled===false?"":`<div class="popup-status" data-health-url="${h(s.url)}"><span class="status-dot ${st}"></span><span class="status-label ${st}">${st==="checking"?"":st}</span></div>`;
    return`<a class="popup-choice" href="${h(autoPrefix(s.url))}" target="_blank" rel="noopener noreferrer" data-popup-close><span class="popup-num">${i+1}</span><span style="flex:1">${h(s.label)}</span>${stHtml}</a>`;
  }).join("");
  return`<div class="overlay" id="popup-overlay"><div class="popup"><div class="popup-header"><img class="popup-icon" src="${h(svc.icon)}" alt="" data-onerr="hide"><div><div class="popup-title">${h(svc.name)}</div><div class="popup-sub">Choose a server</div></div></div>${choices}</div></div>`;
}
function renderJsonModal(){if(!jsonModal&&!jsonLoading)return"";if(jsonLoading)return`<div class="overlay" id="json-overlay"><div class="json-modal" style="align-items:center;justify-content:center;text-align:center;gap:16px"><div style="font-size:28px">⏳</div><div style="color:#e2e8f0;font-size:14px;margin-top:8px">Processing…</div></div></div>`;const p=page();const ts=(()=>{const d=new Date();const pad=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"_"+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds());})();
  // ── Scope picker (first step) ────────────────────────────────
  if(jsonModal==="pick-export"||jsonModal==="pick-import"){
    const isExp=jsonModal==="pick-export";
    const icon=isExp?"⬆":"⬇";const verb=isExp?"Export":"Import";
    const pageTarget=isExp?"json-export":"json-show";
    const allTarget=isExp?"json-export-all":"json-show-all";
    const allStyle=isExp?"":"background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.4);color:#fca5a5";
    const allLabel=isExp?"All pages":"All pages (replaces everything)";
    return`<div class="overlay" id="json-overlay"><div class="json-modal"><div style="font-weight:700;color:#e2e8f0;margin-bottom:16px">${icon} ${verb} JSON — scope</div><div style="display:flex;flex-direction:column;gap:10px"><button class="btn-small" style="padding:10px 16px;font-size:13px;justify-content:flex-start" data-action="${pageTarget}">📄 Current page — ${h(p.title||"Page")}</button><button class="btn-small" style="padding:10px 16px;font-size:13px;justify-content:flex-start;${allStyle}" data-action="${allTarget}">📚 ${allLabel}</button></div><div class="json-actions" style="margin-top:16px"><button class="btn-small" data-action="json-cancel">Cancel</button></div></div></div>`;
  }
  // ── Textarea modals ──────────────────────────────────────────
  let title,actions;
  if(jsonModal==="export"){title=`⬆ Export — ${h(p.title||"Page")}`;actions=`<button class="btn-small" data-action="json-cancel">Cancel</button><button class="btn-small" data-action="json-copy">📋 Copy</button><button class="btn-small" data-action="json-download">⬇ Download</button>`;}
  else if(jsonModal==="import"){title=`⬇ Import — ${h(p.title||"Page")}`;actions=`<button class="btn-small" data-action="json-cancel">Cancel</button><button class="btn-small" data-action="json-paste">📋 Paste</button><label class="btn-small" style="cursor:pointer">⬆ Upload<input type="file" accept=".json" style="display:none" data-action="json-upload"></label><button class="btn-small" style="background:rgba(139,92,246,.3);border-color:rgba(139,92,246,.5)" data-action="json-import">Import</button>`;}
  else if(jsonModal==="export-all"){title=`⬆ Export — all pages`;actions=`<button class="btn-small" data-action="json-cancel">Cancel</button><button class="btn-small" data-action="json-copy">📋 Copy</button><button class="btn-small" data-action="json-download">⬇ Download</button>`;}
  else{title=`⬇ Import — all pages`;actions=`<button class="btn-small" data-action="json-cancel">Cancel</button><button class="btn-small" data-action="json-paste">📋 Paste</button><label class="btn-small" style="cursor:pointer">⬆ Upload<input type="file" accept=".json" style="display:none" data-action="json-upload"></label><button class="btn-small" style="background:rgba(239,68,68,.3);border-color:rgba(239,68,68,.5);color:#fca5a5" data-action="json-import-all">⚠ Replace all &amp; import</button>`;}
  return`<div class="overlay" id="json-overlay"><div class="json-modal"><div style="font-weight:700;color:#e2e8f0">${title}</div><textarea class="edit-input json-textarea" id="json-text">${h(jsonText)}</textarea><div id="json-error" class="json-error"></div><div class="json-actions" style="flex-wrap:wrap">${actions}</div></div></div>`;}
// ── Lock overlay (shown instead of page content when page.locked) ───────────
function renderLockOverlay(pg){
  const isPin=pg.lockType!=="password";
  const errHtml=lockError?`<div class="lock-error">${h(lockError)}</div>`:'<div class="lock-error"></div>';
  let content;
  if(isPin){
    const dots=[0,1,2,3,4,5].map(i=>`<span class="lock-dot${i<lockPinDigits.length?" filled":""}"></span>`).join("");
    const keys=[1,2,3,4,5,6,7,8,9,"","0","⌫"].map(k=>{
      if(k==="")return"<span></span>";
      if(k==="⌫")return`<button class="pin-key" data-action="pin-backspace">⌫</button>`;
      return`<button class="pin-key" data-action="pin-digit" data-digit="${k}">${k}</button>`;
    }).join("");
    content=`<div class="lock-dots">${dots}</div>${errHtml}<div class="pin-pad">${keys}</div>`;
  }else{
    content=`<input class="lock-password-input" type="password" placeholder="Password" id="lock-password-input">${errHtml}<button class="pin-submit" data-action="password-submit">Unlock</button>`;
  }
  return`<div class="lock-overlay"><div class="lock-box${lockError?" shake":""}"><div style="font-size:28px;margin-bottom:8px">🔒</div><div style="font-weight:700;font-size:16px;color:#e2e8f0;margin-bottom:16px">${h(pg.title)}</div>${content}</div></div>`;
}

// ── Security editor (shown inside edit mode tail) ────────────
function renderSecurityEditor(){
  const hasGlobal=!!(config._auth&&config._auth.globalPinEnabled);
  const dot=(on)=>on?`<span style="color:#22c55e;font-size:12px;font-weight:600">● Active</span>`:`<span style="color:#64748b;font-size:12px">○ Not set</span>`;
  const pinBtns=hasGlobal
    ?`<button class="btn-small" style="padding:3px 10px" data-action="set-global-pin">Change</button><button class="btn-small" style="padding:3px 10px;color:#ef4444;border-color:rgba(239,68,68,.3)" data-action="remove-global-pin">Remove</button>`
    :`<button class="btn-small" style="padding:3px 10px" data-action="set-global-pin">Set PIN</button>`;
  const isChangingPin=pinFormTarget==="global"&&hasGlobal;
  const currentPinField=isChangingPin?`<div style="margin-bottom:8px"><label class="edit-label">Current PIN / password</label><input class="edit-input" type="password" id="pin-form-current" placeholder="Current secret" autocomplete="current-password"></div>`:"";
  const inlineForm=pinFormTarget
    ?`<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:12px;margin-top:10px"><div style="font-size:11px;color:#a78bfa;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">${isChangingPin?"Change":"Set"} secret</div>${currentPinField}<div style="margin-bottom:8px"><label class="edit-label">Type</label><select class="edit-input" id="pin-form-type" style="width:auto"><option value="pin"${pinFormType==="pin"?" selected":""}>Numeric PIN (6 digits)</option><option value="password"${pinFormType==="password"?" selected":""}>Password</option></select></div><div style="margin-bottom:8px"><label class="edit-label">New secret</label><input class="edit-input" type="password" id="pin-form-input" placeholder="Enter PIN or password" autocomplete="new-password"></div><div style="margin-bottom:8px"><label class="edit-label">Confirm</label><input class="edit-input" type="password" id="pin-form-confirm" placeholder="Confirm" autocomplete="new-password"></div><div id="pin-form-error" style="color:#ef4444;font-size:11px;margin-bottom:6px;display:none"></div><div style="display:flex;gap:6px"><button class="btn-small" style="background:rgba(139,92,246,.2);border-color:rgba(139,92,246,.4)" data-action="confirm-set-pin">Save</button><button class="btn-small" data-action="cancel-set-pin">Cancel</button></div></div>`
    :pinRemoveTarget
    ?`<div style="background:rgba(239,68,68,.05);border:1px solid rgba(239,68,68,.3);border-radius:10px;padding:12px;margin-top:10px"><div style="font-size:11px;color:#f87171;font-weight:700;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">Confirm removal</div><div style="margin-bottom:8px"><label class="edit-label">Current PIN / password</label><input class="edit-input" type="password" id="pin-remove-input" placeholder="Enter current secret" autocomplete="current-password"></div><div id="pin-remove-error" style="color:#ef4444;font-size:11px;margin-bottom:6px;display:none"></div><div style="display:flex;gap:6px"><button class="btn-small" style="background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.4);color:#fca5a5" data-action="confirm-remove-pin">Remove</button><button class="btn-small" data-action="cancel-remove-pin">Cancel</button></div></div>`
    :"";
  return`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:11px;color:#94a3b8;min-width:160px">PIN / Password (all pages)</span>${dot(hasGlobal)}${pinBtns}</div>${inlineForm}`;
}

function renderBackupModal(){
  if(!backupModal)return"";
  const list=backups.length?backups.map(b=>{
    const d=new Date(b.date);
    const label=b.name.includes("-auto-")?"🔄 Auto":b.name.includes("-manual-")?"💾 Manual":b.name.includes("-pre-restore-")?"🔙 Pre-restore":"📄 Backup";
    const dateStr=d.toLocaleDateString([],{day:"numeric",month:"short",year:"numeric"})+" "+d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});
    const size=(b.size/1024).toFixed(1)+"KB";
    return`<div class="integ-row"><span class="name">${label} <span style="color:#64748b;font-size:11px">${dateStr}</span></span><span class="meta">${size}</span><button class="btn-small" style="padding:2px 8px;font-size:10px" data-action="restore-backup" data-name="${h(b.name)}">Restore</button><button class="icon-btn danger" style="padding:2px 4px" data-action="delete-backup" data-name="${h(b.name)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>`;
  }).join(""):`<div style="color:#64748b;font-size:12px;text-align:center;padding:12px">No backups yet</div>`;
  return`<div class="overlay" id="backup-overlay"><div class="json-modal"><div style="display:flex;align-items:center;justify-content:space-between"><span style="font-weight:700;color:#e2e8f0">📦 Backups — ${h(page().title||"Page")}</span><span style="font-size:11px;color:#64748b">Auto every Sunday 3AM</span></div><div class="integ-list" style="max-height:300px;overflow-y:auto">${list}</div><div class="json-actions"><button class="btn-small" data-action="backup-close">Close</button><button class="btn-small" style="background:rgba(34,197,94,.2);border-color:rgba(34,197,94,.4);color:#22c55e" data-action="backup-now">💾 Backup now</button></div></div></div>`;
}
// ═══════════════════════════════════════════════════════════════
// EDIT MODE RENDERS
// ═══════════════════════════════════════════════════════════════
function renderTagsEditor(svc,ci,si){const pills=(svc.tags||[]).map(t=>`<span class="tag-pill" style="background:${getTagColor(t)};color:${tagTextColor(getTagColor(t))};border-color:${getTagColor(t)}" data-action="remove-tag-from-svc" data-cat="${ci}" data-svc="${si}" data-tag="${h(t)}">${h(t)}<span class="tag-x">×</span></span>`).join("");const avail=getAllTags().filter(t=>!(svc.tags||[]).includes(t)).map(t=>`<span class="tag-pill" style="background:transparent;color:${getTagColor(t)};border-color:${getTagColor(t)}" data-action="add-tag-to-svc" data-cat="${ci}" data-svc="${si}" data-tag="${h(t)}">${h(t)}</span>`).join("");return`<div><label class="edit-label">Tags</label><div style="display:flex;gap:6px;flex-wrap:wrap">${pills}${avail}</div></div>`;}

function renderGlobalTagsEditor(){const tags=getAllTags();const items=tags.map(t=>{const bg=getTagColor(t);return`<div style="display:inline-flex;gap:4px;align-items:center;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:8px;padding:4px 6px"><input type="color" value="${bg}" data-action="recolor-tag" data-tag="${h(t)}" style="width:22px;height:22px;border:none;background:transparent;cursor:pointer;padding:0;border-radius:4px"><input class="edit-input" style="width:80px;padding:4px 6px;text-transform:uppercase;font-weight:700;font-size:10px;background:transparent;border:none" value="${h(t)}" data-action="rename-tag" data-old="${h(t)}"><button class="icon-btn danger" style="padding:3px" data-action="delete-tag" data-tag="${h(t)}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>`;}).join("");return`<div class="edit-section"><label class="edit-label">Tag definitions</label><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${items}<div style="display:inline-flex;gap:4px;align-items:center"><input class="new-tag-input" id="new-tag-name" placeholder="New tag"><button class="btn-browse" style="padding:4px 10px" data-action="add-global-tag">+</button></div></div></div>`;}

function renderTextColorEditor(){
  const color=page().textColor||"";
  const resetStyle=color?'':'opacity:.4;cursor:not-allowed';
  return`<div class="edit-section"><label class="edit-label">Text color</label><div style="display:flex;gap:8px;align-items:center"><input type="color" value="${color||"#e2e8f0"}" data-action="set-text-color" style="width:36px;height:30px;border:1px solid rgba(255,255,255,.1);border-radius:6px;background:rgba(255,255,255,.06);cursor:pointer;padding:2px">${color?`<span style="font-size:12px;color:#94a3b8">${h(color)}</span>`:""}<button class="btn-small" data-action="reset-text-color" style="padding:3px 8px;${resetStyle}" ${color?"":"disabled"}>↩ Défaut</button></div></div>`;
}

function renderLogoEditor(){
  const logoSrc=config.logoUrl||"/logo.png";
  const isCustom=!!config.logoUrl;
  const preview=config.logoHidden
    ?`<div style="height:40px;display:flex;align-items:center;color:#64748b;font-size:11px">Logo masqué</div>`
    :`<img src="${h(logoSrc)}" style="height:40px;border-radius:6px;object-fit:contain" data-onerr="fade">`;
  const del=isCustom?`<button class="icon-btn danger" style="padding:4px" data-action="del-logo" title="Revenir au logo par défaut"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`:"";
  const hideStyle=config.logoHidden?'background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.3);color:#fca5a5':'';
  return`<div class="edit-section"><label class="edit-label">Header logo</label><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">${preview}${del}</div><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><label class="wp-upload-btn">⬆ Upload<input type="file" accept="image/*" style="display:none" data-action="upload-logo"></label><button class="btn-small" style="${hideStyle}" data-action="toggle-logo-hidden">${config.logoHidden?"👁 Afficher":"🚫 Masquer"}</button></div></div>`;
}

function renderWallpaperEditor(){
  const p=page();const dsk=p.wallpaperDesktop||"";
  const preview=dsk?`<img class="wallpaper-preview" src="${h(dsk)}" alt="Wallpaper">`:`<div class="wallpaper-preview" style="display:flex;align-items:center;justify-content:center;color:#64748b;font-size:11px">No wallpaper</div>`;
  const del=dsk?`<button class="icon-btn danger" style="padding:4px" data-action="del-wallpaper" data-wp="desktop"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`:"";
  return`<div class="edit-section"><label class="edit-label">Wallpaper</label>${preview}<div style="display:flex;gap:6px;margin-top:6px;align-items:center"><label class="wp-upload-btn">⬆ Upload<input type="file" accept="image/*" style="display:none" data-action="upload-wallpaper" data-wp="desktop"></label>${del}<span style="font-size:10px;color:#64748b">Auto-compressed for fast loading</span></div></div>`;
}

function renderCssEditor(){
  const active=cssScope!==null;
  const css=active?(cssScope==="page"?page().customCss||"":config.customCss||""):"";
  const scopeBtn=(s,label)=>`<button class="btn-small css-scope-btn${cssScope===s?" css-scope-active":""}" data-action="set-css-scope" data-scope="${s}">${label}</button>`;
  return`<div class="edit-section"><div style="display:flex;align-items:center;margin-bottom:6px"><label class="edit-label" style="margin:0;flex:1">Custom CSS</label><input type="checkbox" data-action="toggle-css" ${active?"checked":""} style="accent-color:#8b5cf6;cursor:pointer;width:14px;height:14px"></div>${active?`<div style="display:flex;gap:4px;margin-bottom:6px">${scopeBtn("page","Cette page")}${scopeBtn("global","Toutes les pages")}</div>`:""  }${active?`<textarea class="css-editor" data-action="set-css" placeholder="${cssScope==="page"?"/* Cette page uniquement */":"/* Toutes les pages */"}" spellcheck="false">${h(css)}</textarea>`:""}</div>`;
}

function applyTextColor(){
  let tag=document.getElementById("roampage-text-color");
  if(!page().textColor){if(tag)tag.remove();return;}
  if(!tag){tag=document.createElement("style");tag.id="roampage-text-color";document.head.appendChild(tag);}
  tag.textContent=`.cat-title,.svc-desc{color:${page().textColor}!important}`;
}

function applyCustomCss(){
  let gTag=document.getElementById("roampage-css-global");
  const gCss=(config.customCss||"").trim();
  if(!gCss){if(gTag)gTag.remove();}
  else{
    if(!gTag){gTag=document.createElement("style");gTag.id="roampage-css-global";document.head.appendChild(gTag);}
    gTag.textContent=gCss;
  }
  let pTag=document.getElementById("roampage-css-page");
  const pCss=(page().customCss||"").trim();
  if(!pCss){if(pTag)pTag.remove();}
  else{
    if(!pTag){pTag=document.createElement("style");pTag.id="roampage-css-page";document.head.appendChild(pTag);}
    pTag.textContent=pCss;
  }
}

function applyWallpaper(){
  const p=page();let url=p.wallpaperDesktop||"";
  // Restrict to known-safe origins: local uploads or data URIs.
  // Rejects arbitrary strings that could be used for CSS injection.
  if(url&&!/^(\/wallpapers\/|\/images\/|data:image\/)/.test(url))url="";
  const body=document.body;
  const shell=document.getElementById("shell");
  const layer=document.getElementById("wp-layer");
  const gradient="linear-gradient(to bottom,rgba(15,18,25,0.5) 0%,rgba(15,18,25,0.5) 20%,rgba(15,18,25,0.6) 40%,rgba(15,18,25,0.75) 55%,rgba(15,18,25,0.88) 70%,rgba(15,18,25,0.95) 80%,#0f1219 90%)";
  // Clear legacy body inline background
  body.style.backgroundImage="";body.style.backgroundSize="";body.style.backgroundPosition="";body.style.backgroundRepeat="";body.style.backgroundAttachment="";body.style.backgroundColor="#0f1219";
  // On mobile, inset:0 (bottom:0) causes the layer to resize when the address bar
  // shows/hides, producing a visible zoom/jump. height:100vh is the stable large
  // viewport value on iOS — it does NOT change with the address bar.
  if(isMobile()){layer.style.height="100vh";layer.style.bottom="auto";}
  else{layer.style.height="";layer.style.bottom="0";}
  if(url){
    if(url.startsWith("/wallpapers/")&&!url.includes("?t="))url+=("?t="+Date.now());
    const isPortrait=p.wallpaperFit==="contain";
    const screenIsLandscape=window.innerWidth>window.innerHeight;
    const useBlur=isPortrait&&screenIsLandscape;
    // Use DOM API (not innerHTML) so that a crafted wallpaperDesktop URL in an
    // imported JSON cannot inject HTML attributes (e.g. " onmouseover="…").
    const safeUrl=url.replace(/'/g,"%27");
    layer.innerHTML="";
    const imgDiv=document.createElement("div");
    if(useBlur){
      imgDiv.style.cssText="position:absolute;inset:-40px;filter:blur(5px) brightness(0.85)";
      imgDiv.style.backgroundImage=`url('${safeUrl}')`;
      imgDiv.style.backgroundPosition="center";
      imgDiv.style.backgroundSize="cover";
      imgDiv.style.backgroundRepeat="no-repeat";
    }else{
      imgDiv.style.cssText="position:absolute;inset:0";
      imgDiv.style.backgroundImage=`url('${safeUrl}')`;
      imgDiv.style.backgroundPosition="top center";
      imgDiv.style.backgroundSize="cover";
      imgDiv.style.backgroundRepeat="no-repeat";
    }
    const gradDiv=document.createElement("div");
    gradDiv.style.cssText=`position:absolute;inset:0;background:${gradient}`;
    layer.appendChild(imgDiv);
    layer.appendChild(gradDiv);
    layer.style.display="block";
    shell.style.background="transparent";
    shell.style.zIndex="1";
  }else{
    layer.style.display="none";
    layer.innerHTML="";
    shell.style.background="";
    shell.style.zIndex="";
  }
}

function widgetMoveButtons(ci,si,total){
  const up=si>0?`<button class="icon-btn" data-action="move-svc-up" data-cat="${ci}" data-svc="${si}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg></button>`:"";
  const dn=si<total-1?`<button class="icon-btn" data-action="move-svc-down" data-cat="${ci}" data-svc="${si}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>`:"";
  return`${up}${dn}<button class="icon-btn danger" data-action="del-svc" data-cat="${ci}" data-svc="${si}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`;
}

function renderEditWidgetClock(svc,ci,si,total){
  return`<div class="edit-svc"><div class="edit-svc-header"><span style="font-size:18px">🕐</span><span class="edit-svc-name">Clock Widget</span><div style="display:flex;gap:4px">${widgetMoveButtons(ci,si,total)}</div></div></div>`;
}

function renderEditWidgetText(svc,ci,si,total){
  const isOpen=openSvcBodies.has(`${ci}-${si}`);
  return`<div class="edit-svc"><div class="edit-svc-header" data-action="toggle-svc" data-cat="${ci}" data-svc="${si}"><span style="font-size:18px">📝</span><span class="edit-svc-name">Text Widget</span><div style="display:flex;gap:4px">${widgetMoveButtons(ci,si,total)}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" class="chevron${isOpen?" open":""}" id="chev-${ci}-${si}"><path d="M6 9l6 6 6-6"/></svg></div><div class="edit-svc-body" id="svc-body-${ci}-${si}" style="display:${isOpen?"flex":"none"}"><div><label class="edit-label">Content</label><div id="pell-${ci}-${si}" class="pell-editor-container" data-cat="${ci}" data-svc="${si}"></div></div></div></div>`;
}

function initPellEditors(){
  document.querySelectorAll(".pell-editor-container").forEach(container=>{
    if(container.dataset.pellInit)return;
    container.dataset.pellInit="1";
    const ci=parseInt(container.dataset.cat),si=parseInt(container.dataset.svc);
    const svc=page().categories[ci]?.services[si];
    if(!svc)return;
    const editor=pell.init({
      element:container,
      onChange:html=>{svc.content=DOMPurify.sanitize(html);saveConfig();},
      actions:["bold","italic","underline","strikethrough","heading1","heading2","olist","ulist","link"]
    });
    editor.content.innerHTML=DOMPurify.sanitize(svc.content||"");
    // Strip inline styles on paste to preserve font consistency
    editor.content.addEventListener("paste",function(e){
      e.preventDefault();
      const html=e.clipboardData.getData("text/html");
      if(html){
        const prepped=html.replace(/<\/(p|div|li|tr|h[1-6])>/gi,"<br>");
        const clean=DOMPurify.sanitize(prepped,{ALLOWED_TAGS:["b","i","u","s","strong","em","h1","h2","h3","ul","ol","li","a","br","p"],ALLOWED_ATTR:["href"]});
        const trimmed=clean.replace(/^(<br\s*\/?>\s*)+|(<br\s*\/?>\s*)+$/gi,"");
        document.execCommand("insertHTML",false,trimmed);
      }else{
        const text=e.clipboardData.getData("text/plain");
        const escaped=text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
        document.execCommand("insertHTML",false,escaped.replace(/\n/g,"<br>"));
      }
    });
  });
}

function renderEditWidgetBookmarks(svc,ci,si,total){
  const isOpen=openSvcBodies.has(`${ci}-${si}`);
  const links=(svc.links||[]).map((lk,li)=>{
    const iconPreview=lk.icon?`<img src="${h(lk.icon)}" style="width:20px;height:20px;border-radius:4px;object-fit:contain" data-onerr="hide">`:`<span style="color:#64748b;font-size:11px">no icon</span>`;
    return`<div style="display:flex;flex-direction:column;gap:4px;padding:8px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.06);border-radius:8px;margin-bottom:6px"><div class="server-row" style="margin:0"><input class="edit-input" style="width:100px;flex-shrink:0" value="${h(lk.label)}" data-action="edit-bm-label" data-cat="${ci}" data-svc="${si}" data-li="${li}" placeholder="Label"><input class="edit-input" style="flex:1" value="${h(lk.url)}" data-action="edit-bm-url" data-cat="${ci}" data-svc="${si}" data-li="${li}" placeholder="URL"><button class="icon-btn danger" data-action="del-bm" data-cat="${ci}" data-svc="${si}" data-li="${li}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><div class="server-row" style="margin:0">${iconPreview}<input class="edit-input" style="flex:1" value="${h(lk.icon||"")}" data-action="edit-bm-icon" data-cat="${ci}" data-svc="${si}" data-li="${li}" placeholder="Icon URL (auto-filled or manual)"><button class="btn-browse" style="padding:4px 8px;font-size:10px" data-action="open-bm-icon-browser" data-cat="${ci}" data-svc="${si}" data-li="${li}">🔍</button><button class="btn-browse" style="padding:4px 8px;font-size:10px" data-action="auto-detect-bm-icon" data-cat="${ci}" data-svc="${si}" data-li="${li}">Auto</button></div></div>`;
  }).join("");
  return`<div class="edit-svc"><div class="edit-svc-header" data-action="toggle-svc" data-cat="${ci}" data-svc="${si}"><span style="font-size:18px">🔗</span><span class="edit-svc-name">Bookmarks</span><div style="display:flex;gap:4px">${widgetMoveButtons(ci,si,total)}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" class="chevron${isOpen?" open":""}" id="chev-${ci}-${si}"><path d="M6 9l6 6 6-6"/></svg></div><div class="edit-svc-body" id="svc-body-${ci}-${si}" style="display:${isOpen?"flex":"none"}"><div><label class="edit-label">Links</label>${links}<button class="btn-add" data-action="add-bm" data-cat="${ci}" data-svc="${si}">+ Add link</button></div></div></div>`;
}
function renderEditWidgetImage(svc,ci,si,total){
  const isOpen=openSvcBodies.has(`${ci}-${si}`);
  const preview=svc.imageUrl?`<img src="${h(svc.imageUrl)}" style="width:100%;max-height:80px;object-fit:cover;border-radius:6px;margin-bottom:8px">`:"";
  return`<div class="edit-svc"><div class="edit-svc-header" data-action="toggle-svc" data-cat="${ci}" data-svc="${si}"><span style="font-size:18px">🖼</span><span class="edit-svc-name">Image</span><div style="display:flex;gap:4px">${widgetMoveButtons(ci,si,total)}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" class="chevron${isOpen?" open":""}" id="chev-${ci}-${si}"><path d="M6 9l6 6 6-6"/></svg></div><div class="edit-svc-body" id="svc-body-${ci}-${si}" style="display:${isOpen?"flex":"none"}">${preview}<div><label class="edit-label">Image URL</label><div style="display:flex;gap:6px;align-items:center"><input class="edit-input" style="flex:1" value="${h(svc.imageUrl||"")}" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="imageUrl" placeholder="https://..."><label class="btn-browse" style="cursor:pointer;white-space:nowrap">⬆ Upload<input type="file" accept="image/*" style="display:none" data-action="upload-widget-image" data-cat="${ci}" data-svc="${si}"></label></div></div><div><label class="edit-label">Link URL (optional)</label><input class="edit-input" value="${h(svc.linkUrl||"")}" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="linkUrl" placeholder="Click opens this URL"></div><div><label class="edit-label">Caption (optional)</label><input class="edit-input" value="${h(svc.imageCaption||"")}" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="imageCaption" placeholder="Text displayed below the image"></div></div></div>`;
}
function renderEditWidgetSeparator(svc,ci,si,total){
  const isOpen=openSvcBodies.has(`${ci}-${si}`);
  return`<div class="edit-svc"><div class="edit-svc-header" data-action="toggle-svc" data-cat="${ci}" data-svc="${si}"><span style="font-size:18px">➖</span><span class="edit-svc-name">Separator</span><div style="display:flex;gap:4px">${widgetMoveButtons(ci,si,total)}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" class="chevron${isOpen?" open":""}" id="chev-${ci}-${si}"><path d="M6 9l6 6 6-6"/></svg></div><div class="edit-svc-body" id="svc-body-${ci}-${si}" style="display:${isOpen?"flex":"none"}"><div><label class="edit-label">Label (optional)</label><input class="edit-input" value="${h(svc.label||"")}" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="label" placeholder="Leave empty for simple line"></div></div></div>`;
}
function renderEditWidgetCountdown(svc,ci,si,total){
  const isOpen=openSvcBodies.has(`${ci}-${si}`);
  return`<div class="edit-svc"><div class="edit-svc-header" data-action="toggle-svc" data-cat="${ci}" data-svc="${si}"><span style="font-size:18px">⏳</span><span class="edit-svc-name">Countdown</span><div style="display:flex;gap:4px">${widgetMoveButtons(ci,si,total)}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" class="chevron${isOpen?" open":""}" id="chev-${ci}-${si}"><path d="M6 9l6 6 6-6"/></svg></div><div class="edit-svc-body" id="svc-body-${ci}-${si}" style="display:${isOpen?"flex":"none"}"><div><label class="edit-label">Label</label><input class="edit-input" value="${h(svc.label||"")}" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="label" placeholder="Event name"></div><div><label class="edit-label">Target date</label><input class="edit-input" type="datetime-local" value="${h(svc.targetDate||"")}" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="targetDate"></div></div></div>`;
}
function renderEditWidgetWeather(svc,ci,si,total){
  const isOpen=openSvcBodies.has(`${ci}-${si}`);
  const unitSel=(v)=>v===(svc.weatherUnit||"celsius")?' selected':'';
  const hasCity=svc.weatherCity&&svc.weatherLat&&svc.weatherLon;
  const selectedHtml=hasCity
    ?`<div class="weather-city-selected"><span>📍 ${h(svc.weatherCity)}</span><button data-action="weather-clear-city" data-cat="${ci}" data-svc="${si}" title="Change city">✕</button></div>`
    :`<div class="weather-city-search"><input class="edit-input" id="weather-search-${ci}-${si}" placeholder="Search a city..." autocomplete="off" data-action="weather-search-input" data-cat="${ci}" data-svc="${si}"><div class="weather-city-results" id="weather-results-${ci}-${si}" style="display:none"></div></div>`;
  return`<div class="edit-svc"><div class="edit-svc-header" data-action="toggle-svc" data-cat="${ci}" data-svc="${si}"><span style="font-size:18px">🌤</span><span class="edit-svc-name">Weather${hasCity?" — "+h(svc.weatherCity):""}</span><div style="display:flex;gap:4px">${widgetMoveButtons(ci,si,total)}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" class="chevron${isOpen?" open":""}" id="chev-${ci}-${si}"><path d="M6 9l6 6 6-6"/></svg></div><div class="edit-svc-body" id="svc-body-${ci}-${si}" style="display:${isOpen?"flex":"none"}"><div><label class="edit-label">City</label>${selectedHtml}</div><div><label class="edit-label">Temperature unit</label><select class="edit-input" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="weatherUnit"><option value="celsius"${unitSel("celsius")}>Celsius (°C)</option><option value="fahrenheit"${unitSel("fahrenheit")}>Fahrenheit (°F)</option></select></div></div></div>`;
}
function renderEditWidgetIframe(svc,ci,si,total){
  const isOpen=openSvcBodies.has(`${ci}-${si}`);
  return`<div class="edit-svc"><div class="edit-svc-header" data-action="toggle-svc" data-cat="${ci}" data-svc="${si}"><span style="font-size:18px">🪟</span><span class="edit-svc-name">Iframe</span><div style="display:flex;gap:4px">${widgetMoveButtons(ci,si,total)}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" class="chevron${isOpen?" open":""}" id="chev-${ci}-${si}"><path d="M6 9l6 6 6-6"/></svg></div><div class="edit-svc-body" id="svc-body-${ci}-${si}" style="display:${isOpen?"flex":"none"}"><div><label class="edit-label">URL</label><input class="edit-input" value="${h(svc.iframeUrl||"")}" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="iframeUrl" placeholder="https://..."></div><div><label class="edit-label">Height (px)</label><input class="edit-input" type="number" value="${svc.iframeHeight||200}" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="iframeHeight" placeholder="200"></div><div style="font-size:11px;color:#64748b;padding:4px 0">⚠ Some sites (Wikipedia, Google…) block embedding via <code>X-Frame-Options</code> and will appear blank. Works best with your own self-hosted services.</div></div></div>`;
}

function renderEditWidgetIntegration(svc,ci,si,total){
  const isOpen=openSvcBodies.has(`${ci}-${si}`);
  const icon=integIcons[svc.integType]||"📊";
  const name=svc.integType?svc.integType.charAt(0).toUpperCase()+svc.integType.slice(1):"Integration";
  const fields=`<div><label class="edit-label">Label (optional)</label><input class="edit-input" value="${h(svc.integLabel||"")}" data-action="edit-widget-field" data-cat="${ci}" data-svc="${si}" data-field="integLabel" placeholder="${name}"></div>`;
  return`<div class="edit-svc"><div class="edit-svc-header" data-action="toggle-svc" data-cat="${ci}" data-svc="${si}"><span style="font-size:18px">${icon}</span><span class="edit-svc-name">${name}</span><div style="display:flex;gap:4px">${widgetMoveButtons(ci,si,total)}</div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" class="chevron${isOpen?" open":""}" id="chev-${ci}-${si}"><path d="M6 9l6 6 6-6"/></svg></div><div class="edit-svc-body" id="svc-body-${ci}-${si}" style="display:${isOpen?"flex":"none"}">${fields}</div></div>`;
}

function renderEditService(svc,ci,si,total){
  // Widget editing
  if(svc.type==="widget-clock")return renderEditWidgetClock(svc,ci,si,total);
  if(svc.type==="widget-text")return renderEditWidgetText(svc,ci,si,total);
  if(svc.type==="widget-bookmarks")return renderEditWidgetBookmarks(svc,ci,si,total);
  if(svc.type==="widget-image")return renderEditWidgetImage(svc,ci,si,total);
  if(svc.type==="widget-separator")return renderEditWidgetSeparator(svc,ci,si,total);
  if(svc.type==="widget-countdown")return renderEditWidgetCountdown(svc,ci,si,total);
  if(svc.type==="widget-iframe")return renderEditWidgetIframe(svc,ci,si,total);
  if(svc.type==="widget-weather")return renderEditWidgetWeather(svc,ci,si,total);
  if(svc.type==="widget-integration")return renderEditWidgetIntegration(svc,ci,si,total);
  const up=si>0?`<button class="icon-btn" data-action="move-svc-up" data-cat="${ci}" data-svc="${si}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg></button>`:"";
  const dn=si<total-1?`<button class="icon-btn" data-action="move-svc-down" data-cat="${ci}" data-svc="${si}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>`:"";
  const srvs=(svc.servers||[]).map((srv,sri)=>{const del=svc.servers.length>1?`<button class="icon-btn danger" data-action="del-server" data-cat="${ci}" data-svc="${si}" data-srv="${sri}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>`:"";return`<div class="server-row"><input class="edit-input server-label-input" value="${h(srv.label)}" data-action="edit-srv-label" data-cat="${ci}" data-svc="${si}" data-srv="${sri}" placeholder="Label"><input class="edit-input" style="flex:1" value="${h(srv.url)}" data-action="edit-srv-url" data-cat="${ci}" data-svc="${si}" data-srv="${sri}" placeholder="URL">${del}</div>`;}).join("");
  const hcOn=svc.healthcheckEnabled!==false;
  const hcStyle=hcOn?'background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.3);color:#22c55e':'background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.3);color:#fca5a5';
  return`<div class="edit-svc" draggable="false"><div class="edit-svc-header" data-action="toggle-svc" data-cat="${ci}" data-svc="${si}"><img class="edit-svc-icon" src="${h(svc.icon)}" alt="" data-onerr="hide"><span class="edit-svc-name">${h(svc.name)||"New Service"}</span><div style="display:flex;gap:4px">${up}${dn}<button class="icon-btn danger" data-action="del-svc" data-cat="${ci}" data-svc="${si}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" class="chevron" id="chev-${ci}-${si}"><path d="M6 9l6 6 6-6"/></svg></div><div class="edit-svc-body" id="svc-body-${ci}-${si}" style="display:none"><div><label class="edit-label">Name</label><input class="edit-input" value="${h(svc.name)}" data-action="edit-svc-name" data-cat="${ci}" data-svc="${si}"></div><div><label class="edit-label">Icon</label><div style="display:flex;gap:6px;align-items:center"><input class="edit-input" style="flex:1" value="${h(svc.icon)}" data-action="edit-svc-icon" data-cat="${ci}" data-svc="${si}" placeholder="Icon URL or browse →"><button class="btn-browse" data-action="open-icon-browser" data-cat="${ci}" data-svc="${si}">🔍 Browse</button></div></div><div><label class="edit-label">Description</label><input class="edit-input" value="${h(svc.description)}" data-action="edit-svc-desc" data-cat="${ci}" data-svc="${si}" placeholder="Optional"></div>${renderTagsEditor(svc,ci,si)}<div><label class="edit-label">Servers</label>${srvs}<button class="btn-add" data-action="add-server" data-cat="${ci}" data-svc="${si}">+ Add server</button></div><div><label class="edit-label">Healthcheck</label><button class="btn-small" style="${hcStyle}" data-action="toggle-svc-healthcheck" data-cat="${ci}" data-svc="${si}">${hcOn?"● Activé":"○ Désactivé"}</button></div></div></div>`;
}
function renderEditCategory(cat,ci,total,colCtx=null){
  let up,dn,colSwitchBtn;
  if(colCtx){
    const{colPos,colTotal,isLeft}=colCtx;
    up=colPos>0?`<button class="icon-btn" data-action="move-cat-in-col" data-cat="${ci}" data-dir="-1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg></button>`:"";
    dn=colPos<colTotal-1?`<button class="icon-btn" data-action="move-cat-in-col" data-cat="${ci}" data-dir="1"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>`:"";
    colSwitchBtn=isLeft
      ?`<button class="icon-btn" title="Déplacer en colonne droite" data-action="toggle-cat-col" data-cat="${ci}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>`
      :`<button class="icon-btn" title="Déplacer en colonne gauche" data-action="toggle-cat-col" data-cat="${ci}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>`;
  }else{
    up=ci>0?`<button class="icon-btn" data-action="move-cat-up" data-cat="${ci}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg></button>`:"";
    dn=ci<total-1?`<button class="icon-btn" data-action="move-cat-down" data-cat="${ci}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg></button>`:"";
    colSwitchBtn="";
  }
  const svcs=cat.services.map((s,i)=>renderEditService(s,ci,i,cat.services.length)).join("");
  return`<div class="edit-cat" draggable="false"><div class="edit-cat-header"><input class="edit-input title-input" style="flex:1" value="${h(cat.name)}" data-action="edit-cat-name" data-cat="${ci}"><div style="display:flex;gap:4px">${up}${dn}${colSwitchBtn}<button class="icon-btn danger" data-action="del-cat" data-cat="${ci}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div></div>${svcs}<div style="display:flex;gap:8px"><button class="btn-add btn-add-svc" style="flex:1" data-action="add-svc" data-cat="${ci}">+ Add service</button><button class="btn-add btn-add-widget" style="flex:1" data-action="show-widget-picker" data-cat="${ci}">+ Add widget</button></div></div>`;
}


// ═══════════════════════════════════════════════════════════════
// MAIN RENDER
// ═══════════════════════════════════════════════════════════════
function render(){
  const app=$("#app");const p=page();const mobile=isMobile();const colCount=p.columns||(mobile?1:2);const ec=mobile?1:colCount;const cs=(n)=>n===colCount?'background:rgba(99,102,241,.18);border-color:rgba(99,102,241,.5);color:#a5b4fc':'background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1);color:#94a3b8';
  const wasSearchFocused = document.activeElement && document.activeElement.classList.contains("search-input");
  let searchSelectionStart = -1, searchSelectionEnd = -1;
  if (wasSearchFocused) {
    const currentSi = $(".search-input");
    if (currentSi) {
      searchSelectionStart = currentSi.selectionStart;
      searchSelectionEnd = currentSi.selectionEnd;
    }
  }
  // Preserve focused edit-input state across re-renders
  const activeEl = document.activeElement;
  const wasEditFocused = activeEl && activeEl.classList.contains("edit-input") && !activeEl.classList.contains("json-textarea");
  let editFocusKey = null, editFocusSelStart = -1, editFocusSelEnd = -1;
  if (wasEditFocused) {
    editFocusSelStart = activeEl.selectionStart;
    editFocusSelEnd = activeEl.selectionEnd;
    editFocusKey = JSON.stringify({
      action: activeEl.dataset.action||"",
      cat: activeEl.dataset.cat||"",
      svc: activeEl.dataset.svc||"",
      srv: activeEl.dataset.srv||"",
      field: activeEl.dataset.field||"",
    });
  }
  const cfgIcon=editMode?`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>Done`:`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z"/><circle cx="12" cy="12" r="3"/></svg>Config`;

  // Page tabs
  const tabs=config.pages.map((pg,i)=>{
    const active=i===config.currentPage?" active":"";
    const del=config.pages.length>1&&editMode?` <span class="page-tab-del" data-action="del-page" data-page="${i}">×</span>`:"";
    return`<button class="page-tab${active}" data-action="switch-page" data-page="${i}">${h(pg.title||"Page "+(i+1))}${del}</button>`;
  }).join("");
  const tabBar=`<div class="page-tabs">${tabs}${editMode?`<button class="page-tab-add" data-action="add-page">+</button>`:""}</div>`;

  let body;
  if(p.locked){
    // Page is server-locked — show lock overlay, ignore editMode
    editMode=false;
    body=renderLockOverlay(p);
  } else if(editMode){
    const divider=`<div style="margin:24px 0 18px;display:flex;align-items:center;gap:10px"><div style="flex:1;height:1px;background:rgba(255,255,255,.08)"></div><span style="font-size:10px;color:#475569;text-transform:uppercase;letter-spacing:.08em;font-weight:600;white-space:nowrap">Options de la page</span><div style="flex:1;height:1px;background:rgba(255,255,255,.08)"></div></div>`;
    const appearanceGroup=`<div style="border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px;background:rgba(255,255,255,.02);margin-bottom:12px"><div style="font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:14px">Apparence</div>${renderWallpaperEditor()}<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;align-items:flex-start;margin-top:4px">${renderTextColorEditor()}${renderCssEditor()}${renderLogoEditor()}</div></div>`;
    const actionBtns=`<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn-small" data-action="json-pick-export">⬆ Export JSON</button><button class="btn-small" data-action="json-pick-import">⬇ Import JSON</button><button class="btn-small" style="background:rgba(34,197,94,.08);border-color:rgba(34,197,94,.3);color:#22c55e" data-action="open-backups">📦 Backups</button></div>`;
    const securitySection=`<div style="margin-top:20px;border:1px solid rgba(239,68,68,.2);border-radius:12px;padding:14px;background:rgba(239,68,68,.03)"><div style="font-size:10px;color:#f87171;font-weight:700;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">🔒 Sécurité</div>${renderSecurityEditor()}</div>`;
    const tail=`${divider}${renderGlobalTagsEditor()}${appearanceGroup}${securitySection}<div style="margin-top:12px">${actionBtns}</div>`;
    if(colCount>=2&&!mobile){
      const leftItems=p.categories.map((c,i)=>({c,i})).filter(({c})=>(c.column||1)===1);
      const rightItems=p.categories.map((c,i)=>({c,i})).filter(({c})=>c.column===2);
      const renderCol=(items,isLeft)=>items.map(({c,i},colPos)=>renderEditCategory(c,i,p.categories.length,{colPos,colTotal:items.length,isLeft})).join("");
      const colHdr=(label)=>`<div style="font-size:11px;color:#64748b;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em;font-weight:600">${label}</div>`;
      body=`<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="edit-col-zone" data-col-zone="1">${colHdr("Gauche")}${renderCol(leftItems,true)}<button class="btn-add btn-add-cat" data-action="add-cat" data-col="1">+ Add category</button></div><div class="edit-col-zone" data-col-zone="2">${colHdr("Droite")}${renderCol(rightItems,false)}<button class="btn-add btn-add-cat" data-action="add-cat" data-col="2">+ Add category</button></div></div>${tail}`;
    }else{
      const cats=p.categories.map((c,i)=>renderEditCategory(c,i,p.categories.length)).join("");
      body=`${cats}<button class="btn-add btn-add-cat" data-action="add-cat">+ Add category</button>${tail}`;
    }
  } else if(!p.categories.length){
    body=`<div class="empty-page"><div style="font-size:22px;font-weight:700;color:#e2e8f0;margin-bottom:10px">Welcome to Roampage</div><div style="margin-bottom:20px">Your self-hosted dashboard to organize and access all your services from a single place.</div>Click on <strong>Config</strong> in the top right to get started!</div>`;
  } else {
    const cats=p.categories;let gc;
    if(ec===2){
      // Auto-migrate: if no cat has been explicitly assigned to col 2, split 50/50 like before
      if(cats.length>1&&!cats.some(c=>c.column===2)){const mid=Math.ceil(cats.length/2);cats.forEach((c,i)=>{c.column=i<mid?1:2;});saveConfig();}
      const leftCats=cats.filter(c=>(c.column||1)===1);const rightCats=cats.filter(c=>c.column===2);gc=`<div>${leftCats.map(renderCategory).join("")}</div><div>${rightCats.map(renderCategory).join("")}</div>`;
    }else{gc=`<div>${cats.map(renderCategory).join("")}</div>`;}
    const colBtn=mobile?"":`<button class="btn-col" data-action="toggle-cols"><svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="${colCount>=2?1:.3}"/><rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor" opacity="${colCount>=2?1:.3}"/><rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="${colCount>=2?1:.3}"/><rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor" opacity="${colCount>=2?1:.3}"/></svg>${colCount} col</button>`;
    body=`${colBtn}<div class="grid cols-${ec}">${gc}</div><div class="hint">Click on a service to choose a server. <span>Middle-click</span> opens the first link.</div>`;
  }

  const logoHtml=config.logoHidden?"":`<img src="${h(config.logoUrl||"/logo.png")}" class="header-logo" alt="Roampage">`;
  const colPick=(editMode&&!mobile)?`<div style="display:flex;gap:3px">${[1,2].map(n=>`<button class="col-pick" style="${cs(n)}" data-action="set-cols" data-cols="${n}">${n} col</button>`).join("")}</div>`:"";

  const isProtected=!!(config._auth&&config._auth.globalPinEnabled);
  const lockBtnHtml=editMode&&isProtected&&!p.locked?`<button class="btn-lock" data-action="lock-scope" data-scope="global" title="Lock page">🔒</button>`:"";
  const headerInner=editMode
    ?`<input class="edit-input edit-title-inline" value="${h(p.title)}" data-action="edit-title">${colPick}`
    :`<h1>${h(p.title)}</h1><input class="search-input" placeholder="Search... (Ctrl+K)" value="${h(searchQuery)}">`;
  app.innerHTML=`<div class="header"><div class="header-left">${logoHtml}${headerInner}</div>${lockBtnHtml}<button class="btn-config ${editMode?"active":""}" data-action="toggle-edit">${cfgIcon}</button></div>${tabBar}${body}${renderPopup(popupService)}${renderJsonModal()}${renderBackupModal()}${renderIconBrowser()}${renderWidgetPicker()}`;
  document.title=p.title||"Roampage";
  applyWallpaper();
  applyTextColor();
  applyCustomCss();
  startClocks();
  if(editMode)setTimeout(initPellEditors,0);
  else{setTimeout(initHomeTextWidgets,0);if(integCurrentPage!==config.currentPage)startIntegrations();else repaintIntegrations();}
  if(wasSearchFocused){
    const si=$(".search-input");
    if(si){
      si.focus();
      if(searchSelectionStart >= 0){
        si.setSelectionRange(searchSelectionStart, searchSelectionEnd);
      }
    }
  }
  if(wasEditFocused && editFocusKey){
    const key=JSON.parse(editFocusKey);
    const sel=`input.edit-input[data-action="${key.action}"]${key.cat!=""?`[data-cat="${key.cat}"]`:""}${key.svc!=""?`[data-svc="${key.svc}"]`:""}${key.srv!=""?`[data-srv="${key.srv}"]`:""}${key.field!=""?`[data-field="${key.field}"]`:""}`;
    const el=document.querySelector(sel);
    if(el){
      el.focus();
      const s=editFocusSelStart>=0?editFocusSelStart:el.value.length;
      const e2=editFocusSelEnd>=0?editFocusSelEnd:el.value.length;
      // setTimeout ensures cursor placement runs after browser's default post-focus positioning
      setTimeout(()=>el.setSelectionRange(s,e2),0);
    }
  }
  if(iconBrowserOpen){renderIconBrowserContent();const si=document.getElementById("icon-search-input");if(si){si.focus();si.selectionStart=si.value.length;}}
  // Autofocus password field when lock overlay is showing
  if(p.locked&&p.lockType==="password"){const lpi=document.getElementById("lock-password-input");if(lpi)setTimeout(()=>lpi.focus(),50);}
}

// ═══════════════════════════════════════════════════════════════
// EVENTS
// ═══════════════════════════════════════════════════════════════
function reopenSvc(ci,si){openSvcBodies.add(`${ci}-${si}`);const b=$(`#svc-body-${ci}-${si}`),c=$(`#chev-${ci}-${si}`);if(b)b.style.display="flex";if(c)c.classList.add("open");}

// Middle-click on a service row: open first server URL in a new tab
document.addEventListener("auxclick",e=>{
  if(e.button!==1)return;
  const row=e.target.closest(".svc-row");
  if(!row)return;
  e.preventDefault();
  const id=row.dataset.svcId;
  for(const cat of page().categories){const svc=cat.services.find(s=>s.id===id);if(svc){const url=autoPrefix(svc.servers?.[0]?.url||"");if(url&&url!=="#")window.open(url,"_blank","noopener,noreferrer");return;}}
});

// ── Clipboard fallback (works on HTTP / non-secure contexts) ────
function _fallbackCopy(text){
  const ta=document.createElement("textarea");
  ta.value=text;ta.style.position="fixed";ta.style.opacity="0";
  document.body.appendChild(ta);ta.focus();ta.select();
  try{document.execCommand("copy");}catch(e){}
  document.body.removeChild(ta);
}

// ── JSON import/export helpers (async, called from click handler) ──
async function _fetchToB64(url){
  const r=await fetch(url.split("?")[0]);
  const blob=await r.blob();
  return new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(blob);});
}
async function _uploadWithRetry(endpoint,name,data){
  for(let attempt=0;attempt<4;attempt++){
    if(attempt>0)await new Promise(r=>setTimeout(r,attempt*1500));
    const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,data})});
    if(r.status===429)continue;
    const d=await r.json();return d.url||null;
  }
  return null;
}
async function _uploadB64(name,data){return _uploadWithRetry("/api/wallpaper",name,data);}
async function _uploadImageB64(name,data){return _uploadWithRetry("/api/image",name,data);}
// Embed all local images (wallpaper + widget imageUrl) into the page object for export/backup
async function _embedLocalImages(pg){
  // wallpaper
  if(pg.wallpaperDesktop&&pg.wallpaperDesktop.startsWith("/wallpapers/")){
    try{pg.wallpaperDesktopData=await _fetchToB64(pg.wallpaperDesktop);pg.wallpaperDesktop=pg.wallpaperDesktop.split("?")[0].split("/").pop();}catch(e){}
  }
  // widget images (may be in /images/ or legacy /wallpapers/)
  for(const cat of pg.categories||[]){
    for(const svc of cat.services||[]){
      if(svc.imageUrl&&(svc.imageUrl.startsWith("/images/")||svc.imageUrl.startsWith("/wallpapers/"))){
        try{svc.imageUrlData=await _fetchToB64(svc.imageUrl);svc.imageUrl=svc.imageUrl.split("?")[0].split("/").pop();}catch(e){}
      }
    }
  }
}
// Restore all embedded local images after import/restore
async function _restoreLocalImages(pg){
  // wallpaper
  if(pg.wallpaperDesktopData){
    try{const url=await _uploadB64(pg.wallpaperDesktop||("wp_"+uid()+".webp"),pg.wallpaperDesktopData);if(url)pg.wallpaperDesktop=url+"?t="+Date.now();}catch(e){}
    delete pg.wallpaperDesktopData;
  }
  // widget images → go to /data/images
  for(const cat of pg.categories||[]){
    for(const svc of cat.services||[]){
      if(svc.imageUrlData){
        try{const url=await _uploadImageB64(svc.imageUrl||("img_"+uid()+".webp"),svc.imageUrlData);if(url)svc.imageUrl=url+"?t="+Date.now();}catch(e){}
        delete svc.imageUrlData;
      }
    }
  }
}
async function doJsonExport(){
  const p=page();const exp=JSON.parse(JSON.stringify(p));
  jsonLoading=true;render();
  try{await _embedLocalImages(exp);}finally{jsonLoading=false;}
  jsonText=JSON.stringify(exp,null,2);jsonModal="export";render();
}
async function doJsonExportAll(){
  const expAll=JSON.parse(JSON.stringify(config));
  jsonLoading=true;render();
  try{for(const pg of expAll.pages)await _embedLocalImages(pg);}finally{jsonLoading=false;}
  jsonText=JSON.stringify(expAll,null,2);jsonModal="export-all";render();
}
async function doJsonImport(){
  try{
    const ta=$("#json-text");const c=JSON.parse(ta.value);
    if(c.categories===undefined)throw 0;
    jsonLoading=true;render();
    try{await _restoreLocalImages(c);}finally{jsonLoading=false;}
    config.pages[config.currentPage]=c;jsonModal="";saveConfig();render();
  }catch{jsonLoading=false;const err=$("#json-error");if(err)err.textContent="Invalid JSON — expected a single page object";}
}
async function doJsonImportAll(){
  try{
    const ta=$("#json-text");const c=JSON.parse(ta.value);
    if(!(c.pages&&Array.isArray(c.pages)&&c.pages.length))throw 0;
    jsonLoading=true;render();
    try{for(const pg of c.pages)await _restoreLocalImages(pg);}finally{jsonLoading=false;}
    config=c;jsonModal="";saveConfig();render();
  }catch{jsonLoading=false;const err=$("#json-error");if(err)err.textContent="Invalid JSON — expected a full config object with pages";}
}

document.addEventListener("click",e=>{
  const btn=e.target.closest("[data-action]");
  if(!btn){
    if(e.target.id==="popup-overlay"){popupService=null;render();}
    if(e.target.id==="json-overlay"&&!jsonLoading){jsonModal="";render();}
    if(e.target.id==="icon-browser-overlay"){iconBrowserOpen=false;iconBrowserSearch="";bmIconTarget=null;render();}
    if(e.target.id==="widget-picker-overlay"){widgetPickerCat=-1;render();}
    if(e.target.id==="backup-overlay"){backupModal=false;render();}
    const row=e.target.closest(".svc-row");
    if(row){const id=row.dataset.svcId;if(row.dataset.multi==="true"){e.preventDefault();for(const cat of page().categories){const svc=cat.services.find(s=>s.id===id);if(svc){popupService=svc;render();return;}}}}
    return;
  }
  const action=btn.dataset.action,ci=parseInt(btn.dataset.cat),si=parseInt(btn.dataset.svc),sri=parseInt(btn.dataset.srv),pi=parseInt(btn.dataset.page);
  // Never block native form elements
  const tag=e.target.tagName;
  if(tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT"||e.target.isContentEditable)return;
  if(btn.tagName==="LABEL"&&btn.querySelector('input[type="file"]'))return;
  if(btn.tagName==="A"&&btn.hasAttribute("download"))return;
  e.preventDefault();e.stopPropagation();
  const p=page();

  switch(action){
    case"toggle-edit":{if(!editMode&&page().locked)break;editMode=!editMode;openSvcBodies.clear();if(!editMode){integCurrentPage=-1;pinFormTarget=null;pinRemoveTarget=null;}render();if(!editMode)startHealthLoop();break;}
    // Lock / unlock (PIN auth)
    case"lock-scope":{const scope=btn.dataset.scope;fetch("/api/auth/lock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scope})}).then(async()=>{lockPinDigits="";lockError="";await refreshConfig();startHealthLoop();});break;}
    case"pin-digit":{if(lockPinDigits.length<6){lockPinDigits+=btn.dataset.digit;document.querySelectorAll('.lock-dot').forEach((d,i)=>d.classList.toggle('filled',i<lockPinDigits.length));if(lockPinDigits.length===6){render();submitUnlock(page().lockScope||"global",lockPinDigits);}}break;}
    case"pin-backspace":{if(lockPinDigits.length>0){lockPinDigits=lockPinDigits.slice(0,-1);document.querySelectorAll('.lock-dot').forEach((d,i)=>d.classList.toggle('filled',i<lockPinDigits.length));}break;}
    case"password-submit":{const inp=document.getElementById("lock-password-input");if(inp&&inp.value.trim())submitUnlock(page().lockScope||"global",inp.value);break;}
    // Security editor (setpin)
    case"set-global-pin":pinRemoveTarget=null;pinFormTarget="global";pinFormType="pin";render();break;
    case"remove-global-pin":pinFormTarget=null;pinRemoveTarget="global";render();break;
    case"confirm-remove-pin":{const sc=pinRemoveTarget;if(!sc)break;const inputEl=document.getElementById("pin-remove-input");if(!inputEl)break;const currentSecret=inputEl.value.trim();if(!currentSecret){const errEl=document.getElementById("pin-remove-error");if(errEl){errEl.textContent="Enter your current PIN.";errEl.style.display="";}break;}pinRemoveTarget=null;render();(async()=>{try{const res=await fetch("/api/auth/setpin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scope:sc,secret:null,currentSecret})});if(res.ok){await refreshConfig();}else{const data=await res.json().catch(()=>({}));pinRemoveTarget=sc;render();const e2=document.getElementById("pin-remove-error");if(e2){e2.textContent=data.error==="Incorrect secret"?"Incorrect PIN.":data.error||"Error.";e2.style.display="";}}}catch{pinRemoveTarget=sc;render();}})();break;}
    case"cancel-remove-pin":pinRemoveTarget=null;render();break;
    case"confirm-set-pin":{const typeEl=document.getElementById("pin-form-type");const inputEl=document.getElementById("pin-form-input");const confirmEl=document.getElementById("pin-form-confirm");const currentEl=document.getElementById("pin-form-current");const errEl=document.getElementById("pin-form-error");if(!typeEl||!inputEl||!confirmEl)break;const ptype=typeEl.value;const secret=inputEl.value;const conf=confirmEl.value;const currentSecret=currentEl?currentEl.value:undefined;const showErr=(msg)=>{if(errEl){errEl.textContent=msg;errEl.style.display="";}};if(currentEl&&!currentSecret){showErr("Enter your current PIN first.");break;}if(!secret){showErr("Secret cannot be empty.");break;}if(secret!==conf){showErr("Secrets do not match.");break;}if(ptype==="pin"&&!/^\d{6}$/.test(secret)){showErr("PIN must be exactly 6 digits.");break;}const sc=pinFormTarget;pinFormTarget=null;(async()=>{const res=await fetch("/api/auth/setpin",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scope:sc,secret,type:ptype,currentSecret})});if(res.ok){await refreshConfig();}else{const data=await res.json().catch(()=>({}));pinFormTarget=sc;render();const e2=document.getElementById("pin-form-error");if(e2){e2.textContent=data.error||"Error.";e2.style.display="";}}})();break;}
    case"cancel-set-pin":pinFormTarget=null;render();break;
    case"toggle-svc-healthcheck":{const svc=p.categories[ci].services[si];svc.healthcheckEnabled=svc.healthcheckEnabled===false;saveConfig();render();break;}
    case"toggle-cols":{p.columns=(p.columns||2)===1?2:1;saveConfig();render();break;}

    // Pages
    case"switch-page":config.currentPage=pi;editMode=false;openSvcBodies.clear();integCurrentPage=-1;pinFormTarget=null;pinRemoveTarget=null;lockPinDigits="";lockError="";cssScope=page().customCss?"page":config.customCss?"global":null;saveConfig();render();shellScrollTop();startHealthLoop();pushPageUrl();break;
    case"add-page":config.pages.push(EMPTY_PAGE());config.currentPage=config.pages.length-1;editMode=true;openSvcBodies.clear();saveConfig();render();break;
    case"del-page":if(config.pages.length>1){config.pages.splice(pi,1);if(config.currentPage>=config.pages.length)config.currentPage=config.pages.length-1;saveConfig();render();}break;

    // Categories
    case"del-cat":p.categories.splice(ci,1);saveConfig();render();break;
    case"move-cat-up":[p.categories[ci],p.categories[ci-1]]=[p.categories[ci-1],p.categories[ci]];saveConfig();render();break;
    case"move-cat-down":[p.categories[ci],p.categories[ci+1]]=[p.categories[ci+1],p.categories[ci]];saveConfig();render();break;
    case"add-cat":{const col=parseInt(btn.dataset.col)||1;p.categories.push({id:"cat_"+uid(),name:"NEW CATEGORY",column:col,services:[]});saveConfig();render();break;}
    case"toggle-cat-col":{p.categories[ci].column=p.categories[ci].column===2?1:2;saveConfig();render();break;}
    case"set-cols":{p.columns=parseInt(btn.dataset.cols)||2;saveConfig();render();break;}
    case"move-cat-in-col":{
      const dir=parseInt(btn.dataset.dir)||0;
      const col=p.categories[ci].column||1;
      const sameCol=p.categories.map((c,idx)=>({c,idx})).filter(({c})=>(c.column||1)===col);
      const pos=sameCol.findIndex(({idx})=>idx===ci);
      const tp=pos+dir;
      if(tp<0||tp>=sameCol.length)break;
      const ti=sameCol[tp].idx;
      [p.categories[ci],p.categories[ti]]=[p.categories[ti],p.categories[ci]];
      saveConfig();render();break;
    }

    // Services
    case"toggle-svc":{const k=`${ci}-${si}`;if(openSvcBodies.has(k))openSvcBodies.delete(k);else openSvcBodies.add(k);const b=$(`#svc-body-${ci}-${si}`),c=$(`#chev-${ci}-${si}`);if(b)b.style.display=openSvcBodies.has(k)?"flex":"none";if(c)c.classList.toggle("open",openSvcBodies.has(k));break;}
    case"del-svc":p.categories[ci].services.splice(si,1);saveConfig();render();break;
    case"move-svc-up":{const s=p.categories[ci].services;[s[si],s[si-1]]=[s[si-1],s[si]];}saveConfig();render();break;
    case"move-svc-down":{const s=p.categories[ci].services;[s[si],s[si+1]]=[s[si+1],s[si]];}saveConfig();render();break;
    case"add-svc":p.categories[ci].services.push({id:"svc_"+uid(),name:"",icon:"",description:"",tags:[],servers:[{label:"Main",url:""}]});saveConfig();render();break;

    // Widgets
    // Weather city selection
    case"weather-pick-city":{
      const svc=p.categories[ci].services[si];
      svc.weatherCity=btn.dataset.name+(btn.dataset.country?" ("+btn.dataset.country+")":"");
      svc.weatherLat=btn.dataset.lat;
      svc.weatherLon=btn.dataset.lon;
      svc._weatherData=null; // force refresh
      openSvcBodies.add(`${ci}-${si}`);
      saveConfig();render();
      // Trigger weather fetch immediately
      integCurrentPage=-1;startIntegrations();
      break;
    }
    case"weather-clear-city":{
      const svc=p.categories[ci].services[si];
      svc.weatherCity="";svc.weatherLat="";svc.weatherLon="";svc._weatherData=null;
      openSvcBodies.add(`${ci}-${si}`);
      saveConfig();render();break;
    }
    case"show-widget-picker":widgetPickerCat=ci;render();break;
    case"add-widget":{
      const wtype=btn.dataset.wtype;const cat=parseInt(btn.dataset.cat);
      const defaults={"widget-clock":{},"widget-text":{content:""},"widget-bookmarks":{links:[]},"widget-image":{imageUrl:"",linkUrl:""},"widget-separator":{label:""},"widget-countdown":{label:"",targetDate:""},"widget-iframe":{iframeUrl:"",iframeHeight:200},"widget-weather":{weatherCity:"",weatherLat:"",weatherLon:"",weatherUnit:"celsius"}};
      p.categories[cat].services.push({id:"wgt_"+uid(),type:wtype,...(defaults[wtype]||{})});
      widgetPickerCat=-1;saveConfig();render();break;
    }
    case"add-integration":{
      const itype=btn.dataset.itype;const cat=parseInt(btn.dataset.cat);
      p.categories[cat].services.push({id:"wgt_"+uid(),type:"widget-integration",integType:itype,integLabel:"",integUrl:"",integApiKey:""});
      widgetPickerCat=-1;saveConfig();render();break;
    }
    // Servers
    case"add-server":p.categories[ci].services[si].servers.push({label:`Server ${p.categories[ci].services[si].servers.length+1}`,url:""});saveConfig();render();reopenSvc(ci,si);break;
    case"del-server":p.categories[ci].services[si].servers.splice(sri,1);saveConfig();render();reopenSvc(ci,si);break;

    // Bookmarks
    case"add-bm":{const svc=p.categories[ci].services[si];if(!svc.links)svc.links=[];svc.links.push({label:"",url:"",icon:""});saveConfig();render();reopenSvc(ci,si);break;}
    case"del-bm":{const li=parseInt(btn.dataset.li);p.categories[ci].services[si].links.splice(li,1);saveConfig();render();reopenSvc(ci,si);break;}
    case"open-bm-icon-browser":{
      const li=parseInt(btn.dataset.li);
      bmIconTarget={ci,si,li};
      const label=p.categories[ci].services[si].links[li].label||"";
      iconBrowserCat=ci;iconBrowserSvc=si;
      iconBrowserOpen=true;
      iconBrowserSearch=label.toLowerCase().replace(/[^a-z0-9]/g,"");
      render();loadIcons();break;
    }
    case"auto-detect-bm-icon":{
      const li=parseInt(btn.dataset.li);
      const lk=p.categories[ci].services[si].links[li];
      const name=lk.label.toLowerCase().replace(/[^a-z0-9]/g,"");
      if(!name)break;
      (async()=>{
        try{
          const r=await fetch("/api/icons/"+encodeURIComponent(name)+"/url");
          const d=await r.json();
          lk.icon=d.url;saveConfig();render();reopenSvc(ci,si);
        }catch(e){console.log("No icon found for",name);}
      })();break;
    }

    // Tags on services
    case"add-tag-to-svc":{const svc=p.categories[ci].services[si];if(!svc.tags)svc.tags=[];svc.tags.push(btn.dataset.tag);saveConfig();render();reopenSvc(ci,si);break;}
    case"remove-tag-from-svc":{const svc=p.categories[ci].services[si];svc.tags=(svc.tags||[]).filter(t=>t!==btn.dataset.tag);saveConfig();render();reopenSvc(ci,si);break;}

    // Global tags
    case"delete-tag":{const t=btn.dataset.tag;delete p.tags[t];for(const cat of p.categories)for(const svc of cat.services)svc.tags=(svc.tags||[]).filter(x=>x!==t);saveConfig();render();break;}
    case"add-global-tag":{const inp=$("#new-tag-name");if(inp&&inp.value.trim()){const name=inp.value.trim().toUpperCase();if(!p.tags[name]){p.tags[name]=DEFAULT_TAG_COLORS[Object.keys(p.tags).length%DEFAULT_TAG_COLORS.length];saveConfig();render();}}break;}

    // Icon browser
    case"open-icon-browser":iconBrowserCat=ci;iconBrowserSvc=si;iconBrowserOpen=true;iconBrowserSearch=(p.categories[ci]?.services[si]?.name||"").toLowerCase().replace(/[^a-z0-9]/g,"");render();loadIcons();break;
    case"close-icon-browser":iconBrowserOpen=false;iconBrowserSearch="";bmIconTarget=null;render();break;
    case"pick-icon":{const n=btn.dataset.iconName;(async()=>{let url;try{const r=await fetch("/api/icons/"+encodeURIComponent(n)+"/url");const d=await r.json();url=d.url;}catch(e){url="https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/"+n+".png";}if(bmIconTarget){const t=bmIconTarget;p.categories[t.ci].services[t.si].links[t.li].icon=url;bmIconTarget=null;iconBrowserOpen=false;iconBrowserSearch="";saveConfig();render();reopenSvc(t.ci,t.si);}else{p.categories[iconBrowserCat].services[iconBrowserSvc].icon=url;iconBrowserOpen=false;iconBrowserSearch="";saveConfig();render();reopenSvc(iconBrowserCat,iconBrowserSvc);}})();break;}

    // JSON
    case"json-pick-export":jsonModal="pick-export";render();break;
    case"json-pick-import":jsonModal="pick-import";render();break;
    case"json-export":doJsonExport();break;
    case"json-show":jsonText="";jsonModal="import";render();break;
    case"json-export-all":doJsonExportAll();break;
    case"json-show-all":jsonText="";jsonModal="import-all";render();break;
    case"json-cancel":jsonModal="";render();break;
    case"json-copy":{const ta=$("#json-text");if(!ta)break;ta.select();ta.setSelectionRange(0,ta.value.length);const text=ta.value;const doCopy=()=>{btn.textContent="✓ Copied!";btn.style.color="#22c55e";btn.style.borderColor="rgba(34,197,94,.4)";};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(doCopy).catch(()=>{_fallbackCopy(text);doCopy();});}else{_fallbackCopy(text);doCopy();}}break;
    case"json-download":{const ta=$("#json-text");if(ta){const blob=new Blob([ta.value],{type:"application/json"});const url=URL.createObjectURL(blob);const d=new Date();const pad=n=>String(n).padStart(2,"0");const ts=d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())+"_"+pad(d.getHours())+pad(d.getMinutes())+pad(d.getSeconds());const isAll=(jsonModal==="export-all");const fname=isAll?"roampage-all-"+ts+".json":"roampage-"+pageSlug(p)+"-"+ts+".json";const a=document.createElement("a");a.href=url;a.download=fname;a.click();URL.revokeObjectURL(url);}}break;
    case"json-paste":{const ta=$("#json-text");if(!ta)break;if(navigator.clipboard&&navigator.clipboard.readText){navigator.clipboard.readText().then(text=>{if(text){ta.value=text;ta.select();}else{ta.focus();}}).catch(()=>{ta.value="";ta.focus();btn.textContent="Ctrl+V to paste";setTimeout(()=>{btn.textContent="📋 Paste";},2000);});}else{ta.value="";ta.focus();}break;}
    case"json-import":doJsonImport();break;
    case"json-import-all":doJsonImportAll();break;

    // Backups (per-page)
    case"open-backups":{const slug=pageSlug(p);fetch("/api/backups?slug="+encodeURIComponent(slug)).then(r=>r.json()).then(d=>{backups=d;backupModal=true;render();}).catch(()=>{backupModal=true;render();});break;}
    case"backup-close":backupModal=false;render();break;
    case"backup-now":{(async()=>{const slug=pageSlug(p);const exp=JSON.parse(JSON.stringify(p));await fetch("/api/backups",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({page:exp,slug})});const d=await fetch("/api/backups?slug="+encodeURIComponent(slug)).then(r=>r.json());backups=d;render();})();break;}
    case"restore-backup":{const name=btn.dataset.name;if(!confirm("Restore this backup for page \""+p.title+"\"?"))break;
      (async()=>{
        const r=await fetch("/api/backups/restore",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name})});
        const d=await r.json();
        if(d.page){await _restoreLocalImages(d.page);config.pages[config.currentPage]=d.page;saveConfig();render();}
        else{
          const msg=d&&d.error?d.error:"Unknown server error";
          const isKeyErr=/unable to authenticate|unsupported state|decipher/i.test(msg);
          alert("⚠ Restore failed"+(isKeyErr?"\n\nThis backup was encrypted with a different key (e.g. from a previous container run).\nSet a fixed ENCRYPTION_KEY in your docker-compose.yml to avoid this.":"\n\n"+msg));
        }
      })();break;}
    case"delete-backup":{const name=btn.dataset.name;const slug=pageSlug(p);fetch("/api/backups/"+encodeURIComponent(name),{method:"DELETE"}).then(()=>fetch("/api/backups?slug="+encodeURIComponent(slug))).then(r=>r.json()).then(d=>{backups=d;render();});break;}

    // Text color
    case"reset-text-color":page().textColor="";applyTextColor();saveConfig();render();break;


    // CSS scope switch
    case"set-css-scope":{
      const newScope=btn.dataset.scope;
      if(newScope===cssScope)break;
      // Move CSS content to the new scope, clear the old one
      const currentCss=cssScope==="global"?config.customCss||"":page().customCss||"";
      if(cssScope==="global")config.customCss="";else page().customCss="";
      cssScope=newScope;
      if(cssScope==="global")config.customCss=currentCss;else page().customCss=currentCss;
      applyCustomCss();saveConfig();render();break;
    }

    // Logo
    case"del-logo":{if(config.logoUrl){const fname=config.logoUrl.split("/").pop().split("?")[0];fetch("/api/wallpaper/"+encodeURIComponent(fname),{method:"DELETE"}).catch(()=>{});}config.logoUrl="";saveConfig();render();break;}
    case"toggle-logo-hidden":config.logoHidden=!config.logoHidden;saveConfig();render();break;

    // Wallpaper delete
    case"del-wallpaper":{const wp=btn.dataset.wp;const p2=page();const old=wp==="desktop"?p2.wallpaperDesktop:p2.wallpaperMobile;if(old){const fname=old.split("/").pop().split("?")[0];fetch("/api/wallpaper/"+encodeURIComponent(fname),{method:"DELETE"}).catch(()=>{});}if(wp==="desktop")p2.wallpaperDesktop="";else p2.wallpaperMobile="";saveConfig();render();break;}

    default:if(btn.hasAttribute("data-popup-close")){popupService=null;render();}
  }
});

document.addEventListener("input",e=>{
  if(e.target.classList.contains("search-input")){
    searchQuery=e.target.value;
    render();
    return;
  }
  const el=e.target,action=el.dataset.action;if(!action)return;
  const ci=parseInt(el.dataset.cat),si=parseInt(el.dataset.svc),sri=parseInt(el.dataset.srv);
  const p=page();
  switch(action){
    case"edit-title":p.title=el.value;saveConfig();pushPageUrl();break;
    case"edit-cat-name":p.categories[ci].name=el.value;saveConfig();break;
    case"edit-svc-name":p.categories[ci].services[si].name=el.value;saveConfig();break;
    case"edit-svc-icon":p.categories[ci].services[si].icon=el.value;saveConfig();break;
    case"edit-svc-desc":p.categories[ci].services[si].description=el.value;saveConfig();break;
    case"edit-srv-label":p.categories[ci].services[si].servers[sri].label=el.value;saveConfig();break;
    case"edit-srv-url":p.categories[ci].services[si].servers[sri].url=el.value;saveConfig();break;
    case"set-text-color":page().textColor=el.value;applyTextColor();saveConfig();break;
    case"set-css":if(cssScope==="global"){config.customCss=el.value;}else{page().customCss=el.value;}applyCustomCss();saveConfig();break;
    case"icon-search":iconBrowserSearch=el.value;renderIconBrowserContent();break;
    case"rename-tag":{const old=el.dataset.old,nw=el.value.trim().toUpperCase();if(nw&&nw!==old&&!p.tags[nw]){p.tags[nw]=p.tags[old];delete p.tags[old];for(const cat of p.categories)for(const svc of cat.services)svc.tags=(svc.tags||[]).map(t=>t===old?nw:t);el.dataset.old=nw;saveConfig();}break;}
    // Weather city search input
    case"weather-search-input":{
      const q=el.value.trim();
      const resultsEl=document.getElementById(`weather-results-${ci}-${si}`);
      if(!resultsEl)break;
      // Position the fixed dropdown under the input
      function positionWeatherDropdown(){
        const rect=el.getBoundingClientRect();
        resultsEl.style.top=(rect.bottom+4)+"px";
        resultsEl.style.left=rect.left+"px";
        resultsEl.style.width=rect.width+"px";
      }
      clearTimeout(el._weatherTimer);
      if(q.length<2){resultsEl.style.display="none";break;}
      positionWeatherDropdown();
      resultsEl.style.display="block";
      resultsEl.innerHTML=`<div class="weather-city-result"><span class="wcr-name" style="color:#64748b">Searching...</span></div>`;
      el._weatherTimer=setTimeout(async()=>{
        try{
          const resp=await fetch(`/api/weather/search?q=${encodeURIComponent(q)}`);
          const results=await resp.json();
          positionWeatherDropdown();
          if(!results.length){resultsEl.innerHTML=`<div class="weather-city-result"><span class="wcr-name" style="color:#64748b">No results found</span></div>`;return;}
          resultsEl.innerHTML=results.map((r,idx)=>{
            const sub=[r.state,r.country].filter(Boolean).join(", ");
            return`<div class="weather-city-result" data-action="weather-pick-city" data-cat="${ci}" data-svc="${si}" data-idx="${idx}" data-name="${h(r.name)}" data-country="${h(r.country_code)}" data-lat="${parseFloat(r.lat)||0}" data-lon="${parseFloat(r.lon)||0}"><div class="wcr-name">${h(r.name)}${r.country_code?" <span style='font-size:10px;opacity:.6'>"+h(r.country_code)+"</span>":""}</div><div class="wcr-sub">${h(sub)}</div></div>`;
          }).join("");
        }catch(e){resultsEl.innerHTML=`<div class="weather-city-result"><span class="wcr-name" style="color:#ef4444">Error: ${h(e.message)}</span></div>`;}
      },350);
      break;
    }
    // Generic widget field editor
    case"edit-widget-field":{const svc=p.categories[ci].services[si];const f=el.dataset.field;if(f==="iframeHeight")svc[f]=parseInt(el.value)||200;else svc[f]=el.value;saveConfig();break;}
    // Bookmark editors
    case"edit-bm-label":{const li=parseInt(el.dataset.li);p.categories[ci].services[si].links[li].label=el.value;saveConfig();break;}
    case"edit-bm-url":{const li=parseInt(el.dataset.li);p.categories[ci].services[si].links[li].url=el.value;saveConfig();break;}
    case"edit-bm-icon":{const li=parseInt(el.dataset.li);p.categories[ci].services[si].links[li].icon=el.value;saveConfig();break;}
  }
});

document.addEventListener("change",e=>{
  const el=e.target;if(el.tagName!=="INPUT"||el.type!=="checkbox")return;
  const action=el.dataset.action;
  switch(action){
    case"toggle-css":
      if(el.checked){cssScope=page().customCss?"page":config.customCss?"global":"page";}
      else{if(cssScope==="global"){config.customCss="";}else{page().customCss="";}cssScope=null;applyCustomCss();saveConfig();}
      render();break;
  }
});

document.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key === "k") {
    e.preventDefault();
    const si = $(".search-input");
    if (si) si.focus();
  }
  // Keyboard input for numeric PIN overlay (digits + backspace)
  if (page().locked && page().lockType === "pin" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
    if (/^\d$/.test(e.key) && lockPinDigits.length < 6) {
      lockPinDigits += e.key;
      document.querySelectorAll(".lock-dot").forEach((d, i) => d.classList.toggle("filled", i < lockPinDigits.length));
      if (lockPinDigits.length === 6) { render(); submitUnlock(page().lockScope||"global", lockPinDigits); }
    } else if (e.key === "Backspace" && lockPinDigits.length > 0) {
      lockPinDigits = lockPinDigits.slice(0, -1);
      document.querySelectorAll(".lock-dot").forEach((d, i) => d.classList.toggle("filled", i < lockPinDigits.length));
    }
  }
  // Enter on password lock input → submit
  if (e.key === "Enter" && e.target.id === "lock-password-input") {
    e.preventDefault();
    const inp = e.target;
    if (inp.value.trim()) submitUnlock(page().lockScope||"global", inp.value);
  }
  // Enter on PIN remove confirmation input → submit
  if (e.key === "Enter" && e.target.id === "pin-remove-input") {
    e.preventDefault();
    const sc = pinRemoveTarget;
    if (!sc) return;
    const val = e.target.value.trim();
    if (!val) return;
    pinRemoveTarget = null;
    render();
    (async () => {
      try {
        const res = await fetch("/api/auth/setpin", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({scope:sc,secret:null,currentSecret:val})});
        if (res.ok) { await refreshConfig(); }
        else { const data=await res.json().catch(()=>({})); pinRemoveTarget=sc; render(); const e2=document.getElementById("pin-remove-error"); if(e2){e2.textContent=data.error==="Incorrect secret"?"Incorrect PIN.":data.error||"Error.";e2.style.display="";} }
      } catch { pinRemoveTarget=sc; render(); }
    })();
  }
});


// Enable draggable only when mousedown is on a drag-safe zone (header, not input/button/textarea)
document.addEventListener("mousedown", e => {
  const t = e.target;
  const isFormEl = t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT"||t.tagName==="BUTTON"||t.isContentEditable;
  const dragEl = t.closest(".edit-cat, .edit-svc");
  if (!dragEl) return;
  dragEl.draggable = !isFormEl;
  if (!isFormEl) {
    const onUp = () => { dragEl.draggable = false; document.removeEventListener("mouseup", onUp); };
    document.addEventListener("mouseup", onUp);
  }
});

document.addEventListener("dragstart", e => {
  const src=e.target;
  if (!src.draggable) { e.preventDefault(); return; }
  if (src.classList.contains("edit-cat")) {
    e.dataTransfer.setData("text/plain", "cat-" + e.target.querySelector("[data-cat]").dataset.cat);
  } else if (e.target.classList.contains("edit-svc")) {
    const catEl = e.target.closest(".edit-cat");
    const cat = catEl.querySelector("[data-cat]").dataset.cat;
    const svc = e.target.querySelector("[data-svc]").dataset.svc;
    e.dataTransfer.setData("text/plain", "svc-" + cat + "-" + svc);
  }
  e.target.classList.add("dragging");
});

document.addEventListener("dragend", e => {
  e.target.classList.remove("dragging");
  e.target.draggable = false;
  document.querySelectorAll(".drop-target-before, .drop-target-after, .drop-target-zone").forEach(el => {
    el.classList.remove("drop-target-before", "drop-target-after", "drop-target-zone");
  });
});

document.addEventListener("dragover", e => {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  document.querySelectorAll(".drop-target-before, .drop-target-after, .drop-target-zone").forEach(el => {
    el.classList.remove("drop-target-before", "drop-target-after", "drop-target-zone");
  });
  const target = e.target.closest(".edit-cat, .edit-svc");
  if (target) {
    const rect = target.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    if (e.clientY < midpoint) {
      target.classList.add("drop-target-before");
    } else {
      target.classList.add("drop-target-after");
    }
  } else {
    const zone = e.target.closest(".edit-col-zone");
    if (zone) zone.classList.add("drop-target-zone");
  }
});

document.addEventListener("drop", e => {
  e.preventDefault();
  const data = e.dataTransfer.getData("text/plain");
  const [type, ...ids] = data.split("-");
  const target = e.target.closest(".edit-cat, .edit-svc");
  const colZoneEl = e.target.closest(".edit-col-zone");
  if (!target && !colZoneEl) return;
  const p = page();

  if (type === "cat") {
    const fromIndex = parseInt(ids[0]);

    if (!target && colZoneEl) {
      // Dropped on empty column zone — just reassign column
      const targetCol = parseInt(colZoneEl.dataset.colZone) || 1;
      if ((p.categories[fromIndex].column || 1) !== targetCol) {
        p.categories[fromIndex].column = targetCol;
        saveConfig(); render();
      }
      return;
    }

    const rect = target.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const insertBefore = e.clientY < midpoint;

    let toIndex;
    if (target.classList.contains("edit-cat")) {
      toIndex = parseInt(target.querySelector("[data-cat]").dataset.cat);
    } else {
      const catEl = target.closest(".edit-cat");
      toIndex = parseInt(catEl.querySelector("[data-cat]").dataset.cat);
    }
    if (fromIndex !== toIndex) {
      // Inherit the target's column (handles cross-column moves transparently)
      p.categories[fromIndex].column = p.categories[toIndex].column || 1;
      const [cat] = p.categories.splice(fromIndex, 1);
      let insertAt = insertBefore ? toIndex : toIndex + 1;
      if (fromIndex < toIndex) insertAt--;
      p.categories.splice(insertAt, 0, cat);
      saveConfig();
      render();
    }
  } else if (type === "svc") {
    const fromCat = parseInt(ids[0]);
    const fromSvc = parseInt(ids[1]);
    let toCat, toSvc;
    if (target.classList.contains("edit-cat")) {
      toCat = parseInt(target.querySelector("[data-cat]").dataset.cat);
      toSvc = insertBefore ? 0 : p.categories[toCat].services.length;
    } else if (target.classList.contains("edit-svc")) {
      const catEl = target.closest(".edit-cat");
      toCat = parseInt(catEl.querySelector("[data-cat]").dataset.cat);
      toSvc = parseInt(target.querySelector("[data-svc]").dataset.svc);
      if (!insertBefore) toSvc++;
      if (toCat === fromCat && fromSvc < toSvc) toSvc--;
    }
    if (fromCat !== toCat || fromSvc !== toSvc) {
      const [svc] = p.categories[fromCat].services.splice(fromSvc, 1);
      p.categories[toCat].services.splice(toSvc, 0, svc);
      saveConfig();
      render();
    }
  }
});

let resizeTimer=null;
let lastRenderWidth=window.innerWidth;
window.addEventListener("resize",()=>{
  // On mobile, the browser chrome (address bar) shrinks/grows during scroll,
  // triggering spurious resize events that only change height — ignore those.
  const w=window.innerWidth;
  if(w===lastRenderWidth)return;
  lastRenderWidth=w;
  clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>render(),150);
});
document.addEventListener("change",e=>{
  const el=e.target;
  if(!el||!el.dataset)return;
  // Track PIN form type selection for re-renders
  if(el.id==="pin-form-type"){pinFormType=el.value;return;}
  if(el.dataset.action==="recolor-tag"){page().tags[el.dataset.tag]=el.value;saveConfig();const pill=el.closest("div");if(pill)pill.style.borderColor=el.value;}
  if(el.dataset.action==="set-text-color"){page().textColor=el.value;applyTextColor();saveConfig();render();}
  // Widget field change (for datetime-local, number etc)
  if(el.dataset.action==="edit-widget-field"){
    const ci=parseInt(el.dataset.cat),si=parseInt(el.dataset.svc),f=el.dataset.field;
    const svc=page().categories[ci].services[si];
    if(f==="iframeHeight")svc[f]=parseInt(el.value)||200;else svc[f]=el.value;
    saveConfig();
  }
  // Image widget upload
  if(el.dataset.action==="upload-widget-image"){
    const file=el.files[0];if(!file)return;
    const ci=parseInt(el.dataset.cat),si=parseInt(el.dataset.svc);
    const svc=page().categories[ci]?.services[si];if(!svc)return;
    compressImage(file,1920,1080,0.82).then(async({dataUrl})=>{
      try{
        const name="img_"+svc.id+".webp";
        const res=await fetch("/api/image",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,data:dataUrl})});
        const data=await res.json();
        if(data.url){svc.imageUrl=data.url+"?t="+Date.now();saveConfig();render();}
      }catch(e){console.error("Image upload failed",e);}
      el.value="";
    }).catch(e=>{console.error("Compress failed",e);el.value="";});
  }
  // Wallpaper upload
  if(el.dataset.action==="upload-logo"){
    const file=el.files[0];if(!file)return;
    const input=el;
    compressImage(file,400,400,0.9).then(async({dataUrl})=>{
      try{
        const res=await fetch("/api/wallpaper",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:"logo_custom.webp",data:dataUrl})});
        const data=await res.json();
        if(data.url){config.logoUrl=data.url+"?t="+Date.now();saveConfig();render();}
      }catch(e){console.error("Logo upload failed",e);}
      input.value="";
    }).catch(e=>{console.error("Compress failed",e);el.value="";});
  }
  if(el.dataset.action==="upload-wallpaper"){
    const file=el.files[0];if(!file)return;
    const wp=el.dataset.wp;
    const input=el;
    console.log("Wallpaper upload started:",file.name,Math.round(file.size/1024)+"KB");
    compressImage(file,1920,2160,0.82).then(async({dataUrl,isPortrait})=>{
      console.log("Compressed, uploading to server...");
      try{
        const res=await fetch("/api/wallpaper",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:wp+"_"+page().id+".webp",data:dataUrl})});
        const data=await res.json();
        console.log("Server response:",data);
        if(data.url){
          page().wallpaperDesktop=data.url+"?t="+Date.now();
          page().wallpaperFit=isPortrait?"contain":"cover";
          saveConfig();render();
        }
      }catch(e){console.error("Upload failed",e);}
      input.value="";
    }).catch(e=>{console.error("Compress failed",e);input.value="";});
  }
  // JSON file upload
  if(el.dataset.action==="json-upload"){
    const file=el.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{const ta=$("#json-text");if(ta)ta.value=reader.result;};
    reader.readAsText(file);
  }
});
// Close weather dropdown when clicking outside or scrolling
document.addEventListener("click",e=>{if(!e.target.closest(".weather-city-search")&&!e.target.closest(".weather-city-results")){document.querySelectorAll(".weather-city-results").forEach(d=>d.style.display="none");}},true);
document.addEventListener("scroll",()=>{document.querySelectorAll(".weather-city-results").forEach(d=>d.style.display="none");},true);

document.addEventListener("blur",e=>{const el=e.target;
  if(!el||!el.dataset)return;
  if(el.dataset.action==="edit-srv-url"&&el.value.trim()){const prefixed=autoPrefix(el.value);if(prefixed!==el.value){el.value=prefixed;const ci=parseInt(el.dataset.cat),si=parseInt(el.dataset.svc),sri=parseInt(el.dataset.srv);page().categories[ci].services[si].servers[sri].url=prefixed;saveConfig();}}
  // Auto-fill service icon from name
  if(el.dataset.action==="edit-svc-name"&&el.value.trim()){
    const ci=parseInt(el.dataset.cat),si=parseInt(el.dataset.svc);
    const svc=page().categories[ci]?.services[si];
    if(svc&&!svc.icon){const name=el.value.toLowerCase().replace(/[^a-z0-9]/g,"");
      fetch("/api/icons/"+encodeURIComponent(name)+"/url").then(r=>r.json()).then(d=>{if(d.url){svc.icon=d.url;saveConfig();render();reopenSvc(ci,si);}}).catch(()=>{});}
  }
  // Auto-fill bookmark icon from label
  if(el.dataset.action==="edit-bm-label"&&el.value.trim()){
    const ci=parseInt(el.dataset.cat),si=parseInt(el.dataset.svc),li=parseInt(el.dataset.li);
    const lk=page().categories[ci]?.services[si]?.links[li];
    if(lk&&!lk.icon){const name=el.value.toLowerCase().replace(/[^a-z0-9]/g,"");
      fetch("/api/icons/"+encodeURIComponent(name)+"/url").then(r=>r.json()).then(d=>{if(d.url){lk.icon=d.url;saveConfig();render();reopenSvc(ci,si);}}).catch(()=>{});}
  }
},true);

loadConfig();
let _lastWallpaperWidth=window.innerWidth;
window.addEventListener("resize",()=>{const w=window.innerWidth;if(w!==_lastWallpaperWidth){_lastWallpaperWidth=w;if(page()&&page().wallpaperDesktop)applyWallpaper();}});

// Pause all background polling when the tab is hidden to avoid generating
// excessive requests that could trigger CrowdSec (or other IDS/IPS) rate-limiting
// rules when the dashboard is exposed through a reverse proxy such as Pangolin.
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){
    stopHealthLoop();
    stopIntegrations();
  } else {
    if(!editMode){
      fetch("/api/config").then(r=>r.json()).then(data=>{
        if(data&&data._version)configVersion=data._version;
        if(data&&data.pages){config=data;render();}
      }).catch(()=>{});
    }
    startHealthLoop();
    if(page())startIntegrations();
  }
});

fetch("/api/version").then(r=>r.json()).then(d=>{const f=document.getElementById("app-footer");if(f)f.textContent="roampage v"+d.version;}).catch(()=>{});
