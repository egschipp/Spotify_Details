import { describe, expect, it } from "vitest";
import { classifyTrack } from "@/lib/genres/genreClassifier";

const baseInput = {
  track: {
    id: "t1",
    name: "Neon Runner",
    artists: ["Nova Night"],
    releaseYear: 2020
  },
  audioFeatures: {
    tempo: 120,
    energy: 0.8,
    danceability: 0.6,
    acousticness: 0.1,
    speechiness: 0.04,
    valence: 0.5,
    loudness: -6
  },
  spotifyArtistGenres: ["synthwave", "electronic"],
  webText: "Nova Night is a synthwave artist known for retro 1980s vibes."
};

describe("classifyTrack", () => {
  it("returns synthwave with explanation and confidence", () => {
    const result = classifyTrack(baseInput);
    expect(result.genre).toBe("Electronic");
    expect(result.subgenre).toBe("synthwave");
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.explanation.length).toBeGreaterThan(0);
  });

  it("returns Unknown when no signals", () => {
    const result = classifyTrack({
      ...baseInput,
      spotifyArtistGenres: [],
      webText: "",
      audioFeatures: undefined
    });
    expect(result.genre).toBe("Unknown");
    expect(result.subgenre).toBe("Unknown");
  });
});
