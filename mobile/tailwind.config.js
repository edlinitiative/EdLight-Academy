/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#4A93DD',
          600: '#0857A6',
          700: '#0A66C2',
          900: '#1e3a5f',
        },
        chem: '#0A66C2',
        phys: '#0857A6',
        math: '#4A93DD',
        econ: '#5D5B54',
      },
    },
  },
  plugins: [],
};
