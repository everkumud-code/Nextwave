import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F1B2A",
        forest: "#0B2E52",
        mint: "#D6EAFB",
        canvas: "#F2F7FC",
        // the accent of the app follows the logo: every emerald-* class is the NextWave blue
        emerald: {
          50: "#EFF7FE", 100: "#DCEEFC", 200: "#B9DDF9", 300: "#86C4F4", 400: "#4AA6EC",
          500: "#1C8CE0", 600: "#0A78CC", 700: "#0A5FA3", 800: "#0B4C82", 900: "#0B3A64", 950: "#082848",
        },
      },
      boxShadow: {
        soft: "0 8px 30px rgba(11, 46, 82, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
