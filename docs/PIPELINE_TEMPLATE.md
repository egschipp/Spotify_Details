# CI/CD Pipeline Template (invulbare variabelen)

Vul de waarden hieronder in en gebruik het document daarna als directe instructie
voor een nieuwe app. Waar `{VAR}` staat, gebruik je jouw waarde.

## 0) Variabelen (invullen)
Hier vul je alles in wat de rest van dit document gebruikt. Onder elke variabele
staat waarvoor het is en hoe je die waarde vindt.

```
GITHUB_OWNER="<OWNER>"              # GitHub user of org
REPO_NAME="<REPO>"                  # Repo naam
APP_NAME="<APP_NAME>"               # Human‑friendly naam
SERVICE_NAME="<service-name>"       # Docker compose service + container_name
APP_PORT="3000"                     # App poort in container
APP_DIR="/home/<user>/<app>"        # Deploy map op Raspberry Pi
PUBLIC_HOST="<app.domein.nl>"       # Publiek domein

PI_HOST="<pi.domein.nl>"            # Raspberry Pi host
PI_USER="<deploy_user>"             # Deploy user
PI_SSH_KEY="<PRIVATE_KEY>"          # Private SSH key inhoud

ENV_FILE_CONTENT="<.env inhoud>"    # (optioneel) .env inhoud voor productie
```

**Uitleg per variabele**

- `GITHUB_OWNER`  
  Waarvoor: eigenaar van de repo (user of org) en onderdeel van de GHCR image‑naam.  
  Waar vinden: in de repo‑URL. Voorbeeld: `github.com/<OWNER>/<REPO>`.

- `REPO_NAME`  
  Waarvoor: repo‑naam en onderdeel van de GHCR image‑naam.  
  Waar vinden: in de repo‑URL na de owner.

- `APP_NAME`  
  Waarvoor: leesbare naam in documentatie/logs.  
  Waar vinden: kies zelf (bv. “Spotify Details”).

- `SERVICE_NAME`  
  Waarvoor: service‑naam in `docker-compose.yml` én `container_name`.  
  Waar vinden: kies zelf (consistente naam), bv. `spotify-details`.

- `APP_PORT`  
  Waarvoor: interne poort waarop de app luistert.  
  Waar vinden: in je app config (bijv. `PORT=3000`) of framework default.

- `APP_DIR`  
  Waarvoor: map op de Pi waar `docker-compose.yml` en `.env` staan.  
  Waar vinden: kies zelf, bv. `/home/gh_deploy/<app>` of `/opt/<app>`.

- `PUBLIC_HOST`  
  Waarvoor: je publieke domein (voor DNS, TLS en redirect‑URI’s).  
  Waar vinden: je DNS‑record of hostingconfig (bv. `app.example.com`).

- `PI_HOST`  
  Waarvoor: SSH target host voor deploy.  
  Waar vinden: je publieke hostname of IP van de Pi.

- `PI_USER`  
  Waarvoor: Linux user op de Pi die docker mag gebruiken.  
  Waar vinden: bestaande deploy user (bv. `gh_deploy`). Zorg dat deze in de `docker`‑groep zit.

- `PI_SSH_KEY`  
  Waarvoor: private key die GitHub Actions gebruikt om via SSH te deployen.  
  Waar vinden/maken: lokaal genereren:  
  `ssh-keygen -t ed25519 -C "gh-actions-deploy" -f gh_actions_pi`  
  Voeg de **public key** toe op de Pi in `~/.ssh/authorized_keys` van `PI_USER`.  
  Zet de **private key** in GitHub Secrets als `PI_SSH_KEY`.

- `ENV_FILE_CONTENT` (optioneel)  
  Waarvoor: productie‑config in `.env` die tijdens deploy geschreven wordt.  
  Waar vinden: je productie‑waarden (API keys, DB URL’s) — **niet** in de repo.

**Afgeleide waarden**
```
IMAGE_NAME="ghcr.io/${GITHUB_OWNER}/${REPO_NAME}"
IMAGE_LATEST="${IMAGE_NAME}:latest"
IMAGE_SHA="${IMAGE_NAME}:sha-<commit>"
```

