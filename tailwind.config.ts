import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080a0b",
        panel: "#111516",
        line: "#252b2d",
        cyan: "#79e7c5",
        violet: "#91a4ff",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["SFMono-Regular", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 18px 60px rgba(0,0,0,.28)",
      },
    },
  },
  plugins: [],
} satisfies Config;
