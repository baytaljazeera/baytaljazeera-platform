/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        royalblue: "#003366",
        navy: "#001A33",
        gold: "#D4AF37",
        lightgold: "#E8C882",
        beige: "#F7F1E5",
        cream: "#FBF7F0",
      },
      fontFamily: {
        tajawal: ["var(--font-tajawal)", "Tajawal", "sans-serif"],
        cairo: ["var(--font-cairo)", "Cairo", "sans-serif"],
      },
      backgroundImage: {
        "gold-blue-gradient": "linear-gradient(to bottom, #D4AF37, #003366)",
      },
      boxShadow: {
        gold: "0 0 10px rgba(212, 175, 55, 0.4)",
      },
    },
  },
  plugins: [],
};
