"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import BrandHeader from "@/app/ui/BrandHeader";
import Button from "@/app/ui/Button";

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
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(
    () => new Set()
  );
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const sortedPlaylists = useMemo(() => {
    return [...playlists].sort((a, b) =>
      a.name.localeCompare(b.name, "nl", { sensitivity: "base" })
    );
  }, [playlists]);
  const selectedCount = useMemo(
    () => selectedPlaylistIds.size,
    [selectedPlaylistIds]
  );
  const allSelected = useMemo(
    () =>
      sortedPlaylists.length > 0 &&
      selectedPlaylistIds.size === sortedPlaylists.length,
    [sortedPlaylists.length, selectedPlaylistIds]
  );
  const isIndeterminate = useMemo(
    () =>
      sortedPlaylists.length > 0 &&
      selectedPlaylistIds.size > 0 &&
      selectedPlaylistIds.size < sortedPlaylists.length,
    [sortedPlaylists.length, selectedPlaylistIds]
  );

  async function loadPlaylists() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(withBasePath("/api/spotify/playlists"));
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = withBasePath("/credentials");
          return;
        }
        setErrorMessage(data.error ?? "Failed to fetch playlists.");
        return;
      }
      setPlaylists(data.playlists ?? []);
      setSelectedPlaylistIds(new Set());
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function exportSelectedCsv() {
    const selected = sortedPlaylists.filter((playlist) =>
      selectedPlaylistIds.has(playlist.id)
    );
    const header = ["Folder", "Playlist", "Tracks", "Owner", "Cover Art", "External URL"];
    const rows = selected.map((playlist) => [
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

  useEffect(() => {
    fetch(withBasePath("/api/session/refresh"), { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  function togglePlaylistSelection(playlistId: string) {
    setSelectedPlaylistIds((prev) => {
      const next = new Set(prev);
      if (next.has(playlistId)) {
        next.delete(playlistId);
      } else {
        next.add(playlistId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedPlaylistIds((prev) => {
      if (sortedPlaylists.length === 0) {
        return prev;
      }
      if (prev.size === sortedPlaylists.length) {
        return new Set();
      }
      return new Set(sortedPlaylists.map((playlist) => playlist.id));
    });
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-10 md:py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <BrandHeader />
        <h1 className="font-display text-3xl font-semibold text-white md:text-4xl">
          Playlists
        </h1>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            onClick={exportSelectedCsv}
            disabled={!selectedCount}
          >
            Export selectie ({selectedCount})
          </Button>
          <Button
            variant="secondary"
            onClick={loadPlaylists}
            disabled={loading}
          >
            Refresh
          </Button>
        </div>

        {errorMessage && (
          <div
            className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {errorMessage}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-white/60">
            <span>
              {loading
                ? "Loading playlists..."
                : `${sortedPlaylists.length} playlists`}
            </span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/70">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Overview of your Spotify playlists.</caption>
              <thead className="bg-steel/80 text-xs uppercase tracking-[0.2em] text-white/50">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        ref={selectAllRef}
                        type="checkbox"
                        aria-label="Select all playlists"
                        checked={allSelected}
                        onChange={toggleSelectAll}
                        disabled={!sortedPlaylists.length}
                        className="h-4 w-4 rounded border-white/30 bg-transparent text-tide focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      />
                      <span>Selection</span>
                    </div>
                  </th>
                  <th scope="col" className="px-4 py-3">Folder</th>
                  <th scope="col" className="px-4 py-3">Cover</th>
                  <th scope="col" className="px-4 py-3">Playlist</th>
                  <th scope="col" className="px-4 py-3">Tracks</th>
                  <th scope="col" className="px-4 py-3">Owner</th>
                  <th scope="col" className="px-4 py-3">External URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sortedPlaylists.map((playlist) => (
                  <tr key={playlist.id} className="bg-black/30">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${playlist.name}`}
                        checked={selectedPlaylistIds.has(playlist.id)}
                        onChange={() => togglePlaylistSelection(playlist.id)}
                        className="h-4 w-4 rounded border-white/30 bg-transparent text-tide focus-visible:ring-2 focus-visible:ring-tide focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                      />
                    </td>
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
                    <td className="px-4 py-6 text-sm text-white/50" colSpan={7}>
                      No playlists found. Log in and try again.
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
