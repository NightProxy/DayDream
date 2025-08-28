/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./internal/**/*.{html,js,ts,jsx,tsx}",
    "./ddxui/**/*.{html,js,ts,jsx,tsx}",
    "./node_modules/basecoat-css/**/*.css", // <-- add this
  ],
  theme: {
    extend: {
      colors: {
        sidebar: "var(--sidebar-bg)",
        "sidebar-foreground": "var(--sidebar-text)",
      },
      width: {
        "sidebar-width": "var(--sidebar-width)",
        "sidebar-mobile-width": "var(--sidebar-mobile-width)",
      },
    },
  },
  plugins: [],
};
