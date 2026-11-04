// client/tailwind.config.js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        jute: '#E8DFC8',
        leaf: { DEFAULT: '#2F5D3A', dark: '#244A2E' },
        turmeric: '#E0A42E',
        crate: '#1D6FA3',
        soil: '#3A2E23',
        chili: '#C0392B',
      },
      fontFamily: {
        display: ['"Tiro Bangla"', 'serif'],
        body: ['"Hind Siliguri"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
