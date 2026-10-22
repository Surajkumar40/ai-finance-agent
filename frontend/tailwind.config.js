/** @type {import('tailwindcss').Config} */

// Colours that change between light and dark are CSS variables (set in src/index.css), so one class such as
// text-slate-400 is readable in BOTH themes. "<alpha-value>" keeps opacity classes (bg-brand-500/10) working.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
const steps = (prefix, list) => Object.fromEntries(list.map((s) => [s, v(`${prefix}-${s}`)]));

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // The one accent: petrol blue. Used for primary actions, the active page and focus. Nothing else is tinted.
        brand: {
          50:  '#eef6f9',
          100: '#d8eaf0',
          200: '#b3d6e2',
          300: '#7fb9cf',
          400: '#5aa9c4',
          500: '#1f6f8b',
          600: '#185b73',
          700: '#134a5d',
          800: '#0f3b4a',
          900: '#0a2b36',
        },
        // Page, card, popover and border colours (different in light and dark).
        canvas: v('canvas'),
        surface: v('surface'),
        raised: v('raised'),
        line: v('line'),
        // Warm neutrals instead of cold blue-grey. 400 to 600 are the text greys and are tuned per theme for contrast.
        slate: steps('n', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        // Money colours: green = income, red = spending, amber = warning. Tuned per theme so amounts stay readable.
        emerald: steps('g', [400, 500, 600, 700]),
        red: steps('r', [400, 500, 600, 700]),
        amber: steps('a', [400, 500, 600, 700]),
      },
      borderRadius: {
        xl: '0.625rem',   // 10px  (was 12px)
        '2xl': '0.75rem', // 12px  (was 16px)
        '3xl': '1rem',    // 16px  (was 24px)
      },
      animation: {
        'fade-in': 'fadeIn 0.18s ease-out both',
        'slide-up': 'slideUp 0.22s ease-out both',
        'overlay-in': 'overlayIn 0.16s ease-out both',
        'modal-in': 'modalIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        overlayIn: {
          '0%': { opacity: 0 },
          '100%': { opacity: 1 },
        },
        modalIn: {
          '0%': { opacity: 0, transform: 'translateY(8px) scale(0.98)' },
          '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.6 },
        },
      },
    },
  },
  plugins: [],
}