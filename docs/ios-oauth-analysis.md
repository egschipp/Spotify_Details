# iOS/iPadOS OAuth probleem — Analyse & Oplossingsrichtingen

## A) Symptoomsamenvatting (max 5 bullets)

- Na Spotify OAuth redirect op iOS/iPadOS blijft de app op **“Spotify auth required”**.
- `/api/spotify/auth/status` rapporteert **“Niet ingelogd”** ondanks succesvolle login.
- Op macOS Safari werkt dezelfde flow wél.
- Dit wijst op **cookie/state verlies** tussen `/auth/start` en `/auth/callback`.
- Mogelijke bijdrage: **proxy‑headers/redirect chain** of **canonical redirects (www ↔ non‑www)**.

## B) Top‑hypotheses (minimaal 14, geprioriteerd)

1. **SameSite‑regels blokkeren sessiecookie** in WebKit redirect flows.
2. **Secure‑flag ontbreekt** bij SameSite=None (WebKit weigert cookie).
3. **Domain mismatch** (www vs non‑www) → cookie niet meegestuurd.
4. **Path mismatch** (cookie Path te smal).
5. **Cookie TTL te kort** of session‑only gedrag op iOS.
6. **Proxy ziet verkeer als http** → verkeerde redirects/cookie flags.
7. **Spotify redirect URI mismatch** (scheme/host/path).
8. **301/308 canonical redirect** breekt auth chain op iOS.
9. **PKCE verifier/state client‑side** en verdwijnt.
10. **PKCE/state cookie niet HttpOnly** of door ITP beperkt.
11. **Edge runtime** afwijkingen in header/cookie handling.
12. **Proxy stripte Set‑Cookie headers** of combineert ze fout.
13. **Clock drift** op Pi → token lijkt direct expired.
14. **Session storage ephemeral** (container restart / volume issues).
15. **LAN vs publiek domein** wisselt (Host mismatch).
16. **In‑app browser** gebruikt andere cookie jar.

## C) Beslisboom (kort)

1. Callback ziet **cookie?**
   - Nee → cookie policy/redirect chain (B1–B4, B8).
2. Cookie wel, maar **state mismatch?**
   - Ja → PKCE/state store issue (B9–B10).
3. Token exchange ok, maar **auth required** blijft?
   - Session store write/read (B13–B14).
4. Alleen iOS faalt?
   - WebKit ITP / SameSite / redirects (B1–B2, B8, B16).

## D) Oplossingsrichtingen (geïmplementeerd)

1. **OAuth nonce cookie** (SameSite=None; Secure; HttpOnly; Path=/; TTL 10 min).
2. **Server‑side PKCE store** (`oauth.json`) met TTL en cleanup.
3. **Callback fallback op state** als cookie ontbreekt.
4. **Forwarded headers** gebruiken voor redirect URI/base URL.
5. **Node runtime** voor auth routes (stabilere headers/cookies).
6. **Session cookie** blijft Lax (veilig) — nonce cookie is None.

## E) Aanbevolen proxy‑instellingen (Caddy)

```caddyfile
example.com {
  reverse_proxy localhost:3000 {
    header_up Host {host}
    header_up X-Forwarded-Proto {scheme}
    header_up X-Forwarded-Host {host}
    header_up X-Forwarded-For {remote_host}
  }
}
```

Vermijd 301/308 in de auth chain; gebruik 302/303 bij redirects tijdens debugging.

## F) Logging/telemetrie (zonder secrets)

Server‑side logs in `/auth/start` en `/auth/callback`:
- host, x‑forwarded‑host, x‑forwarded‑proto
- user‑agent
- state‑hash prefix (geen raw state)
- cookie presence (oauth_nonce)

## G) Aanbevolen testplan (iOS)

1. Safari + Brave, **Prevent Cross‑Site Tracking** aan/uit.
2. Typ URL in Safari (geen in‑app browser).
3. Check redirect chain (geen 301/308).
4. Controleer callback headers en cookie presence.
5. Verifieer Spotify redirect URI exact.
