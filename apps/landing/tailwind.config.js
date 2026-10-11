/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: { DEFAULT: '#0b1220', soft: '#131c30', line: '#243049' },
        paper: { DEFAULT: '#f6f7fa', deep: '#eceff5' },
        brand: { DEFAULT: '#4f46e5', dark: '#4338ca', light: '#e0e7ff' },
        mint: { DEFAULT: '#34d399', dark: '#059669' },
      },
      boxShadow: {
        receipt: '0 30px 60px -20px rgba(11,18,32,0.45), 0 12px 24px -12px rgba(11,18,32,0.3)',
        frame: '0 40px 80px -30px rgba(11,18,32,0.5), 0 0 0 1px rgba(11,18,32,0.08)',
      },
    },
  },
  plugins: [],
};
