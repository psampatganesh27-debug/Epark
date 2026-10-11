/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'selector', // In Tailwind v3.4.19, 'selector' strictly looks for the .dark class on html/body
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          DEFAULT: '#4f46e5',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'glow-sm': '0 0 10px -2px rgba(99, 102, 241, 0.4)',
      }
    },
  },
  plugins: [],
}
