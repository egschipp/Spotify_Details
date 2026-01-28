"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import BrandHeader from "@/app/ui/BrandHeader";
import { useParams } from "next/navigation";

type TrackDetail = {
  track: {
    id: string;
    name: string;
    uri: string;
    explicit: boolean;
    durationMs: number;
    popularity: number;
    previewUrl: string | null;
    isLocal: boolean;
    externalIds: Record<string, string>;
    genre: string;
    subgenre: string;
    confidence: number;
    genreSources: string[];
    genreExplanation: string[];
    spotifyUrl: string | null;
  };
  artists: {
    id: string;
    name: string;
    genres: string[];
    followers: { total: number };
    popularity: number;
  }[];
  album: {
    id: string;
    name: string;
    releaseDate: string;
    totalTracks: number;
    images: { url: string }[];
    label: string | null;
    markets: string[];
  };
  audioFeatures: Record<string, number | string | null> | null;
  audioAnalysis: { available: boolean; reason?: string };
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) =>
  basePath ? `${basePath}${path}` : path;

function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function TrackDetailPage() {
  const params = useParams<{ id: string }>();
  const trackId = params.id;
  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          withBasePath(`/api/spotify/track?trackId=${trackId}`)
        );
        const data = await res.json();
        if (!res.ok) {
          setErrorMessage(data.error ?? "Ophalen mislukt.");
          return;
        }
        setDetail(data);
      } catch (error) {
        setErrorMessage((error as Error).message);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [trackId]);

  return (
    <main className="min-h-screen px-4 py-8 md:px-10 md:py-12">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <BrandHeader
          title="Track details"
          subtitle="Uitgebreide track-, album- en genredata."
        />
        <Link href="/" className="text-sm font-medium text-tide">
          Terug naar playlist
        </Link>

        {loading && (
          <div className="rounded-3xl bg-mist/80 p-8 shadow-card">
            <p className="text-sm text-white/60">Track wordt geladen...</p>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        {detail && (
          <div className="grid gap-6">
            <section className="rounded-3xl bg-mist/80 p-6 shadow-card">
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <div className="h-28 w-28 overflow-hidden rounded-2xl bg-steel">
                  {detail.album.images?.[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={detail.album.images[0].url}
                      alt={detail.album.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <h1 className="font-display text-3xl font-semibold">
                    {detail.track.name}
                  </h1>
                  <p className="text-sm text-white/60">
                    {detail.artists.map((artist) => artist.name).join(", ")}
                  </p>
                  <div className="flex flex-wrap gap-3 text-xs text-white/50">
                    <span>ID: {detail.track.id}</span>
                    <span>URI: {detail.track.uri}</span>
                    <span>Duur: {formatDuration(detail.track.durationMs)}</span>
                    <span>Populariteit: {detail.track.popularity}</span>
                  </div>
                </div>
                {detail.track.spotifyUrl && (
                  <a
                    href={detail.track.spotifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-white transition hover:border-tide hover:text-tide"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.588 14.56a.75.75 0 0 1-1.032.248c-2.828-1.73-6.39-2.12-10.59-1.16a.75.75 0 1 1-.333-1.463c4.61-1.05 8.55-.607 11.72 1.33a.75.75 0 0 1 .235 1.045zm1.475-3.11a.9.9 0 0 1-1.238.297c-3.24-1.99-8.18-2.57-12.01-1.41a.9.9 0 1 1-.523-1.723c4.33-1.31 9.69-.66 13.33 1.56a.9.9 0 0 1 .44 1.276zm.126-3.23c-3.78-2.25-10.02-2.46-13.63-1.36a1.05 1.05 0 1 1-.612-2.01c4.16-1.26 11.07-1.01 15.43 1.56a1.05 1.05 0 0 1-1.188 1.81z"
                      />
                    </svg>
                    Open in Spotify
                  </a>
                )}
              </div>
            </section>

            <section className="grid gap-4 rounded-3xl bg-mist/80 p-6 shadow-card md:grid-cols-2">
              <div>
                <h2 className="font-display text-xl font-semibold">Basis</h2>
                <dl className="mt-3 space-y-2 text-sm text-white/70">
                  <div>Explicit: {detail.track.explicit ? "Ja" : "Nee"}</div>
                  <div>Is local: {detail.track.isLocal ? "Ja" : "Nee"}</div>
                  <div>
                    Preview URL: {detail.track.previewUrl ?? "Niet beschikbaar"}
                  </div>
                </dl>
              </div>
              <div>
                <h2 className="font-display text-xl font-semibold">External IDs</h2>
                <dl className="mt-3 space-y-2 text-sm text-white/70">
                  {Object.keys(detail.track.externalIds).length === 0 && (
                    <div>Geen external IDs</div>
                  )}
                  {Object.entries(detail.track.externalIds).map(([key, value]) => (
                    <div key={key}>
                      {key}: {value}
                    </div>
                  ))}
                </dl>
              </div>
            </section>

            <section className="rounded-3xl bg-mist/80 p-6 shadow-card">
              <h2 className="font-display text-xl font-semibold">Genre</h2>
              <div className="mt-3 grid gap-2 text-sm text-white/70 md:grid-cols-2">
                <div>Hoofdgenre: {detail.track.genre}</div>
                <div>Subgenre: {detail.track.subgenre}</div>
                <div>Confidence: {detail.track.confidence.toFixed(2)}</div>
                <div>
                  Bronnen:{" "}
                  {detail.track.genreSources.length
                    ? detail.track.genreSources.join(", ")
                    : "Geen"}
                </div>
              </div>
              <div className="mt-4 text-sm text-white/60">
                <p className="text-xs uppercase tracking-[0.2em] text-white/40">
                  Uitleg
                </p>
                <ul className="mt-2 space-y-1">
                  {detail.track.genreExplanation.length ? (
                    detail.track.genreExplanation.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))
                  ) : (
                    <li>Geen duidelijke signalen.</li>
                  )}
                </ul>
              </div>
            </section>

            <section className="rounded-3xl bg-mist/80 p-6 shadow-card">
              <h2 className="font-display text-xl font-semibold">Artists</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {detail.artists.map((artist) => (
                  <div key={artist.id} className="rounded-2xl border border-white/10 p-4">
                    <p className="font-medium">{artist.name}</p>
                    <p className="text-xs text-white/50">ID: {artist.id}</p>
                    <p className="text-xs text-white/50">
                      Populariteit: {artist.popularity}
                    </p>
                    <p className="text-xs text-white/50">
                      Followers: {artist.followers.total}
                    </p>
                    <p className="text-xs text-white/50">
                      Genres: {artist.genres.length ? artist.genres.join(", ") : "Unknown"}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl bg-mist/80 p-6 shadow-card">
              <h2 className="font-display text-xl font-semibold">Album</h2>
              <div className="mt-4 grid gap-4 text-sm text-white/70 md:grid-cols-2">
                <div>Naam: {detail.album.name}</div>
                <div>Release date: {detail.album.releaseDate}</div>
                <div>Total tracks: {detail.album.totalTracks}</div>
                <div>Label: {detail.album.label ?? "Onbekend"}</div>
                <div>Markten: {detail.album.markets.length}</div>
              </div>
            </section>

            <section className="rounded-3xl bg-mist/80 p-6 shadow-card">
              <h2 className="font-display text-xl font-semibold">Audio features</h2>
              <div className="mt-4 grid gap-2 text-sm text-white/70 md:grid-cols-3">
                {detail.audioFeatures ? (
                  Object.entries(detail.audioFeatures).map(([key, value]) => (
                    <div key={key}>
                      {key}: {value ?? "-"}
                    </div>
                  ))
                ) : (
                  <div>Audio features niet beschikbaar.</div>
                )}
              </div>
              <p className="mt-4 text-xs text-white/50">
                {detail.audioAnalysis.reason}
              </p>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
