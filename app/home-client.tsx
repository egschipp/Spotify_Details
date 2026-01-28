"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const emptyTracks: TrackSummary[] = [];
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) =>
  basePath ? `${basePath}${path}` : path;

type TrackSummary = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string }[] };
  genre: string;
  subgenre: string;
  confidence: number;
  spotifyUrl: string | null;
  durationMs: number;
  explicit: boolean;
  popularity: number;
  previewUrl: string | null;
  uri: string;
  isLocal: boolean;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function HomePageClient() {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [playlistId, setPlaylistId] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [playlistOptions, setPlaylistOptions] = useState<
    { id: string; name: string; trackCount: number; owner: string }[]
  >([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [credStatus, setCredStatus] = useState<{
    hasCredentials: boolean;
    clientId?: string;
  }>({ hasCredentials: false });
  const [authStatus, setAuthStatus] = useState<{
    authenticated: boolean;
  }>({ authenticated: false });
  const [nowPlaying, setNowPlaying] = useState<{
    isPlaying: boolean;
    track: {
      id: string;
      name: string;
      artists: string[];
      album: string;
      cover: string | null;
      durationMs: number;
      spotifyUrl: string | null;
    } | null;
    artist: {
      id: string;
      name: string;
      genres: string[];
      followers: number;
      popularity: number;
      image: string | null;
      spotifyUrl: string | null;
    } | null;
  } | null>(null);
  const [loadingNowPlaying, setLoadingNowPlaying] = useState(false);
  const [tracks, setTracks] = useState<TrackSummary[]>(emptyTracks);
  const [loading, setLoading] = useState(false);
  const [loadingLiked, setLoadingLiked] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const trackCount = useMemo(() => tracks.length, [tracks.length]);

  async function loadStatus() {
    setErrorMessage(null);
    const [credRes, authRes] = await Promise.all([
      fetch(withBasePath("/api/credentials/status")),
      fetch(withBasePath("/api/spotify/auth/status"))
    ]);
    const credJson = await credRes.json();
    const authJson = await authRes.json();
    setCredStatus(credJson);
    setAuthStatus(authJson);
    if (credJson.clientId && !clientId) {
      setClientId(credJson.clientId);
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    const authError = searchParams.get("authError");
    if (authError) {
      setErrorMessage(decodeURIComponent(authError));
      router.replace("/");
    }
  }, [searchParams, router]);

  useEffect(() => {
    async function loadPlaylists() {
      if (!authStatus.authenticated) {
        setPlaylistOptions([]);
        setPlaylistId("");
        return;
      }
        setLoadingPlaylists(true);
      setErrorMessage(null);
      try {
        const res = await fetch(withBasePath("/api/spotify/playlists"));
        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.error ?? "Playlists ophalen mislukt.");
          return;
        }
        setPlaylistOptions(data.playlists ?? []);
      } catch (error) {
        setErrorMessage((error as Error).message);
      } finally {
        setLoadingPlaylists(false);
      }
    }

    void loadPlaylists();
  }, [authStatus.authenticated]);

  useEffect(() => {
    if (!authStatus.authenticated) {
      setNowPlaying(null);
      return;
    }

    let active = true;
    let timer: ReturnType<typeof setInterval> | null = null;

    const loadNowPlaying = async () => {
      setLoadingNowPlaying(true);
      try {
        const res = await fetch(withBasePath("/api/spotify/now-playing"));
        const data = await res.json();
        if (active && res.ok) {
          setNowPlaying(data);
        }
      } catch {
        if (active) {
          setNowPlaying(null);
        }
      } finally {
        if (active) {
          setLoadingNowPlaying(false);
        }
      }
    };

    void loadNowPlaying();
    timer = setInterval(loadNowPlaying, 3000);

    return () => {
      active = false;
      if (timer) {
        clearInterval(timer);
      }
    };
  }, [authStatus.authenticated]);

  async function handleSaveCredentials() {
    setStatusMessage(null);
    setErrorMessage(null);
    const res = await fetch(withBasePath("/api/credentials/save"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret })
    });
    if (!res.ok) {
      const data = await res.json();
      setErrorMessage(data.error ?? "Opslaan mislukt.");
      return;
    }
    setClientSecret("");
    await loadStatus();
    setStatusMessage("Credentials opgeslagen.");
  }

  async function handleClearCredentials() {
    setStatusMessage(null);
    setErrorMessage(null);
    const res = await fetch(withBasePath("/api/credentials/clear"), {
      method: "POST"
    });
    if (!res.ok) {
      const data = await res.json();
      setErrorMessage(data.error ?? "Wissen mislukt.");
      return;
    }
    setClientId("");
    setClientSecret("");
    await loadStatus();
    setStatusMessage("Credentials gewist.");
  }

  function handleLogin() {
    setStatusMessage(null);
    setErrorMessage(null);
    window.location.href = withBasePath("/api/spotify/auth/start");
  }

  async function handleFetchPlaylist() {
    setStatusMessage(null);
    setErrorMessage(null);
    setLoading(true);
    setTracks(emptyTracks);
    try {
      const res = await fetch(withBasePath("/api/spotify/playlist"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId })
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "Playlist ophalen mislukt.");
        return;
      }
      setTracks(data.tracks ?? []);
      setStatusMessage(`Playlist geladen: ${data.total} tracks.`);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleFetchLiked() {
    setStatusMessage(null);
    setErrorMessage(null);
    setLoadingLiked(true);
    setTracks(emptyTracks);
    try {
      const res = await fetch(withBasePath("/api/spotify/liked"), {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "Liked songs ophalen mislukt.");
        return;
      }
      setTracks(data.tracks ?? []);
      setStatusMessage(`Liked songs geladen: ${data.total} tracks.`);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoadingLiked(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.4em] text-white/40">
            Spotify Details
          </p>
          <h1 className="font-display text-4xl font-semibold leading-tight md:text-5xl">
            Georgies Spotify Metadata
          </h1>
          <p className="max-w-2xl text-base text-white/70">
            Authenticeer veilig en bekijk metadata van openbare en prive
            playlists met uitgebreide trackmetadata.
          </p>
        </header>

        <section className="grid gap-6 rounded-3xl bg-mist/80 p-6 shadow-card backdrop-blur md:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">
                Spotify Client ID
              </label>
              <input
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                placeholder={credStatus.clientId ?? "Plak je Client ID"}
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white focus:border-tide focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-white/80">
                Spotify Client Secret
              </label>
              <input
                type="password"
                value={clientSecret}
                onChange={(event) => setClientSecret(event.target.value)}
                placeholder="Plak je Client Secret"
                className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white focus:border-tide focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleSaveCredentials}
                className="rounded-full bg-tide px-5 py-2.5 text-sm font-semibold text-black shadow-glow transition hover:bg-pulse"
              >
                Opslaan credentials
              </button>
              <button
                onClick={handleClearCredentials}
                className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white transition hover:border-white/40"
              >
                Wis credentials
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-black/50 p-5">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                Status
              </p>
              <div className="mt-2 flex flex-col gap-2 text-sm text-white/80">
                <span>
                  Credentials: {credStatus.hasCredentials ? "opgeslagen" : "ontbreekt"}
                </span>
                <span>
                  Spotify auth: {authStatus.authenticated ? "ingelogd" : "niet ingelogd"}
                </span>
              </div>
            </div>
            <button
              onClick={handleLogin}
              disabled={!credStatus.hasCredentials}
              className="rounded-full bg-tide px-5 py-2.5 text-sm font-semibold text-black shadow-glow transition hover:bg-pulse disabled:cursor-not-allowed disabled:opacity-50"
            >
              Inloggen met Spotify
            </button>
            <p className="text-xs text-white/50">
              Na inloggen worden tokens server-side bewaard. Geen tokens in de
              browser.
            </p>
          </div>
        </section>

        <section className="rounded-3xl bg-mist/80 p-6 shadow-card backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-2xl font-semibold">Now Playing</h2>
              <p className="text-sm text-white/60">
                Live uit je Spotify player (ververst elke 3s).
              </p>
            </div>
            {loadingNowPlaying && (
              <span className="text-xs uppercase tracking-[0.2em] text-white/40">
                laden...
              </span>
            )}
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-black/50 p-4">
            {!authStatus.authenticated && (
              <p className="text-sm text-white/60">
                Log in om je huidige track te zien.
              </p>
            )}
            {authStatus.authenticated && !nowPlaying?.track && (
              <p className="text-sm text-white/60">
                Geen track actief op dit moment.
              </p>
            )}
            {authStatus.authenticated && nowPlaying?.track && (
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="h-20 w-20 overflow-hidden rounded-2xl bg-steel">
                  {nowPlaying.track.cover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={nowPlaying.track.cover}
                      alt={nowPlaying.track.album}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-lg font-semibold text-white">
                    {nowPlaying.track.name}
                  </p>
                  <p className="text-sm text-white/60">
                    {nowPlaying.track.artists.join(", ")}
                  </p>
                  <p className="text-xs text-white/40">
                    {nowPlaying.track.album}
                  </p>
                </div>
                {nowPlaying.track.spotifyUrl && (
                  <a
                    href={nowPlaying.track.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40"
                  >
                    Open in Spotify
                  </a>
                )}
              </div>
            )}
            {authStatus.authenticated && nowPlaying?.artist && (
              <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-black/40">
                {nowPlaying.artist.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={nowPlaying.artist.image}
                    alt={nowPlaying.artist.name}
                    className="h-40 w-full object-cover md:h-48"
                  />
                )}
                <div className="space-y-3 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                    Over de artiest
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">
                        {nowPlaying.artist.name}
                      </p>
                      <p className="text-xs text-white/50">
                        {nowPlaying.artist.followers.toLocaleString("nl-NL")} followers
                      </p>
                    </div>
                    {nowPlaying.artist.spotifyUrl && (
                      <a
                        href={nowPlaying.artist.spotifyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/40"
                      >
                        Open artist
                      </a>
                    )}
                  </div>
                  <div className="text-xs text-white/50">
                    Genres:{" "}
                    {nowPlaying.artist.genres.length
                      ? nowPlaying.artist.genres.join(", ")
                      : "Unknown"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="grid gap-6 rounded-3xl bg-mist/80 p-6 shadow-card backdrop-blur">
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-2xl font-semibold">
                Selecteer een playlist
              </h2>
              <p className="text-sm text-white/60">
                Kies uit je Spotify playlists (inclusief privé playlists).
              </p>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <div className="flex-1">
                <select
                  value={playlistId}
                  onChange={(event) => setPlaylistId(event.target.value)}
                  disabled={!authStatus.authenticated || loadingPlaylists}
                  className="w-full rounded-2xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white focus:border-tide focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">
                    {loadingPlaylists
                      ? "Playlists laden..."
                      : "Selecteer een playlist"}
                  </option>
                  {playlistOptions.map((playlist) => (
                    <option key={playlist.id} value={playlist.id}>
                      {playlist.name} · {playlist.trackCount} tracks · {playlist.owner}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleFetchPlaylist}
                  disabled={
                    !authStatus.authenticated ||
                    loading ||
                    loadingLiked ||
                    !playlistId
                  }
                  className="rounded-full bg-tide px-6 py-3 text-sm font-semibold text-black shadow-glow transition hover:bg-pulse disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Playlist laden
                </button>
                <button
                  onClick={handleFetchLiked}
                  disabled={!authStatus.authenticated || loading || loadingLiked}
                  className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Liked songs
                </button>
              </div>
            </div>
          </div>

          {statusMessage && (
            <div className="rounded-2xl border border-tide/30 bg-tide/10 px-4 py-3 text-sm text-tide">
              {statusMessage}
            </div>
          )}
          {errorMessage && (
            <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-white/60">
              <span>{trackCount ? `${trackCount} tracks` : "Nog geen tracks"}</span>
              {(loading || loadingLiked) && <span>Bezig met laden...</span>}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-steel/80 text-xs uppercase tracking-[0.2em] text-white/50">
                  <tr>
                    <th className="px-4 py-3">Cover</th>
                    <th className="px-4 py-3">Track</th>
                    <th className="px-4 py-3">Spotify</th>
                    <th className="px-4 py-3">Artists</th>
                    <th className="px-4 py-3">Album</th>
                    <th className="px-4 py-3">Genre</th>
                    <th className="px-4 py-3">Subgenre</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Duur</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-sm text-white/50">
                        Playlist wordt geladen...
                      </td>
                    </tr>
                  )}
                  {!loading && tracks.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center text-sm text-white/50">
                        Geen data. Log in en haal een playlist op.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    tracks.map((track) => (
                      <tr
                        key={track.id}
                        className="border-t border-white/5 hover:bg-white/5"
                      >
                        <td className="px-4 py-3">
                          <div className="h-12 w-12 overflow-hidden rounded-xl bg-steel">
                            {track.album.images?.[0] && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={
                                  track.album.images[track.album.images.length - 1]?.url ??
                                  track.album.images[0].url
                                }
                                alt={track.album.name}
                                className="h-full w-full object-cover"
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/track/${track.id}`}
                            className="font-medium text-white hover:text-tide"
                          >
                            {track.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {track.spotifyUrl ? (
                            <a
                              href={track.spotifyUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:border-tide hover:text-tide"
                              aria-label="Open in Spotify"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4"
                                aria-hidden="true"
                              >
                                <path
                                  fill="currentColor"
                                  d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.588 14.56a.75.75 0 0 1-1.032.248c-2.828-1.73-6.39-2.12-10.59-1.16a.75.75 0 1 1-.333-1.463c4.61-1.05 8.55-.607 11.72 1.33a.75.75 0 0 1 .235 1.045zm1.475-3.11a.9.9 0 0 1-1.238.297c-3.24-1.99-8.18-2.57-12.01-1.41a.9.9 0 1 1-.523-1.723c4.33-1.31 9.69-.66 13.33 1.56a.9.9 0 0 1 .44 1.276zm.126-3.23c-3.78-2.25-10.02-2.46-13.63-1.36a1.05 1.05 0 1 1-.612-2.01c4.16-1.26 11.07-1.01 15.43 1.56a1.05 1.05 0 0 1-1.188 1.81z"
                                />
                              </svg>
                            </a>
                          ) : (
                            <span className="text-xs text-white/40">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {track.artists.map((artist) => artist.name).join(", ")}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {track.album.name}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {track.genre}
                        </td>
                        <td className="px-4 py-3 text-white/70">
                          {track.subgenre}
                        </td>
                        <td className="px-4 py-3 text-white/60">
                          {track.confidence.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-white/60">
                          {formatDuration(track.durationMs)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
