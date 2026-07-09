import type { Config } from "tailwindcss";
import { designTokens } from "./src/lib/design-tokens";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        app: {
          bg: designTokens.color.background,
          surface: designTokens.color.surface,
          elevated: designTokens.color.surfaceElevated,
          border: designTokens.color.border,
          text: designTokens.color.text,
          muted: designTokens.color.textMuted,
        },
        accent: designTokens.color.accent,
        status: designTokens.color.status,
        shift: designTokens.color.shift,
      },
      borderRadius: designTokens.radius,
      boxShadow: designTokens.shadow,
    },
  },
  plugins: [],
};

export default config;
