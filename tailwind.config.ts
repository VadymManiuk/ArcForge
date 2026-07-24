import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070a11",
        panel: "#0e1520",
        line: "#243044",
        cyan: "#73d9ff",
        violet: "#8299ff",
      },
      fontFamily: {
        sans: ["Manrope Variable", "Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono Variable", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 24px 70px rgba(0,0,0,.32)",
      },
    },
  },
  plugins: [],
} satisfies Config;
