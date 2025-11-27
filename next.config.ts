import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Autoura Brand Colors
        primary: {
          DEFAULT: '#647C47',
          50: '#F5F7F2',
          100: '#E8EDE0',
          // ... rest of colors
        }
      }
    }
  }
}