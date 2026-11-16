import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111916",
        forest: "#153D2B",
        mint: "#DDF4E6",
        canvas: "#F6F8F6",
      },
      boxShadow: {
        soft: "0 8px 30px rgba(19, 45, 31, 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
