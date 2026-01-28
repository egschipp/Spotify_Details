export function parsePlaylistId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (uriMatch) {
    return uriMatch[1];
  }
  try {
    const url = new URL(trimmed);
    if (url.hostname !== "open.spotify.com") {
      return null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "playlist" || !parts[1]) {
      return null;
    }
    return parts[1];
  } catch {
    return null;
  }
}
