"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type PlaylistRow = {
  id: string;
  name: string;
  images: { url: string; width: number; height: number }[];
  trackCount: number;
  owner: string;
  spotifyUrl?: string | null;
};

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBasePath = (path: string) => (basePath ? `${basePath}${path}` : path);

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortedPlaylists = useMemo(() => {
    return [...playlists].sort((a, b) =>
      a.name.localeCompare(b.name, "nl", { sensitivity: "base" })
    );
  }, [playlists]);

  async function loadPlaylists() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(withBasePath("/api/spotify/playlists"));
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error ?? "Playlists ophalen mislukt.");
        return;
      }
      setPlaylists(data.playlists ?? []);
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const header = ["Folder", "Playlist", "Tracks", "Owner", "Cover Art", "External URL"];
    const rows = sortedPlaylists.map((playlist) => [
      "",
      playlist.name,
      String(playlist.trackCount),
      playlist.owner,
      playlist.images?.[0]?.url ?? "",
      playlist.spotifyUrl ?? ""
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `spotify-playlists-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    void loadPlaylists();
  }, []);

  return (
    <main className="min-h-screen px-4 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <Link
              href="/"
              className="text-sm font-medium text-tide transition hover:text-pulse"
            >
              Terug naar home
            </Link>
            <h1 className="font-display text-3xl font-semibold">
              Alle playlists
            </h1>
            <p className="text-sm text-white/60">
              Folders worden niet geleverd door de Spotify API, daarom is de
              folder-kolom leeg.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={exportCsv}
              disabled={!sortedPlaylists.length}
              className="rounded-full bg-tide px-6 py-3 text-sm font-semibold text-black shadow-glow transition hover:bg-pulse disabled:cursor-not-allowed disabled:opacity-50"
            >
              Export to CSV
            </button>
            <button
              onClick={loadPlaylists}
              disabled={loading}
              className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Vernieuwen
            </button>
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-white/60">
            <span>
              {loading
                ? "Playlists laden..."
                : `${sortedPlaylists.length} playlists`}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/40">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-steel/80 text-xs uppercase tracking-[0.2em] text-white/50">
                <tr>
                  <th className="px-4 py-3">Folder</th>
                  <th className="px-4 py-3">Cover</th>
                  <th className="px-4 py-3">Playlist</th>
                  <th className="px-4 py-3">Tracks</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">External URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sortedPlaylists.map((playlist) => (
                  <tr key={playlist.id} className="bg-black/30">
                    <td className="px-4 py-3 text-white/40">—</td>
                    <td className="px-4 py-3">
                      {playlist.images?.[0]?.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={playlist.images[0].url}
                          alt={playlist.name}
                          className="h-10 w-10 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-steel/60" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-white">{playlist.name}</td>
                    <td className="px-4 py-3 text-white/70">
                      {playlist.trackCount}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {playlist.owner}
                    </td>
                    <td className="px-4 py-3 text-white/70">
                      {playlist.spotifyUrl ? (
                        <a
                          href={playlist.spotifyUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-tide hover:text-pulse"
                        >
                          Open
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
                {!loading && !sortedPlaylists.length && (
                  <tr>
                    <td className="px-4 py-6 text-sm text-white/50" colSpan={6}>
                      Geen playlists gevonden. Log in en probeer opnieuw.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
