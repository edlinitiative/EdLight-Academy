/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        ed: {
          blue: "#0A66C2",      // EdLight primary (blue)
          blueDark: "#084B8A",
          blueLight: "#E6F1FB",
          white: "#FFFFFF",
          gray50: "#F9FAFB",
          gray100: "#F3F4F6",
          gray200: "#E5E7EB",
          gray300: "#D1D5DB",
          gray500: "#6B7280",
          gray700: "#374151",
          gray900: "#111827",
          green: "#10B981"      // Accent similar to Khan Academy vibe
        }
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Apple Color Emoji", "Segoe UI Emoji"]
      },
      boxShadow: {
        soft: "0 10px 25px rgba(0,0,0,0.06)",
        ring: "0 0 0 6px rgba(10, 102, 194, 0.15)"
      },
      borderRadius: {
        "2xl": "1.25rem"
      }
    },
  },
  plugins: [],
};
