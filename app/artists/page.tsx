"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BrandHeader from "@/app/ui/BrandHeader";

type TrackSummary = {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: { id: string; name: string; images: { url: string }[] };
  spotifyUrl: string | null;
  durationMs: number;
  playlistNames: string[];
};

type ArtistOption = {
  id: string;
  name: string;
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) => (basePath ? `${basePath}${path}` : path);

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function ArtistsPage() {
  const [authStatus, setAuthStatus] = useState<{ authenticated: boolean }>({
    authenticated: false
  });
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TrackSummary[]>([]);
  const [artistOptions, setArtistOptions] = useState<ArtistOption[]>([]);
  const [artistId, setArtistId] = useState("");
  const [selectedTrack, setSelectedTrack] = useState<TrackSummary | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<"ok" | "syncing" | "error" | null>(
    null
  );
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const router = useRouter();

  const filteredTracks = useMemo(() => {
    if (!artistId) return [];
    return tracks.filter((track) =>
      track.artists.some((artist) => artist.id === artistId)
    );
  }, [tracks, artistId]);

  useEffect(() => {
    setSelectedTrack(null);
  }, [artistId]);

  useEffect(() => {
    async function loadStatus() {
      const authRes = await fetch(withBasePath("/api/spotify/auth/status"));
      const authJson = await authRes.json();
      setAuthStatus(authJson);
      if (!authJson.authenticated) {
        router.replace("/credentials");
      }
    }

    void loadStatus();
  }, [router]);

  useEffect(() => {
    fetch(withBasePath("/api/session/refresh"), { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!authStatus.authenticated) return;
    setLoading(true);
    setErrorMessage(null);
    fetch(withBasePath("/api/spotify/artists"), { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 401) {
            router.replace("/credentials");
            return;
          }
          throw new Error(data.error ?? "Failed to fetch artist data.");
        }
        setTracks(data.tracks ?? []);
        setArtistOptions(data.artists ?? []);
        setUpdatedAt(data.updatedAt ?? null);
        setSyncStatus(data.syncStatus ?? null);
      })
      .catch((error) => setErrorMessage((error as Error).message))
      .finally(() => setLoading(false));
  }, [authStatus.authenticated]);

  async function handleForceRefresh() {
    if (!authStatus.authenticated) return;
    setRefreshing(true);
    setSyncStatus("syncing");
    try {
      const res = await fetch(withBasePath("/api/spotify/artists?force=1"), {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to refresh artist data.");
      }
      setTracks(data.tracks ?? []);
      setArtistOptions(data.artists ?? []);
      setUpdatedAt(data.updatedAt ?? null);
      setSyncStatus(data.syncStatus ?? "ok");
    } catch (error) {
      setSyncStatus("error");
      setErrorMessage((error as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuOpen) return;
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <main className="min-h-screen px-4 py-8 md:px-10 md:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <BrandHeader />
        <h1 className="font-display text-3xl font-semibold text-white md:text-4xl">
          Artists
        </h1>

        <section className="grid gap-6 rounded-3xl bg-mist p-6 shadow-card">
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-2xl font-semibold">
                Select an artist
              </h2>
              <p className="text-sm text-white/60">
                Alphabetical list from all playlists and liked songs.
              </p>
            </div>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                ref={buttonRef}
                onClick={() => setMenuOpen((prev) => !prev)}
                disabled={!authStatus.authenticated || loading}
                aria-haspopup="listbox"
                aria-expanded={menuOpen}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/70 px-4 py-3 text-left text-sm text-white shadow-card transition focus:border-tide focus:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="truncate">
                  {loading
                    ? "Loading artists..."
                    : artistId
                      ? artistOptions.find((artist) => artist.id === artistId)?.name ??
                        "Select an artist"
                      : "Select an artist"}
                </span>
                <span className="ml-3 text-white/60">
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-4 w-4 transition ${menuOpen ? "rotate-180" : ""}`}
                    aria-hidden="true"
                  >
                    <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
                  </svg>
                </span>
              </button>

              {menuOpen && (
                <div
                  role="listbox"
                  aria-label="Artists"
                  className="absolute z-10 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-white/10 bg-black/90 p-2 shadow-card"
                >
                  {artistOptions.length === 0 && (
                    <div className="px-3 py-2 text-sm text-white/60">
                      No artists available.
                    </div>
                  )}
                  {artistOptions.map((artist) => {
                    const isSelected = artist.id === artistId;
                    return (
                      <button
                        key={artist.id}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setArtistId(artist.id);
                          setMenuOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition ${
                          isSelected
                            ? "bg-tide/20 text-white"
                            : "text-white/80 hover:bg-white/5"
                        }`}
                      >
                        <span className="truncate">{artist.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {errorMessage && (
            <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200" role="alert">
              {errorMessage}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-white/60">
              <span>
                {artistId
                  ? `${filteredTracks.length} tracks`
                  : "Select an artist to view tracks"}
              </span>
              <span className="flex items-center gap-3">
                {updatedAt && (
                  <span className="text-xs text-white/50">
                    Updated {new Date(updatedAt).toLocaleString("en-US")}
                  </span>
                )}
                {syncStatus && (
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.2em] ${
                      syncStatus === "ok"
                        ? "bg-tide/20 text-tide"
                        : syncStatus === "syncing"
                          ? "bg-white/10 text-white/60"
                          : "bg-red-500/20 text-red-200"
                    }`}
                  >
                    {syncStatus === "ok"
                      ? "connected"
                      : syncStatus === "syncing"
                        ? "syncing"
                        : "error"}
                  </span>
                )}
                {loading && <span>Loading library...</span>}
              </span>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleForceRefresh}
                disabled={refreshing || loading}
                className="rounded-full border border-white/15 bg-black/50 px-4 py-2 text-xs font-semibold text-white/80 transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? "Refreshing..." : "Force refresh"}
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/70">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Tracks saved by selected artist.</caption>
                <thead className="bg-steel/80 text-xs uppercase tracking-[0.2em] text-white/50">
                  <tr>
                    <th scope="col" className="px-4 py-3">Track</th>
                    <th scope="col" className="px-4 py-3">Album</th>
                    <th scope="col" className="px-4 py-3">Duration</th>
                    <th scope="col" className="px-4 py-3">Playlists</th>
                    <th scope="col" className="px-4 py-3">Spotify</th>
                  </tr>
                </thead>
                <tbody>
                  {!artistId && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-white/50">
                        Choose an artist to load tracks.
                      </td>
                    </tr>
                  )}
                  {artistId && filteredTracks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm text-white/50">
                        No saved tracks found for this artist.
                      </td>
                    </tr>
                  )}
                  {filteredTracks.map((track) => (
                    <tr key={track.id} className="border-t border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => setSelectedTrack(track)}
                          className="text-left font-medium text-white transition hover:text-tide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                        >
                          <span className="inline-flex items-center gap-2">
                            {selectedTrack?.id === track.id && (
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4 w-4 text-tide"
                                aria-hidden="true"
                              >
                                <path
                                  fill="currentColor"
                                  d="M8 5v14l11-7z"
                                />
                              </svg>
                            )}
                            {track.name}
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3 text-white/70">{track.album.name}</td>
                      <td className="px-4 py-3 text-white/60">
                        {formatDuration(track.durationMs)}
                      </td>
                      <td className="px-4 py-3 text-white/60">
                        {track.playlistNames.join(", ")}
                      </td>
                      <td className="px-4 py-3">
                        {track.spotifyUrl ? (
                          <a
                            href={track.spotifyUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-tide hover:text-pulse"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="text-xs text-white/40">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                Player
              </div>
              <div className="mt-3">
                {selectedTrack ? (
                  <iframe
                    title={`Spotify player: ${selectedTrack.name}`}
                    src={`https://open.spotify.com/embed/track/${selectedTrack.id}`}
                    width="100%"
                    height="152"
                    allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                    loading="lazy"
                    className="rounded-xl border border-white/10"
                  />
                ) : (
                  <p className="text-sm text-white/60">
                    Select a track to start playback.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
