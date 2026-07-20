/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#4A93DD',
          600: '#1B6FE0', // brand azure (Limyè)
          700: '#0857A6', // deep azure — pressed / high-contrast text
          900: '#1e3a5f',
        },
        chem: '#0A66C2',
        phys: '#1B6FE0',
        math: '#4A93DD',
        econ: '#5D5B54',
      },
    },
  },
  plugins: [],
};
