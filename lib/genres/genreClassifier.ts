import { GENRE_KB, GenreKnowledgeBase } from "./knowledgeBase";

export type GenreInput = {
  track: {
    id: string;
    name: string;
    artists: string[];
    releaseYear?: number;
  };
  audioFeatures?: {
    tempo?: number;
    energy?: number;
    danceability?: number;
    acousticness?: number;
    speechiness?: number;
    valence?: number;
    loudness?: number;
  };
  spotifyArtistGenres: string[];
  webText: string;
};

export type GenreResult = {
  genre: string;
  subgenre: string;
  confidence: number;
  explanation: string[];
};

type ScoreDetail = {
  subgenre: string;
  score: number;
  maxScore: number;
  explanation: string[];
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "of",
  "to",
  "a",
  "in",
  "for",
  "with",
  "on",
  "by",
  "from",
  "at",
  "an",
  "is",
  "are",
  "was",
  "were"
]);

const KEYWORD_WEIGHT = 2;
const AUDIO_RULE_WEIGHT = 1;
const SPOTIFY_GENRE_WEIGHT = 1.5;
const NEGATIVE_WEIGHT = -2;

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return text
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token && !STOP_WORDS.has(token));
}

function normalizeSpotifyGenre(genre: string) {
  return normalizeText(genre);
}

function keywordInText(keyword: string, text: string) {
  const normalized = normalizeText(keyword);
  if (!normalized) {
    return false;
  }
  return text.includes(normalized);
}

function scoreAudioRule(
  rule: NonNullable<GenreKnowledgeBase[string]["audioRules"]>,
  audio: GenreInput["audioFeatures"],
  explanation: string[]
) {
  let score = 0;
  let maxScore = 0;

  if (rule.tempo && audio?.tempo !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.tempo >= rule.tempo[0] && audio.tempo <= rule.tempo[1]) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Tempo binnen profiel");
    }
  }
  if (rule.energyMin !== undefined && audio?.energy !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.energy >= rule.energyMin) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Energy match");
    }
  }
  if (rule.energyMax !== undefined && audio?.energy !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.energy <= rule.energyMax) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Energy laag genoeg");
    }
  }
  if (rule.danceabilityMin !== undefined && audio?.danceability !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.danceability >= rule.danceabilityMin) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Danceability match");
    }
  }
  if (rule.acousticnessMax !== undefined && audio?.acousticness !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.acousticness <= rule.acousticnessMax) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Lage acousticness");
    }
  }
  if (rule.speechinessMax !== undefined && audio?.speechiness !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.speechiness <= rule.speechinessMax) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Speechiness binnen profiel");
    }
  }
  if (rule.valenceMin !== undefined && audio?.valence !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.valence >= rule.valenceMin) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Valence match");
    }
  }
  if (rule.valenceMax !== undefined && audio?.valence !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.valence <= rule.valenceMax) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Valence laag genoeg");
    }
  }
  if (rule.loudnessMin !== undefined && audio?.loudness !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.loudness >= rule.loudnessMin) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Loudness match");
    }
  }
  if (rule.loudnessMax !== undefined && audio?.loudness !== undefined) {
    maxScore += AUDIO_RULE_WEIGHT;
    if (audio.loudness <= rule.loudnessMax) {
      score += AUDIO_RULE_WEIGHT;
      explanation.push("Loudness laag genoeg");
    }
  }

  return { score, maxScore };
}

