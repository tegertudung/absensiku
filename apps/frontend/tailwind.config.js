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
        // #001936 (navy-900) matches the "primary" token in the teammate's
        // Stitch design system (pioneer_class_mobile/DESIGN.md) exactly.
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
        // Warm-neutral page background from the mobile design system —
        // deliberately not a plain gray, reduces eye strain vs pure white.
        canvas: '#F9FAF8',
        // "Soft" status tokens, straight from DESIGN.md's Schedule Statuses
        // spec — used for schedule/session status pills and cards so Tentor
        // and (later) Orang Tua share one status vocabulary.
        status: {
          scheduledBg: '#E8EDF4',
          scheduledText: '#142E4F',
          doneBg: '#E9F5EF',
          doneText: '#005235',
          pendingBg: '#FFF9E6',
          pendingText: '#856404',
          conflictBg: '#FFF3CD',
          conflictText: '#664D03',
          errorBg: '#FDEAEA',
          errorText: '#BA1A1A',
        },
      },
      fontFamily: {
        // Plus Jakarta Sans everywhere per the mobile design system; falls
        // back to the platform's normal sans stack if the Google Font hasn't
        // loaded yet.
        sans: [
          'var(--font-plus-jakarta-sans)',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
