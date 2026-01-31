# Spotify Details

Next.js App Router app that fetches Spotify playlist metadata (including private playlists) with OAuth PKCE and server-side token storage.

## Features

- OAuth PKCE login with Spotify
- Private playlists + liked tracks
- Now Playing + artist details
- CSV export (tracks and playlists)
- Server-side token storage (no tokens in the browser)

## Requirements

- Node.js 20+
- A Spotify Developer App (Client ID + Client Secret)

Optional for production:
- Docker + Docker Compose
- Reverse proxy (Caddy/Nginx)

## Environment variables

Required:
- `SPOTIFY_CRED_ENCRYPTION_KEY` (32-byte hex or base64)  
  Used to encrypt client secret and tokens at rest.

Recommended:
- `SPOTIFY_SESSION_SIGNING_KEY` (32-byte hex or base64)  
  Signs the session cookie. If not set, `SPOTIFY_CRED_ENCRYPTION_KEY` is used.

Production (recommended):
- `SPOTIFY_REDIRECT_BASE`  
  Absolute base URL of your app (e.g. `https://example.com/spotify`)
- `SPOTIFY_COOKIE_DOMAIN`  
  Optional override for cookie domain (e.g. `.example.com`)

Optional:
- `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`  
  Only needed if you want server-side artist lookups without per-session credentials.
- `SPOTIFY_DATA_DIR`  
  Override data directory path (default: `./data`)
- `CACHE_DEBUG_TOKEN`  
  Token to protect `/api/debug/cache` (cache metrics). Must match `NEXT_PUBLIC_CACHE_DEBUG_TOKEN`.
- `NEXT_PUBLIC_CACHE_DEBUG_TOKEN`  
  Same value as `CACHE_DEBUG_TOKEN` for client-side diagnostics.

Generate a 32-byte hex key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Local development

1) Install dependencies
```bash
npm install
```

2) Create `.env.local` from `.env.local.example` and set the encryption key:
```
SPOTIFY_CRED_ENCRYPTION_KEY=YOUR_32_BYTE_KEY
```

3) Add the redirect URI in Spotify Developer Dashboard:
```
http://localhost:3000/api/spotify/auth/callback
```

4) Run the app
```bash
npm run dev
```

Open `http://localhost:3000` and enter your Spotify Client ID/Secret.

## Production with Docker (example)

`docker-compose.yml` (example):
```yaml
services:
  spotify-details:
    image: ghcr.io/<OWNER>/<REPO>:latest
    container_name: spotify-details
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_BASE_PATH: /spotify
      SPOTIFY_DATA_DIR: /app/data
      TZ: Europe/Amsterdam
      HOSTNAME: 0.0.0.0
      SPOTIFY_REDIRECT_BASE: https://example.com/spotify
    env_file:
      - .env
    volumes:
      - spotify_details_data:/app/data
    expose:
      - "3000"
    networks:
      - web

volumes:
  spotify_details_data:

networks:
  web:
    external: true
```

`.env` (production example):
```
SPOTIFY_CRED_ENCRYPTION_KEY=YOUR_32_BYTE_KEY
SPOTIFY_SESSION_SIGNING_KEY=YOUR_32_BYTE_KEY
SPOTIFY_REDIRECT_BASE=https://example.com/spotify
SPOTIFY_COOKIE_DOMAIN=.example.com
```

## Reverse proxy (Caddy example)

```caddyfile
example.com {
  reverse_proxy localhost:3000 {
    header_up Host {host}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}
  }
}
```

## Raspberry Pi deployment (container + Caddy)

### 1) App container on the Pi
Place the app compose file in `/opt/spotify-details/docker-compose.yml` (example):
```yaml
services:
  spotify-details:
    image: ghcr.io/<OWNER>/<REPO>:latest
    container_name: spotify-details
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_BASE_PATH: /spotify
      SPOTIFY_DATA_DIR: /app/data
      TZ: Europe/Amsterdam
      HOSTNAME: 0.0.0.0
      SPOTIFY_REDIRECT_BASE: https://<PUBLIC_HOST>/spotify
    env_file:
      - .env
    volumes:
      - spotify_details_data:/app/data
    expose:
      - "3000"
    networks:
      - web

volumes:
  spotify_details_data:

networks:
  web:
    external: true
```

### 2) Caddy container on the Pi
Example Caddy compose in `/opt/caddy/docker-compose.yml`:
```yaml
services:
  caddy:
    image: caddy:2
    container_name: caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - web

volumes:
  caddy_data:
  caddy_config:

networks:
  web:
    external: true
```

### 3) Caddyfile on the Pi
`/opt/caddy/Caddyfile`:
```caddyfile
<PUBLIC_HOST> {
  reverse_proxy spotify-details:3000 {
    header_up Host {host}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}
  }
}
```

### 4) Public exposure on an external IP
To make the app reachable from the internet:
1) Point your DNS (A/AAAA record) to your **external/public IP**.  
2) Forward ports **80** and **443** on your router to the Pi’s internal IP.  
3) Ensure Caddy is running and can bind to ports 80/443.  

When this is set, your app is reachable at:
```
https://<PUBLIC_HOST>/spotify
```

## Tests

```bash
npm test
```

## Troubleshooting

- **Auth fails or redirects with errors**  
  Ensure the Spotify redirect URI matches exactly:
  `https://example.com/spotify/api/spotify/auth/callback`
- **Auth required loops on iOS**  
  Confirm cookies are set with `SameSite=None; Secure` and the correct domain.
- **Credentials save fails**  
  Check volume permissions and `SPOTIFY_CRED_ENCRYPTION_KEY`.
- **Now Playing not shown**  
  Make sure the user has an active playback session in Spotify.

## Security notes

- Client secrets and tokens are stored server-side and encrypted.
- Session cookie is HttpOnly and signed.
- Do not commit `.env` files.
