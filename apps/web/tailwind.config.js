/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          DEFAULT: '#4f46e5',
          accent: '#06b6d4',
        },
      },
      boxShadow: {
        '2xs': '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'xs': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)',
        'card': '0 4px 20px -2px rgb(0 0 0 / 0.05), 0 2px 6px -2px rgb(0 0 0 / 0.03)',
        'glow': '0 0 20px -5px rgb(99 102 241 / 0.35)',
      },
    },
  },
  plugins: [],
};