function scoreSubgenre(
  subgenreKey: string,
  rule: GenreKnowledgeBase[string],
  input: GenreInput,
  normalizedWebText: string,
  spotifyGenres: string[]
): ScoreDetail {
  let score = 0;
  let maxScore = 0;
  const explanation: string[] = [];

  const keywords = rule.keywords.map(normalizeText);
  const uniqueKeywords = Array.from(new Set(keywords));
  const keywordMatches = uniqueKeywords.filter((keyword) =>
    keywordInText(keyword, normalizedWebText)
  );
  if (uniqueKeywords.length) {
    maxScore += Math.min(uniqueKeywords.length, 3) * KEYWORD_WEIGHT;
  }
  if (keywordMatches.length) {
    score += keywordMatches.length * KEYWORD_WEIGHT;
    keywordMatches.forEach((keyword) =>
      explanation.push(`Keyword '${keyword}' gevonden`)
    );
  }

  const spotifyHints = rule.spotifyHints?.map(normalizeText) ?? [];
  const spotifyMatches = spotifyHints.filter((hint) =>
    spotifyGenres.some((genre) => genre.includes(hint))
  );
  if (spotifyHints.length) {
    maxScore += Math.min(spotifyHints.length, 2) * SPOTIFY_GENRE_WEIGHT;
  }
  if (spotifyMatches.length) {
    score += spotifyMatches.length * SPOTIFY_GENRE_WEIGHT;
    spotifyMatches.forEach((hint) =>
      explanation.push(`Spotify genre match '${hint}'`)
    );
  }

  if (rule.audioRules) {
    const audioScore = scoreAudioRule(rule.audioRules, input.audioFeatures, explanation);
    score += audioScore.score;
    maxScore += audioScore.maxScore;
  }

  if (rule.negativeKeywords?.length) {
    maxScore += rule.negativeKeywords.length * Math.abs(NEGATIVE_WEIGHT);
    const negativeMatches = rule.negativeKeywords
      .map(normalizeText)
      .filter((keyword) => keywordInText(keyword, normalizedWebText));
    if (negativeMatches.length) {
      score += negativeMatches.length * NEGATIVE_WEIGHT;
      negativeMatches.forEach((keyword) =>
        explanation.push(`Conflicterend keyword '${keyword}'`)
      );
    }
  }

  return {
    subgenre: subgenreKey,
    score,
    maxScore: Math.max(maxScore, 1),
    explanation
  };
}

export function classifyTrack(
  input: GenreInput,
  knowledgeBase: GenreKnowledgeBase = GENRE_KB
): GenreResult {
  const normalizedWebText = normalizeText(input.webText || "");
  const spotifyGenres = Array.from(
    new Set(input.spotifyArtistGenres.map(normalizeSpotifyGenre))
  );

  if (!normalizedWebText && spotifyGenres.length === 0 && !input.audioFeatures) {
    return {
      genre: "Unknown",
      subgenre: "Unknown",
      confidence: 0,
      explanation: ["Geen tekst of Spotify genres beschikbaar"]
    };
  }

  const scores = Object.entries(knowledgeBase).map(([key, rule]) =>
    scoreSubgenre(key, rule, input, normalizedWebText, spotifyGenres)
  );

  scores.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.maxScore !== a.maxScore) {
      return b.maxScore - a.maxScore;
    }
    return a.subgenre.localeCompare(b.subgenre);
  });

  const best = scores[0];
  if (!best || best.score <= 0) {
    return {
      genre: "Unknown",
      subgenre: "Unknown",
      confidence: 0,
      explanation: ["Geen overtuigende signalen gevonden"]
    };
  }

  const rule = knowledgeBase[best.subgenre];
  const confidence = Math.min(best.score / best.maxScore, 1);
  return {
    genre: rule.parent,
    subgenre: best.subgenre.replace(/_/g, " "),
    confidence: Number(confidence.toFixed(2)),
    explanation: best.explanation
  };
}

export function buildWebText(input: GenreInput) {
  const tokens = [input.track.name, input.track.artists.join(" ")]
    .filter(Boolean)
    .join(" ");
  return normalizeText(tokens);
}

export function analyzeText(text: string) {
  const normalized = normalizeText(text);
  const tokens = tokenize(normalized);
  return { normalized, tokens };
}

export function analyzeAudioFeatures(features: GenreInput["audioFeatures"]) {
  return features ?? {};
}

export function loadGenreKnowledge() {
  return GENRE_KB;
}
