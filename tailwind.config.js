/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Example: Custom colors for barangay theme
      colors: {
        'ph-blue': '#0038A8',
        'ph-red': '#CE1126',
        'ph-yellow': '#FCD116',
      },
      },
        fontFamily: {
          sans: ['Roboto', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        },
  },
  plugins: [],
};