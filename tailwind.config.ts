import type { Config } from "tailwindcss";

const config: Config = {
  // Scan these paths for class usage to generate only needed styles.
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      // Brand palette inspired by Spotify dark UI.
      colors: {
        ink: "#0b0b0b",
        mist: "#1c1c1c",
        tide: "#1db954",
        pulse: "#1ed760",
        clay: "#121212",
        steel: "#2a2a2a"
      },
      // CSS variable hooks for Next font loading.
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"]
      },
      // App-specific shadow presets for cards and CTAs.
      boxShadow: {
        glow: "0 12px 40px rgba(18, 58, 65, 0.18)",
        card: "0 10px 30px rgba(15, 26, 31, 0.12)"
      }
    }
  },
  // No Tailwind plugins used yet.
  plugins: []
};

export default config;
