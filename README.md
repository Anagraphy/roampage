# 🚐 Roampage
A self-hosted, responsive dashboard for your services. Fully configurable from the browser — no code editing needed.
## Features
- **Responsive** — Works on desktop and mobile
- **Inline editing** — Click "Config" to add/edit/remove categories, services, servers
- **Multi-server support** — Tap a service with multiple servers to choose which one to open
- **Multi-page** — Create multiple pages, each with their own categories, services, tags and wallpaper
- **Live health checks** — Client-side pings show real-time up/down status for each service and server
- **Custom tags** — Create, rename, recolor and delete tags with a built-in color picker
- **Wallpaper** — Upload a background image per page with automatic compression and smooth gradient fade
- **Icon browser** — Browse and search 2500+ icons from dashboardicons.com directly in the editor
- **Persistent config** — Saved to a JSON file via Docker volume
- **Import/Export** — Backup and restore your config as JSON, with download/upload file support
- **Auto URL prefix** — IP addresses automatically get `http://`, domains get `https://`
- **No build step** — Pure HTML/CSS/JS frontend, Node.js backend
## Quick Start
```bash
docker compose up -d
```
Open `http://localhost:3046` and click **Config** to set up your services.
## Configuration
All configuration is done through the web UI. Click the **Config** button in the top-right corner.
You can also manually edit the config file at the mounted volume path `/data/config.json` inside the container).
### Environment Variables
| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Internal port the server listens on |
| `CONFIG_PATH` | `/data/config.json` | Path to the config file |
| `ENCRYPTION_KEY` | *(auto)* | AES-256-GCM key for config & backups — see below |

### Encryption

Config and backups are encrypted at rest with AES-256-GCM. Three modes are available:

| `ENCRYPTION_KEY` value | Behaviour |
|---|---|
| *(not set)* | A random key is generated on first run and saved to `./data/.roampage.key`. Survives container restarts as long as the volume is intact, but backups become unrestorable if the key file is lost. |
| `"64-hex-chars"` | Fixed key, stays valid across rebuilds and volume migrations. **Recommended for reliability.** Generate once with `openssl rand -hex 32`. |
| `"none"` | Encryption disabled — config and backups stored as plain JSON. Backups are always restorable; no key to manage. |

> **Migration note:** switching from encrypted to `none` (or vice-versa) requires exporting your config from the UI first, then deleting `data/config.json` and any old backups before restarting with the new mode.
### Default docker-compose.yml
```yaml
services:
  roampage:
    build: .
    container_name: roampage
    ports:
      - "3046:3000"
    volumes:
      - roampage_data:/data
    restart: unless-stopped
volumes:
  roampage_data:
```
### Custom port
```yaml
ports:
  - "8080:3000"
```
### Bind mount instead of named volume
```yaml
volumes:
  - ./config:/data
```
## Data
- **Config** is stored at `/data/config.json`
- **Wallpapers** are stored at `/data/wallpapers/`
Both are persisted via the Docker volume.
## Security

### Security model

Roampage is designed for **trusted local networks** (home LAN, self-hosted VPN). Its security model assumes that anyone who can reach the server is allowed to use it — there is no built-in login.

### No authentication

Anyone who can reach Roampage can read and write your full configuration, including API keys and integration credentials stored in it.

**If you expose Roampage outside your local network** (public internet, shared VPN, etc.), add authentication at the reverse-proxy layer before doing so. Tools like [Authelia](https://www.authelia.com/), [Authentik](https://goauthentik.io/), or nginx basic auth work well for this.

### API keys in transit

Integration credentials (Jellyfin API key, Pi-hole password, etc.) are transmitted between your browser and Roampage. On a plain HTTP setup they travel in cleartext on the local network.

If this matters to you, place Roampage behind a reverse proxy that terminates HTTPS (Caddy, nginx, Traefik).

### What is protected

| Protection | Details |
|---|---|
| Config & backups at rest | AES-256-GCM encryption (see [Encryption](#encryption)) |
| Security headers | CSP, HSTS (HTTPS only), `X-Content-Type-Options`, `Referrer-Policy` |
| Rate limiting | All API endpoints are rate-limited per IP |
| SSRF | Loopback and cloud metadata IPs are blocked; DNS rebinding mitigated |
| File uploads | Extension + magic-byte validation, 10 MB size limit |

## Stack
- **Frontend**: Vanilla HTML/CSS/JS (no framework, no build)
- **Backend**: Node.js + Express
- **Icons**: [homarr-labs/dashboard-icons](https://github.com/homarr-labs/dashboard-icons)
- **Storage**: JSON file + image files on disk
