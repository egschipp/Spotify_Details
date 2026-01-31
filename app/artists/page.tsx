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
  uri: string;
};

type ArtistOption = {
  id: string;
  name: string;
};

type PlaybackState = {
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  track: {
    id: string;
    name: string;
    artists: string[];
    album: string;
    albumArt: string | null;
    uri: string | null;
  } | null;
  device: { id: string | null; name: string | null; type: string | null } | null;
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) => (basePath ? `${basePath}${path}` : path);

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
  const playerRef = useRef<HTMLDivElement | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [playerVolume, setPlayerVolume] = useState(0.8);
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [seekValue, setSeekValue] = useState<number | null>(null);
  const [devices, setDevices] = useState<{ id: string; name: string; type: string; is_active: boolean }[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);
  const deviceMenuRef = useRef<HTMLDivElement | null>(null);

  function formatPlayerError(message: string) {
    if (message.includes("Invalid token scopes")) {
      return "Spotify player needs extra permissions. Open Credentials and log in again.";
    }
    return message;
  }
  const deviceButtonRef = useRef<HTMLButtonElement | null>(null);
  const playerInstanceRef = useRef<any>(null);
  const artistListRef = useRef<HTMLDivElement | null>(null);
  const artistAnchorRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const [artistSearch, setArtistSearch] = useState("");
  const artistSearchRef = useRef<HTMLInputElement | null>(null);
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
    artistAnchorRef.current = {};
  }, [artistOptions]);

  useEffect(() => {
    if (menuOpen) {
      requestAnimationFrame(() => artistSearchRef.current?.focus());
    }
  }, [menuOpen]);

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

  useEffect(() => {
    if (!authStatus.authenticated) return;
    void refreshPlaybackState();
    const interval = window.setInterval(() => {
      void refreshPlaybackState();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [authStatus.authenticated, selectedDeviceId]);

  useEffect(() => {
    if (!authStatus.authenticated) return;

    let cancelled = false;
    function initializePlayer() {
      if (cancelled) return;
      const Spotify = (window as any).Spotify;
      if (!Spotify) {
        setPlayerError("Spotify Web Playback SDK not available.");
        return;
      }
      const player = new Spotify.Player({
        name: "Spotify Details Web Player",
        getOAuthToken: async (cb: (token: string) => void) => {
          try {
            const res = await fetch(withBasePath("/api/spotify/player/token"), {
              method: "POST"
            });
            const data = await res.json();
            if (!res.ok) {
              throw new Error(data.error ?? "Failed to load token.");
            }
            cb(data.accessToken);
          } catch (error) {
            setPlayerError(formatPlayerError((error as Error).message));
          }
        },
        volume: playerVolume
      });
      player.addListener("ready", ({ device_id }: { device_id: string }) => {
        setSelectedDeviceId(device_id);
        setPlayerReady(true);
        void refreshDevices();
      });
      player.addListener("not_ready", () => {
        setPlayerReady(false);
      });
      player.addListener("initialization_error", ({ message }: { message: string }) => {
        setPlayerError(formatPlayerError(message));
      });
      player.addListener("authentication_error", ({ message }: { message: string }) => {
        setPlayerError(formatPlayerError(message));
      });
      player.addListener("account_error", ({ message }: { message: string }) => {
        setPlayerError(formatPlayerError(message));
      });
      player.connect();
      playerInstanceRef.current = player;
    }

    if ((window as any).Spotify) {
      initializePlayer();
      return () => {
        cancelled = true;
        playerInstanceRef.current?.disconnect();
      };
    }

    const script = document.createElement("script");
    script.src = "https://sdk.scdn.co/spotify-player.js";
    script.async = true;
    script.onload = () => initializePlayer();
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      playerInstanceRef.current?.disconnect();
      script.remove();
    };
  }, [authStatus.authenticated]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!deviceMenuOpen) return;
      const target = event.target as Node;
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(target)) {
        setDeviceMenuOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setDeviceMenuOpen(false);
        deviceButtonRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [deviceMenuOpen]);

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

  async function refreshDevices() {
    try {
      const res = await fetch(withBasePath("/api/spotify/player/devices"));
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load devices.");
      }
      setDevices(data.devices ?? []);
    } catch (error) {
      setPlayerError((error as Error).message);
    }
  }

  async function transferToDevice(deviceId: string) {
    if (!deviceId) return;
    try {
      const res = await fetch(withBasePath("/api/spotify/player/transfer"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to transfer playback.");
      }
      setSelectedDeviceId(deviceId);
      setPlayerError(null);
      await refreshDevices();
    } catch (error) {
      setPlayerError((error as Error).message);
    }
  }

  async function playOnDevice(track: TrackSummary) {
    const deviceId = selectedDeviceId;
    if (!deviceId) return;
    try {
      const res = await fetch(withBasePath("/api/spotify/player/play"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, uri: track.uri })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start playback.");
      }
      await refreshPlaybackState();
    } catch (error) {
      setPlayerError((error as Error).message);
    }
  }

  async function changePlayerVolume(delta: number) {
    if (!selectedDeviceId) return;
    const next = Math.min(1, Math.max(0, playerVolume + delta));
    setPlayerVolume(next);
    try {
      const res = await fetch(withBasePath("/api/spotify/player/volume"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: selectedDeviceId, volume: next })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to update volume.");
      }
    } catch {
      // ignore SDK errors; UI will still reflect current value
    }
  }

  async function refreshPlaybackState() {
    if (!authStatus.authenticated) return;
    try {
      if (seekValue != null) return;
      const res = await fetch(withBasePath("/api/spotify/player/state"));
      if (res.status === 204) {
        setPlaybackState(null);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to fetch playback state.");
      }
      setPlaybackState(data.state ?? null);
      if (data.state?.progressMs != null && data.state?.durationMs != null) {
        setSeekValue(null);
      }
    } catch (error) {
      setPlayerError((error as Error).message);
    }
  }

  async function togglePlayback() {
    if (!selectedDeviceId) return;
    const isPlaying = playbackState?.isPlaying ?? false;
    const endpoint = isPlaying ? "/api/spotify/player/pause" : "/api/spotify/player/play";
    if (!isPlaying && !selectedTrack?.uri && !playbackState?.track?.uri) {
      setPlayerError("Select a track first to start playback.");
      return;
    }
    try {
      const res = await fetch(withBasePath(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId: selectedDeviceId,
          uri: !isPlaying ? selectedTrack?.uri ?? playbackState?.track?.uri : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to toggle playback.");
      }
      await refreshPlaybackState();
    } catch (error) {
      setPlayerError((error as Error).message);
    }
  }

  async function skipPlayback(direction: "next" | "previous") {
    if (!selectedDeviceId) return;
    try {
      const res = await fetch(withBasePath(`/api/spotify/player/${direction}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: selectedDeviceId })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to skip track.");
      }
      await refreshPlaybackState();
    } catch (error) {
      setPlayerError((error as Error).message);
    }
  }

  async function seekTo(positionMs: number) {
    if (!selectedDeviceId) return;
    try {
      const res = await fetch(withBasePath("/api/spotify/player/seek"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: selectedDeviceId, positionMs })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to seek.");
      }
      await refreshPlaybackState();
    } catch (error) {
      setPlayerError((error as Error).message);
    }
  }

  function handleArtistSearch(value: string) {
    setArtistSearch(value);
    const query = value.trim().toLowerCase();
    if (!query) return;
    const match = artistOptions.find((artist) =>
      artist.name.toLowerCase().startsWith(query)
    );
    if (!match) return;
    const target = artistAnchorRef.current[match.id];
    if (target) {
      target.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

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
                  className="absolute z-10 mt-2 w-full rounded-2xl border border-white/10 bg-black/90 p-2 shadow-card"
                >
                  <div className="p-2">
                    <input
                      ref={artistSearchRef}
                      type="text"
                      value={artistSearch}
                      onChange={(event) => handleArtistSearch(event.target.value)}
                      placeholder="Type to jump to an artist..."
                      className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:border-tide focus:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    />
                  </div>
                  <div
                    ref={artistListRef}
                    className="max-h-72 overflow-auto px-2 pb-2"
                  >
                    {artistOptions.length === 0 && (
                      <div className="px-3 py-2 text-sm text-white/60">
                        No artists available.
                      </div>
                    )}
                    {artistOptions.map((artist) => {
                      const isSelected = artist.id === artistId;
                      const anchorMap = artistAnchorRef.current;
                      const setAnchor = (el: HTMLButtonElement | null) => {
                        if (el) {
                          anchorMap[artist.id] = el;
                        }
                      };
                      return (
                        <button
                          key={artist.id}
                          ref={setAnchor}
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

            <div
              ref={playerRef}
              className="rounded-2xl border border-white/10 bg-black/50 p-5 shadow-card"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                    Player
                  </p>
                  <p className="mt-2 text-sm text-white/70">
                    {playbackState?.track?.name
                      ? `Now playing: ${playbackState.track.name}`
                      : selectedTrack
                        ? `Ready to play: ${selectedTrack.name}`
                        : "Select a track to start playback."}
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-white/70">
                  <span
                    className={`inline-flex h-2.5 w-2.5 rounded-full ${
                      playerReady ? "bg-tide" : "bg-red-400"
                    }`}
                    aria-hidden="true"
                  />
                  <span>{playerReady ? "Web player ready" : "Web player offline"}</span>
                </div>
              </div>

              {playerError && (
                <p className="mt-3 text-sm text-red-200">{playerError}</p>
              )}

              <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-2xl border border-white/10 bg-black/80 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="h-24 w-24 overflow-hidden rounded-2xl border border-white/10 bg-black/60">
                      {playbackState?.track?.albumArt ? (
                        <img
                          src={playbackState.track.albumArt}
                          alt={playbackState.track.album}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs text-white/40">
                          No artwork
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {playbackState?.track?.name ?? selectedTrack?.name ?? "No track selected"}
                        </p>
                        <p className="text-xs text-white/60">
                          {playbackState?.track?.artists?.join(", ") ??
                            selectedTrack?.artists?.map((artist) => artist.name).join(", ") ??
                            "Choose a track to start playback."}
                        </p>
                        <p className="text-xs text-white/40">
                          {playbackState?.track?.album ?? selectedTrack?.album?.name ?? ""}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => skipPlayback("previous")}
                            className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-white/80 transition hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            onClick={togglePlayback}
                            className="rounded-full border border-white/15 bg-tide/80 px-4 py-1 text-xs font-semibold text-black transition hover:bg-tide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                          >
                            {playbackState?.isPlaying ? "Pause" : "Play"}
                          </button>
                          <button
                            type="button"
                            onClick={() => skipPlayback("next")}
                            className="rounded-full border border-white/10 bg-black/60 px-3 py-1 text-xs text-white/80 transition hover:border-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                          >
                            Next
                          </button>
                        </div>

                        <div className="flex items-center gap-3 text-[10px] text-white/50">
                          <span>
                            {formatDuration(
                              seekValue ??
                                playbackState?.progressMs ??
                                0
                            )}
                          </span>
                          <input
                            type="range"
                            min={0}
                            max={playbackState?.durationMs ?? selectedTrack?.durationMs ?? 0}
                            value={clamp(
                              seekValue ??
                                playbackState?.progressMs ??
                                0,
                              0,
                              playbackState?.durationMs ?? selectedTrack?.durationMs ?? 0
                            )}
                            onChange={(event) => {
                              setSeekValue(Number(event.target.value));
                            }}
                            onMouseUp={() => {
                              if (seekValue != null) {
                                void seekTo(seekValue);
                              }
                            }}
                            onTouchEnd={() => {
                              if (seekValue != null) {
                                void seekTo(seekValue);
                              }
                            }}
                            className="flex-1 accent-tide"
                          />
                          <span>
                            {formatDuration(
                              playbackState?.durationMs ??
                                selectedTrack?.durationMs ??
                                0
                            )}
                          </span>
                        </div>
                        {playbackState?.device?.name && (
                          <p className="text-[10px] text-white/40">
                            Active on {playbackState.device.name} ({playbackState.device.type})
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/70 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                      Spotify Connect
                    </p>
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/60 px-2 py-1 text-[10px] text-white/70">
                        <button
                          type="button"
                          onClick={() => changePlayerVolume(-0.1)}
                          aria-label="Decrease volume"
                          className="rounded-full px-1 text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                        >
                          -
                        </button>
                        <span>{Math.round(playerVolume * 100)}%</span>
                        <button
                          type="button"
                          onClick={() => changePlayerVolume(0.1)}
                          aria-label="Increase volume"
                          className="rounded-full px-1 text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={refreshDevices}
                        className="rounded-full border border-white/15 bg-black/60 px-3 py-1 text-[10px] font-semibold text-white/80 transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                  <div className="relative mt-3" ref={deviceMenuRef}>
                    <button
                      type="button"
                      ref={deviceButtonRef}
                      onClick={() => setDeviceMenuOpen((prev) => !prev)}
                      disabled={!devices.length}
                      aria-haspopup="listbox"
                      aria-expanded={deviceMenuOpen}
                      className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-black/80 px-4 py-2 text-left text-xs text-white shadow-card transition focus:border-tide focus:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="truncate">
                        {selectedDeviceId
                          ? devices.find((device) => device.id === selectedDeviceId)?.name ??
                            "Select device"
                          : devices.length
                            ? "Select device"
                            : "No devices"}
                      </span>
                      <span className="ml-3 text-white/60">
                        <svg
                          viewBox="0 0 24 24"
                          className={`h-4 w-4 transition ${deviceMenuOpen ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        >
                          <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
                        </svg>
                      </span>
                    </button>
                    {deviceMenuOpen && (
                      <div
                        role="listbox"
                        aria-label="Spotify devices"
                        className="absolute z-10 mt-2 max-h-60 w-full overflow-auto rounded-2xl border border-white/10 bg-black/90 p-2 shadow-card"
                      >
                        {devices.map((device) => (
                          <button
                            key={device.id}
                            type="button"
                            role="option"
                            aria-selected={device.id === selectedDeviceId}
                            onClick={() => {
                              setDeviceMenuOpen(false);
                              void transferToDevice(device.id);
                            }}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs transition ${
                              device.id === selectedDeviceId
                                ? "bg-tide/20 text-white"
                                : "text-white/80 hover:bg-white/5"
                            }`}
                          >
                            <span className="truncate">{device.name}</span>
                            <span className="text-[10px] text-white/50">
                              {device.type}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-white/50">
                    Playback goes to the selected Spotify Connect device.
                  </p>
                </div>
              </div>
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
                          onClick={() => {
                            setSelectedTrack(track);
                            setTimeout(() => {
                              playerRef.current?.scrollIntoView({
                                behavior: "smooth",
                                block: "center"
                              });
                            }, 50);
                            void playOnDevice(track);
                          }}
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
          </div>
        </section>
      </div>
    </main>
  );
}
