export type GenreRule = {
  parent: string;
  keywords: string[];
  spotifyHints?: string[];
  audioRules?: {
    tempo?: [number, number];
    energyMin?: number;
    energyMax?: number;
    danceabilityMin?: number;
    acousticnessMax?: number;
    speechinessMax?: number;
    valenceMin?: number;
    valenceMax?: number;
    loudnessMin?: number;
    loudnessMax?: number;
  };
  negativeKeywords?: string[];
};

export type GenreKnowledgeBase = Record<string, GenreRule>;

export const GENRE_KB: GenreKnowledgeBase = {
  synthwave: {
    parent: "Electronic",
    keywords: ["synthwave", "retro", "80s", "1980s", "analog synth"],
    spotifyHints: ["synthwave", "retrowave", "synth"],
    audioRules: {
      tempo: [90, 180],
      energyMin: 0.5,
      acousticnessMax: 0.3
    }
  },
  house: {
    parent: "Electronic",
    keywords: ["house", "deep house", "club", "dance"],
    spotifyHints: ["house", "deep house"],
    audioRules: {
      tempo: [110, 130],
      energyMin: 0.5,
      danceabilityMin: 0.6
    }
  },
  techno: {
    parent: "Electronic",
    keywords: ["techno", "warehouse", "rave"],
    spotifyHints: ["techno"],
    audioRules: {
      tempo: [120, 150],
      energyMin: 0.6,
      acousticnessMax: 0.2
    }
  },
  indie_rock: {
    parent: "Rock",
    keywords: ["indie rock", "indie", "alternative"],
    spotifyHints: ["indie rock", "alternative"],
    audioRules: {
      energyMin: 0.45,
      acousticnessMax: 0.6
    }
  },
  pop: {
    parent: "Pop",
    keywords: ["pop", "chart", "mainstream"],
    spotifyHints: ["pop"],
    audioRules: {
      energyMin: 0.4,
      danceabilityMin: 0.5
    }
  },
  hip_hop: {
    parent: "Hip-Hop",
    keywords: ["hip hop", "rap", "trap"],
    spotifyHints: ["hip hop", "rap", "trap"],
    audioRules: {
      speechinessMax: 0.45,
      energyMin: 0.4
    }
  },
  rnb: {
    parent: "R&B",
    keywords: ["r&b", "soul", "neo soul"],
    spotifyHints: ["r&b", "soul"],
    audioRules: {
      valenceMin: 0.3,
      energyMin: 0.35
    }
  },
  folk: {
    parent: "Folk",
    keywords: ["folk", "acoustic", "singer-songwriter"],
    spotifyHints: ["folk"],
    audioRules: {
      acousticnessMax: 0.8,
      energyMax: 0.6
    }
  },
  metal: {
    parent: "Metal",
    keywords: ["metal", "heavy metal", "metalcore"],
    spotifyHints: ["metal"],
    audioRules: {
      energyMin: 0.65,
      loudnessMin: -8
    }
  }
};