---

## 1) Doel van de pipeline
- Build image in GitHub Actions
- Push naar GHCR (`${IMAGE_NAME}`)
- Deploy via SSH op Raspberry Pi met Docker Compose
- Healthcheck + rollback bij failure

---

## 2) Repo‑structuur
Benodigd in de repo:
- `Dockerfile`
- `docker-compose.yml`
- `.github/workflows/deploy.yml`

---

## 3) GitHub Secrets (Repository → Settings → Secrets → Actions)
Voeg toe:
- `PI_HOST` = `${PI_HOST}`
- `PI_USER` = `${PI_USER}`
- `PI_SSH_KEY` = inhoud van de private SSH key
- `APP_ENV_FILE` (optioneel) = `${ENV_FILE_CONTENT}`

---

## 4) Docker Compose (op de Pi)
Plaats dit in `${APP_DIR}/docker-compose.yml` of laat de workflow dit downloaden.

```yaml
services:
  ${SERVICE_NAME}:
    image: ${IMAGE_LATEST}
    container_name: ${SERVICE_NAME}
    restart: unless-stopped
    ports:
      - "${APP_PORT}:${APP_PORT}"
    env_file:
      - .env
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:${APP_PORT}/health || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 6
```

---

## 5) Raspberry Pi voorbereiding
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker ${PI_USER}
sudo apt-get install -y docker-compose-plugin
```

Maak deploy map:
```bash
mkdir -p ${APP_DIR}
```

---

## 6) GitHub Actions workflow (concept)
**Belangrijkste onderdelen**
- `permissions: contents: read, packages: write`
- Build & push multi‑arch image
- SSH deploy naar Pi met `docker compose pull` + `up -d`

**Deploy script (SSH step)**
```bash
set -euo pipefail

APP_DIR="${APP_DIR}"
SERVICE="${SERVICE_NAME}"
IMAGE="${IMAGE_LATEST}"

mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Schrijf .env als secret (optioneel)
if [ -n "${APP_ENV_FILE:-}" ]; then
  echo "${APP_ENV_FILE}" > .env
  chmod 600 .env
fi

# Optioneel: compose sync uit repo
curl -fsSL "https://raw.githubusercontent.com/${GITHUB_OWNER}/${REPO_NAME}/main/docker-compose.yml" -o docker-compose.yml

# Deploy
PREV_IMAGE_ID=$(docker inspect --format='{{.Image}}' "$SERVICE" 2>/dev/null || true)
docker compose pull
docker compose up -d --remove-orphans

# Healthcheck (max ~3 minuten)
for i in $(seq 1 36); do
  STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$SERVICE" 2>/dev/null || echo "unknown")
  echo "Health status: $STATUS"
  if [ "$STATUS" = "healthy" ]; then
    echo "Deploy OK"
    exit 0
  fi
  if [ "$STATUS" = "unhealthy" ]; then
    echo "Unhealthy; failing early."
    break
  fi
  sleep 5
done

echo "Healthcheck failed; attempting rollback..."
if [ -n "$PREV_IMAGE_ID" ]; then
  printf "services:\n  %s:\n    image: %s\n" "$SERVICE" "$PREV_IMAGE_ID" > docker-compose.override.yml
  docker compose up -d --remove-orphans
  rm -f docker-compose.override.yml
fi
exit 1
```

---

## 7) Gebruik voor nieuwe app
1. Vul bovenaan de variabelen in.
2. Pas `docker-compose.yml` aan met `${SERVICE_NAME}` en `${APP_PORT}`.
3. Zet GitHub Secrets voor `PI_HOST`, `PI_USER`, `PI_SSH_KEY`, `APP_ENV_FILE`.
4. Push naar `main` → deploy start automatisch.

---

## 8) Troubleshooting (kort)
- **Healthcheck fail** → check `/health` endpoint en logs: `docker compose logs -f`
- **Pull fail** → check image tags in GHCR
- **SSH fail** → check key + `PI_HOST`
