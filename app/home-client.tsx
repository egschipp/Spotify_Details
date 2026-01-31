"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import BrandHeader from "@/app/ui/BrandHeader";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) =>
  basePath ? `${basePath}${path}` : path;

export default function HomePageClient() {
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
  const router = useRouter();
  const searchParams = useSearchParams();

  async function loadStatus() {
    setErrorMessage(null);
    const authRes = await fetch(withBasePath("/api/spotify/auth/status"));
    const authJson = await authRes.json();
    setAuthStatus(authJson);
    if (!authJson.authenticated) {
      router.replace("/credentials");
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  useEffect(() => {
    fetch(withBasePath("/api/session/refresh"), { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    const authError = searchParams.get("authError");
    if (authError) {
      setErrorMessage(decodeURIComponent(authError));
      router.replace("/");
    }
  }, [searchParams, router]);

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

  useEffect(() => {
    setStatusMessage(null);
  }, [authStatus.authenticated]);

  return (
    <main className="min-h-screen px-4 py-8 md:px-10 md:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <BrandHeader />
        <h1 className="sr-only">Home</h1>

        {!authStatus.authenticated && (
          <section className="rounded-3xl border border-white/10 bg-black/50 p-6 text-sm text-white/70">
            You are not logged in. Redirecting you to the credentials page...
          </section>
        )}

        <section className="grid gap-6 rounded-3xl bg-mist p-6 shadow-card md:grid-cols-2">
          <div
            className="space-y-4 rounded-2xl border border-white/10 bg-black/50 p-5"
            aria-busy={loadingNowPlaying}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-2xl font-semibold">Now Playing</h2>
              </div>
            </div>
            {!authStatus.authenticated && (
              <p className="text-sm text-white/60">
                Log in to see your current track.
              </p>
            )}
            {authStatus.authenticated && loadingNowPlaying && !nowPlaying && (
              <div className="space-y-3">
                <div className="h-5 w-40 animate-pulse rounded-full bg-white/10" />
                <div className="h-4 w-56 animate-pulse rounded-full bg-white/10" />
                <div className="h-4 w-32 animate-pulse rounded-full bg-white/10" />
              </div>
            )}
            {authStatus.authenticated && !nowPlaying?.track && (
              <p className="text-sm text-white/60">
                No track is currently playing.
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
                    className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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
                    About the artist
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-white">
                        {nowPlaying.artist.name}
                      </p>
                      <p className="text-xs text-white/50">
                        {nowPlaying.artist.followers.toLocaleString("en-US")} followers
                      </p>
                    </div>
                    {nowPlaying.artist.spotifyUrl && (
                      <a
                        href={nowPlaying.artist.spotifyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white transition hover:border-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
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

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-black/50 p-5">
              <h2 className="font-display text-2xl font-semibold">About this app</h2>
              <p className="mt-2 text-sm text-white/60">
                With this app you can view your Spotify data and realtime “Now Playing” in one place.
              </p>
              <p className="mt-3 text-sm text-white/60">
                This is my first project built with vibe coding in Visual Studio Code
                using Codex, complete with a fully working GitHub pipeline.
              </p>
              <p className="mt-3 text-sm text-white/60">
                This web app runs in a Docker container on a Raspberry Pi.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/50 p-5">
              <div className="text-xs uppercase tracking-[0.2em] text-white/40">
                Version
              </div>
              <p className="mt-2 text-sm text-white/70">
                {process.env.NEXT_PUBLIC_APP_VERSION}
              </p>
              <div className="mt-4 flex items-center gap-2 text-xs text-white/50">
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    authStatus.authenticated ? "bg-tide" : "bg-red-400"
                  }`}
                  aria-hidden="true"
                />
                <span>
                  {authStatus.authenticated ? "Auth ok" : "Auth required"}
                </span>
              </div>
              <div className="pt-3 text-right text-xs text-white/40">
                © Schippers-Online.nl
              </div>
            </div>
          </div>
        </section>

        {statusMessage && (
          <div
            className="rounded-2xl border border-tide/30 bg-tide/10 px-4 py-3 text-sm text-tide"
            role="status"
            aria-live="polite"
          >
            {statusMessage}
          </div>
        )}
        {errorMessage && (
          <div
            className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {errorMessage}
          </div>
        )}
      </div>
    </main>
  );
}
