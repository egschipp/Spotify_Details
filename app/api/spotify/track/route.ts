import { NextRequest, NextResponse } from "next/server";
import { attachSessionCookie, getSessionId } from "@/lib/storage/sessionCookie";
import { getValidAccessToken, spotifyFetch } from "@/lib/spotify/spotifyClient";
import { fetchWebText } from "@/lib/genres/webSources";
import { classifyTrack } from "@/lib/genres/genreClassifier";

export async function GET(req: NextRequest) {
  const { sessionId, isNew } = getSessionId(req);
  const trackId = new URL(req.url).searchParams.get("trackId");
  if (!trackId) {
    return NextResponse.json(
      { error: "trackId is required." },
      { status: 400 }
    );
  }
  // Validate trackId to prevent path and query manipulation.
  // Spotify IDs are base62 (letters, digits) and typically up to 22 characters.
  if (!/^[A-Za-z0-9]{1,64}$/.test(trackId)) {
    return NextResponse.json(
      { error: "Invalid trackId format." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await getValidAccessToken(sessionId);

    const trackRes = await spotifyFetch(`/tracks/${trackId}`, accessToken);
    if (!trackRes.ok) {
      throw new Error(`Spotify track fetch failed (${trackRes.status}).`);
    }
    const track = (await trackRes.json()) as {
      id: string;
      name: string;
      uri: string;
      explicit: boolean;
      duration_ms: number;
      popularity: number;
      preview_url: string | null;
      is_local: boolean;
      artists: { id: string; name: string }[];
      album: { id: string; name: string };
      external_ids?: Record<string, string>;
      external_urls?: { spotify?: string };
    };

    const artistIds = track.artists.map((artist) => artist.id).join(",");
    const [artistsRes, albumRes, featuresRes] = await Promise.all([
      spotifyFetch(`/artists?ids=${artistIds}`, accessToken),
      spotifyFetch(`/albums/${track.album.id}`, accessToken),
      spotifyFetch(`/audio-features/${trackId}`, accessToken)
    ]);

    if (!artistsRes.ok) {
      throw new Error(`Spotify artist fetch failed (${artistsRes.status}).`);
    }
    if (!albumRes.ok) {
      throw new Error(`Spotify album fetch failed (${albumRes.status}).`);
    }

    const artists = (await artistsRes.json()) as {
      artists: {
        id: string;
        name: string;
        genres: string[];
        followers: { total: number };
        popularity: number;
      }[];
    };
    const album = (await albumRes.json()) as {
      id: string;
      name: string;
      release_date: string;
      total_tracks: number;
      images: { url: string; width: number; height: number }[];
      label?: string;
      available_markets?: string[];
    };

    const audioFeatures = featuresRes.ok ? await featuresRes.json() : null;
    const primaryArtistName = track.artists[0]?.name ?? "";
    const web = await fetchWebText(track.name, primaryArtistName);
    const spotifyGenres = artists.artists.flatMap((artist) => artist.genres ?? []);
    const genreResult = classifyTrack({
      track: {
        id: track.id,
        name: track.name,
        artists: track.artists.map((artist) => artist.name)
      },
      audioFeatures: audioFeatures ?? undefined,
      spotifyArtistGenres: spotifyGenres,
      webText: web.text
    });

    const res = NextResponse.json({
      track: {
        id: track.id,
        name: track.name,
        uri: track.uri,
        explicit: track.explicit,
        durationMs: track.duration_ms,
        popularity: track.popularity,
        previewUrl: track.preview_url,
        isLocal: track.is_local,
        externalIds: track.external_ids ?? {},
        spotifyUrl: track.external_urls?.spotify ?? null,
        genre: genreResult.genre,
        subgenre: genreResult.subgenre,
        confidence: genreResult.confidence,
        genreSources: web.sources,
        genreExplanation: genreResult.explanation
      },
      artists: artists.artists,
      album: {
        id: album.id,
        name: album.name,
        releaseDate: album.release_date,
        totalTracks: album.total_tracks,
        images: album.images,
        label: album.label ?? null,
        markets: album.available_markets ?? []
      },
      audioFeatures,
      audioAnalysis: {
        available: false,
        reason: "Audio analysis not fetched to avoid latency."
      }
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
