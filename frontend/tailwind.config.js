/** Tokens: see ARCHITECTURE.md > Design language. Colours are referenced by role, never by hue. */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ground: "#121417",   // page
        panel: "#1A1D21",    // raised surfaces
        rule: "#2B3036",     // borders, tracks
        ink: "#E6E8EB",      // primary text
        dim: "#8E959E",      // secondary text
        ridge: "#8DB1CF",    // the one accent: plan, focus, high priority
        rise: "#86B79C",     // improving
        fall: "#CC7A72",     // declining, skipped
        caution: "#C9A66B",  // partial, attention
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        display: ['"IBM Plex Sans Condensed"', '"IBM Plex Sans"', "system-ui", "sans-serif"],
      },
      borderRadius: { panel: "10px" },
    },
  },
  plugins: [],
};
