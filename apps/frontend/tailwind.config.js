/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand navy scale sampled from the original Pioneer Class mockups
        // (admin sidebar, active nav state, "Privat" pill, mobile FAB).
        navy: {
          50: '#F4F7FB',
          100: '#DCE6F2',
          200: '#B7C9E0',
          300: '#8CA6C7',
          400: '#4E6D9C',
          500: '#28497A',
          600: '#123361',
          700: '#002953',
          800: '#002145',
          900: '#001936',
          950: '#00102A',
        },
      },
    },
  },
  plugins: [],
};
