// client/tailwind.config.js
// Every colour is a CSS variable, so the whole site re-themes by swapping variables in index.css.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        jute: { DEFAULT: v('--c-jute'), deep: v('--c-jute-deep'), light: v('--c-jute-light') },
        leaf: { DEFAULT: v('--c-leaf'), dark: v('--c-leaf-dark'), light: v('--c-leaf-light') },
        turmeric: { DEFAULT: v('--c-turmeric'), deep: v('--c-turmeric-deep') },
        crate: { DEFAULT: v('--c-crate'), light: v('--c-crate-light') },
        soil: { DEFAULT: v('--c-soil'), muted: v('--c-soil-muted') },
        chili: v('--c-chili'),
        surface: v('--c-surface'),
        sunken: v('--c-sunken'),
      },
      fontFamily: {
        display: ['"Tiro Bangla"', 'Georgia', 'serif'],
        sans: ['"Hind Siliguri"', 'system-ui', 'sans-serif'],
      },
      boxShadow: { crate: 'var(--shadow-crate)', lift: 'var(--shadow-lift)' },
      borderRadius: { crate: '14px' },
    },
  },
  plugins: [],
};
