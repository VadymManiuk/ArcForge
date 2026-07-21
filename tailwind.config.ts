import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#05070b",
        panel: "#0b1019",
        line: "#1b2534",
        cyan: "#41d9ff",
        violet: "#8a7dff",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["SFMono-Regular", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 50px rgba(65,217,255,.10)",
      },
    },
  },
  plugins: [],
} satisfies Config;
