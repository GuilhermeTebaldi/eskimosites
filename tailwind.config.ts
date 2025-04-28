import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      animation: {
        "energy-animate": "pulse 1s infinite ease-in-out",
      },
    },
  },
  plugins: [],
};

export default config;
