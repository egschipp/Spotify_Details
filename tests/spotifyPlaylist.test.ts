import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "./setup";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/spotify/playlist/route";
import { saveCredentials } from "@/lib/storage/credentialsStore";
import { setSession } from "@/lib/storage/sessionStore";
import crypto from "crypto";

const API_BASE = "https://api.spotify.com";
const SIGNING_KEY =
  process.env.SPOTIFY_SESSION_SIGNING_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.SPOTIFY_SESSION_SIGNING_KEY ||= SIGNING_KEY;

function signSessionId(sessionId: string) {
  const hmac = crypto
    .createHmac("sha256", Buffer.from(SIGNING_KEY, "hex"))
    .update(sessionId)
    .digest("base64url");
  return `${sessionId}.${hmac}`;
}

function createRequest(body: object) {
  const sessionId = "test-session";
  return new NextRequest("http://localhost/api/spotify/playlist", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      cookie: `spotify_details_sid=${signSessionId(sessionId)}`
    }
  });
}

describe("POST /api/spotify/playlist", () => {
  it("parses playlist URL and paginates", async () => {
    await saveCredentials("test-session", "client-id", "client-secret");
    await setSession("test-session", {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000
    });

    server.use(
      http.get(`${API_BASE}/v1/playlists/:id/tracks`, ({ request }) => {
        const url = new URL(request.url);
        const offset = url.searchParams.get("offset");
        if (offset === "0") {
          return HttpResponse.json({
            items: [
              {
                track: {
                  id: "track-1",
                  name: "Track One",
                  artists: [
                    { id: "artist-1", name: "Artist One" },
                    { id: "artist-2", name: "Artist Two" }
                  ],
                  album: {
                    id: "album-1",
                    name: "Album One",
                    images: [{ url: "cover-1", width: 100, height: 100 }]
                  },
                  duration_ms: 180000,
                  explicit: false,
                  popularity: 50,
                  preview_url: null,
                  uri: "spotify:track:track-1",
                  is_local: false
                }
              }
            ],
            next: `${API_BASE}/v1/playlists/abc/tracks?offset=100`,
            total: 2
          });
        }
        return HttpResponse.json({
          items: [
            {
              track: {
                id: "track-2",
                name: "Track Two",
                artists: [{ id: "artist-2", name: "Artist Two" }],
                album: {
                  id: "album-2",
                  name: "Album Two",
                  images: [{ url: "cover-2", width: 100, height: 100 }]
                },
                duration_ms: 200000,
                explicit: true,
                popularity: 70,
                preview_url: null,
                uri: "spotify:track:track-2",
                is_local: false
              }
            }
          ],
          next: null,
          total: 2
        });
      }),
      http.get(`${API_BASE}/v1/artists`, () => {
        return HttpResponse.json({
          artists: [
            { id: "artist-1", genres: ["synthwave", "electronic"] },
            { id: "artist-2", genres: ["pop"] }
          ]
        });
      }),
      http.get(`${API_BASE}/v1/audio-features`, () => {
        return HttpResponse.json({
          audio_features: [
            {
              id: "track-1",
              tempo: 120,
              energy: 0.8,
              danceability: 0.6,
              acousticness: 0.1,
              speechiness: 0.04,
              valence: 0.5,
              loudness: -6
            },
            {
              id: "track-2",
              tempo: 100,
              energy: 0.4,
              danceability: 0.5,
              acousticness: 0.4,
              speechiness: 0.05,
              valence: 0.4,
              loudness: -10
            }
          ]
        });
      }),
      http.get("https://en.wikipedia.org/w/api.php", ({ request }) => {
        const url = new URL(request.url);
        const search = url.searchParams.get("search");
        return HttpResponse.json(["", [search ?? ""], [], []]);
      }),
      http.get(
        "https://en.wikipedia.org/api/rest_v1/page/summary/:title",
        () => {
          return HttpResponse.json({
            extract: "A synthwave artist with retro 1980s sound."
          });
        }
      ),
      http.get("https://musicbrainz.org/ws/2/recording", () => {
        return HttpResponse.json({
          recordings: [
            {
              title: "Track One",
              disambiguation: "retro synth",
              tags: [{ name: "synthwave" }]
            }
          ]
        });
      })
    );

    const req = createRequest({
      playlistUrl: "https://open.spotify.com/playlist/abc"
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.playlistId).toBe("abc");
    expect(json.tracks).toHaveLength(2);
    expect(json.tracks[0].name).toBe("Track One");
    expect(json.tracks[0].genre).toBe("Electronic");
    expect(json.tracks[1].artists[0].id).toBe("artist-2");
  });

  it("returns 400 for invalid playlist url", async () => {
    const req = createRequest({ playlistUrl: "not-a-url" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
