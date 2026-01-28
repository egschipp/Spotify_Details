import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getValidAccessToken, spotifyFetch } from "@/lib/spotify/spotifyClient";
import { parsePlaylistId } from "@/lib/spotify/parsePlaylistId";
import { fetchWebText } from "@/lib/genres/webSources";
import { classifyTrack } from "@/lib/genres/genreClassifier";
import { mapWithConcurrency } from "@/lib/genres/concurrency";

type SpotifyPlaylistTrack = {
  track: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    album: {
      id: string;
      name: string;
      images: { url: string; width: number; height: number }[];
    };
    duration_ms: number;
    explicit: boolean;
    popularity: number;
    preview_url: string | null;
    uri: string;
    is_local: boolean;
    external_urls?: { spotify?: string };
  } | null;
};

type SpotifyTracksResponse = {
  items: SpotifyPlaylistTrack[];
  next: string | null;
  total: number;
};

type SpotifyAudioFeaturesResponse = {
  audio_features: ({
    id: string;
    tempo: number;
    energy: number;
    danceability: number;
    acousticness: number;
    speechiness: number;
    valence: number;
    loudness: number;
  } | null)[];
};

async function fetchAllPlaylistTracks(
  playlistId: string,
  accessToken: string
): Promise<SpotifyPlaylistTrack[]> {
  const items: SpotifyPlaylistTrack[] = [];
  let offset = 0;
  const limit = 100;
  let next: string | null = null;

  do {
    const response = await spotifyFetch(
      `/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`,
      accessToken
    );
    if (!response.ok) {
      throw new Error(`Spotify playlist fetch failed (${response.status}).`);
    }
    const data = (await response.json()) as SpotifyTracksResponse;
    items.push(...data.items);
    next = data.next;
    offset += limit;
  } while (next);

  return items;
}

async function fetchArtists(
  artistIds: string[],
  accessToken: string
): Promise<Record<string, { genres: string[] }>> {
  const map: Record<string, { genres: string[] }> = {};
  const batchSize = 50;
  for (let i = 0; i < artistIds.length; i += batchSize) {
    const batch = artistIds.slice(i, i + batchSize);
    const response = await spotifyFetch(
      `/artists?ids=${batch.join(",")}`,
      accessToken
    );
    if (!response.ok) {
      throw new Error(`Spotify artist fetch failed (${response.status}).`);
    }
    const data = (await response.json()) as {
      artists: { id: string; genres: string[] }[];
    };
    for (const artist of data.artists) {
      map[artist.id] = { genres: artist.genres ?? [] };
    }
  }
  return map;
}

async function fetchAudioFeatures(
  trackIds: string[],
  accessToken: string
): Promise<Record<string, SpotifyAudioFeaturesResponse["audio_features"][0]>> {
  const map: Record<string, SpotifyAudioFeaturesResponse["audio_features"][0]> =
    {};
  const batchSize = 100;
  for (let i = 0; i < trackIds.length; i += batchSize) {
    const batch = trackIds.slice(i, i + batchSize);
    const response = await spotifyFetch(
      `/audio-features?ids=${batch.join(",")}`,
      accessToken
    );
    if (!response.ok) {
      throw new Error(`Spotify audio features fetch failed (${response.status}).`);
    }
    const data = (await response.json()) as SpotifyAudioFeaturesResponse;
    for (const feature of data.audio_features ?? []) {
      if (feature?.id) {
        map[feature.id] = feature;
      }
    }
  }
  return map;
}

export async function POST(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  try {
    const body = (await req.json()) as {
      playlistUrl?: string;
      playlistId?: string;
    };
    const playlistId = body.playlistId
      ? body.playlistId
      : body.playlistUrl
        ? parsePlaylistId(body.playlistUrl)
        : null;
    if (!playlistId) {
      return NextResponse.json(
        { error: "Invalid playlist URL or URI." },
        { status: 400 }
      );
    }
    const accessToken = await getValidAccessToken(sessionId);

    const playlistTracks = await fetchAllPlaylistTracks(
      playlistId,
      accessToken
    );
    const tracks = playlistTracks
      .map((item) => item.track)
      .filter((track): track is NonNullable<typeof track> => Boolean(track));

    const artistIds = Array.from(
      new Set(tracks.flatMap((track) => track.artists.map((a) => a.id)))
    );
    const artistMap = await fetchArtists(artistIds, accessToken);
    let audioFeaturesMap: Record<
      string,
      SpotifyAudioFeaturesResponse["audio_features"][0]
    > = {};
    try {
      audioFeaturesMap = await fetchAudioFeatures(
        tracks.map((track) => track.id),
        accessToken
      );
    } catch {
      audioFeaturesMap = {};
    }

    const genreResults = await mapWithConcurrency(
      tracks,
      3,
      async (track) => {
        const primaryArtistName = track.artists[0]?.name ?? "";
        const web = await fetchWebText(track.name, primaryArtistName);
        const spotifyGenres = track.artists.flatMap(
          (artist) => artistMap[artist.id]?.genres ?? []
        );
        const result = classifyTrack({
          track: {
            id: track.id,
            name: track.name,
            artists: track.artists.map((artist) => artist.name)
          },
          audioFeatures: audioFeaturesMap[track.id] ?? undefined,
          spotifyArtistGenres: spotifyGenres,
          webText: web.text
        });
        return { id: track.id, result, sources: web.sources };
      }
    );
    const genreMap = Object.fromEntries(
      genreResults.map((entry) => [
        entry.id,
        { ...entry.result, sources: entry.sources }
      ])
    );

    const enrichedTracks = tracks.map((track) => {
      const genre = genreMap[track.id];
      return {
        id: track.id,
        name: track.name,
        artists: track.artists,
        album: track.album,
        genre: genre?.genre ?? "Unknown",
        subgenre: genre?.subgenre ?? "Unknown",
        confidence: genre?.confidence ?? 0,
        genreSources: genre?.sources ?? [],
        genreExplanation: genre?.explanation ?? [],
        spotifyUrl: track.external_urls?.spotify ?? null,
        durationMs: track.duration_ms,
        explicit: track.explicit,
        popularity: track.popularity,
        previewUrl: track.preview_url,
        uri: track.uri,
        isLocal: track.is_local
      };
    });

    const res = NextResponse.json({
      playlistId,
      total: enrichedTracks.length,
      tracks: enrichedTracks
    });
    attachSessionCookie(res, sessionId, isNew);
    return res;
  } catch (error) {
    const message = (error as Error).message;
    const status = message.includes("auth")
      ? 401
      : message.includes("credentials")
        ? 400
        : 500;
    const res = NextResponse.json({ error: message }, { status });
    attachSessionCookie(res, sessionId, isNew);
    return res;
  }
}
