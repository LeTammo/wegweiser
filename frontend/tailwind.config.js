/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        train: {
          ice: '#1e1e24',     // ICE = black/very dark gray
          ic: '#4b5563',      // IC = dark gray
          re: '#78716c',      // RE = gray (stone-500)
          rb: '#a8a29e',      // RB = light gray (stone-400)
          s: '#10b981',       // S-Bahn = green
          bus: '#8b5cf6',     // Bus = purple
          tram: '#ef4444',    // Tram = red
        }
      }
    },
  },
  plugins: [],
}
