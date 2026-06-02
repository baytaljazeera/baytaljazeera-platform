/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Legacy aliases — kept so older non-admin pages keep working.
        royalblue: "#003366",
        navy: "#001A33",
        gold: "#D4AF37",
        lightgold: "#E8C882",
        beige: "#F7F1E5",
        cream: "#FBF7F0",
        // ── Brand tokens (admin redesign source of truth).
        brand: {
          royal:      "#002845",
          "royal-deep": "#001A2D",
          "royal-soft": "#E6EAEE",
          gold:       "#D4AF37",
          "gold-dark": "#B8860B",
          "gold-soft": "#FFFCEE",
          paper:      "#FAF8F4",
          "paper-2":  "#F2EDE3",
          ink:        "#1A2433",
          "ink-2":    "#5B6779",
        },
        // ── Semantic tones (status only).
        ok:   { DEFAULT: "#047857", soft: "#ECFDF5" },
        warn: { DEFAULT: "#B45309", soft: "#FFFBEB" },
        bad:  { DEFAULT: "#B91C1C", soft: "#FEF2F2" },
        info: { DEFAULT: "#1E40AF", soft: "#EFF6FF" },
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
        gold:        "0 0 10px rgba(212, 175, 55, 0.4)",
        card:        "0 1px 2px rgba(0, 40, 69, 0.04), 0 4px 12px -4px rgba(0, 40, 69, 0.08)",
        pop:         "0 4px 12px -2px rgba(0, 40, 69, 0.12), 0 12px 32px -10px rgba(0, 40, 69, 0.18)",
        modal:       "0 24px 48px -16px rgba(0, 40, 69, 0.32), 0 8px 16px -8px rgba(0, 40, 69, 0.16)",
        "focus-gold": "0 0 0 3px rgba(212, 175, 55, 0.35)",
      },
      borderRadius: {
        "bj-sm": "8px",
        "bj-md": "12px",
        "bj-lg": "16px",
        "bj-xl": "24px",
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
