# Spotify Details

Next.js App Router app that fetches Spotify playlist metadata (including private playlists) with OAuth PKCE and server-side token storage.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env.local` based on `.env.local.example` and set `SPOTIFY_CRED_ENCRYPTION_KEY`.

Generate a 32-byte hex key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

3. In the Spotify Developer Dashboard, add this redirect URI to your app:

```
http://localhost:3000/api/spotify/auth/callback
```

If Spotify disallows `localhost`, set this env var and register the matching URI:

```
SPOTIFY_REDIRECT_BASE=http://127.0.0.1:3000
```

Optional: set client credentials so the server can fetch artist info for Now Playing:

```
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
```



## Run

```bash
npm run dev
```

Open `http://localhost:3000` and enter your Spotify Client ID/Secret.

## Test

```bash
npm test
```

## Troubleshooting

- **Auth fails or redirects with errors**: verify the redirect URI matches the one in your Spotify app.
- **Credentials save fails**: ensure `SPOTIFY_CRED_ENCRYPTION_KEY` is set and valid (32 bytes hex/base64).
- **Auth status stays false**: clear credentials and re-authenticate to refresh the session.
