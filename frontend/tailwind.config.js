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
      fontSize: {
        // Mobile-optimized font sizes (minimum 14px)
        'mobile-xs': ['12px', { lineHeight: '1.5' }],
        'mobile-sm': ['14px', { lineHeight: '1.5' }],
        'mobile-base': ['16px', { lineHeight: '1.6' }],
        'mobile-lg': ['18px', { lineHeight: '1.6' }],
        'mobile-xl': ['20px', { lineHeight: '1.5' }],
        'mobile-2xl': ['24px', { lineHeight: '1.4' }],
        'mobile-3xl': ['28px', { lineHeight: '1.3' }],
        'mobile-4xl': ['32px', { lineHeight: '1.2' }],
      },
      spacing: {
        // Mobile-optimized spacing
        'touch-min': '44px',      // Minimum touch target
        'touch-comfort': '48px',  // Comfortable touch target
        'touch-large': '56px',    // Large touch target
      },
      minHeight: {
        'touch-min': '44px',
        'touch-comfort': '48px',
        'touch-large': '56px',
      },
      minWidth: {
        'touch-min': '44px',
        'touch-comfort': '48px',
        'touch-large': '56px',
      },
      backgroundImage: {
        "gold-blue-gradient": "linear-gradient(to bottom, #D4AF37, #003366)",
      },
      boxShadow: {
        gold: "0 0 10px rgba(212, 175, 55, 0.4)",
      },
      screens: {
        'mobile': '375px',
        'mobile-lg': '428px',
        'tablet': '768px',
        'desktop': '1024px',
      },
    },
  },
  plugins: [],
};
