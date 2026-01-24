export const colors = {
  gold: {
    50: '#FDF8E8',
    100: '#FAF0D1',
    200: '#F5E1A3',
    300: '#F0D275',
    400: '#E8C547',
    500: '#D4AF37',
    600: '#B8962F',
    700: '#9C7D27',
    800: '#80641F',
    900: '#644B17',
  },
  navy: {
    50: '#E6EBF0',
    100: '#CCD7E1',
    200: '#99AFC3',
    300: '#6687A5',
    400: '#335F87',
    500: '#003366',
    600: '#002952',
    700: '#001F3D',
    800: '#001529',
    900: '#001A33',
  },
  status: {
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#3B82F6',
  },
  surface: {
    white: '#FFFFFF',
    cream: '#FBF7F0',
    beige: '#F7F1E5',
    light: '#F9FAFB',
    muted: '#F3F4F6',
  },
} as const;

export const gradients = {
  goldNavy: 'linear-gradient(135deg, #D4AF37 0%, #003366 100%)',
  goldNavyVertical: 'linear-gradient(180deg, #D4AF37 0%, #003366 100%)',
  navyGold: 'linear-gradient(135deg, #003366 0%, #D4AF37 100%)',
  goldShimmer: 'linear-gradient(90deg, #D4AF37 0%, #E8C882 50%, #D4AF37 100%)',
  navyDeep: 'linear-gradient(180deg, #003366 0%, #001A33 100%)',
  premiumCard: 'linear-gradient(145deg, rgba(212, 175, 55, 0.1) 0%, rgba(0, 51, 102, 0.05) 100%)',
  heroOverlay: 'linear-gradient(180deg, rgba(0, 26, 51, 0.7) 0%, rgba(0, 51, 102, 0.9) 100%)',
  glassCard: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)',
  md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)',
  lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
  xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
  gold: '0 4px 20px rgba(212, 175, 55, 0.25)',
  goldHover: '0 8px 30px rgba(212, 175, 55, 0.35)',
  navy: '0 4px 20px rgba(0, 51, 102, 0.2)',
  navyHover: '0 8px 30px rgba(0, 51, 102, 0.3)',
  card: '0 2px 8px rgba(0, 0, 0, 0.08)',
  cardHover: '0 8px 25px rgba(0, 0, 0, 0.12)',
  premium: '0 10px 40px rgba(212, 175, 55, 0.2), 0 2px 10px rgba(0, 51, 102, 0.1)',
} as const;

export const typography = {
  fontFamily: {
    primary: 'Cairo, Tajawal, sans-serif',
    heading: 'Cairo, sans-serif',
    body: 'Tajawal, sans-serif',
  },
  fontSize: {
    xs: '0.75rem',      // 12px
    sm: '0.875rem',     // 14px
    base: '1rem',       // 16px
    lg: '1.125rem',     // 18px
    xl: '1.25rem',      // 20px
    '2xl': '1.5rem',    // 24px
    '3xl': '1.875rem',  // 30px
    '4xl': '2.25rem',   // 36px
    '5xl': '3rem',      // 48px
    '6xl': '3.75rem',   // 60px
  },
  // Mobile-optimized font sizes (minimum 14px for readability)
  mobile: {
    xs: '0.75rem',      // 12px - Labels only
    sm: '0.875rem',     // 14px - Minimum body text
    base: '1rem',       // 16px - Standard body text
    lg: '1.125rem',     // 18px - Subheadings
    xl: '1.25rem',      // 20px - Small headings
    '2xl': '1.5rem',    // 24px - Medium headings
    '3xl': '1.75rem',   // 28px - Large headings
    '4xl': '2rem',      // 32px - Hero text
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: {
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,        // Minimum for mobile
    relaxed: 1.625,
    loose: 2,
  },
} as const;

export const spacing = {
  0: '0',
  px: '1px',
  0.5: '0.125rem',
  1: '0.25rem',
  1.5: '0.375rem',
  2: '0.5rem',
  2.5: '0.625rem',
  3: '0.75rem',
  3.5: '0.875rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  7: '1.75rem',
  8: '2rem',
  9: '2.25rem',
  10: '2.5rem',
  11: '2.75rem',
  12: '3rem',
  14: '3.5rem',
  16: '4rem',
  20: '5rem',
  24: '6rem',
  28: '7rem',
  32: '8rem',
} as const;

// Mobile-optimized spacing (larger gaps for touch)
export const mobileSpacing = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '0.75rem',   // 12px
  lg: '1rem',      // 16px - Standard mobile gap
  xl: '1.5rem',    // 24px - Section spacing
  '2xl': '2rem',   // 32px - Large section spacing
  '3xl': '3rem',   // 48px - Page spacing
} as const;

// Touch target sizes (WCAG minimum: 44x44px)
export const touchTargets = {
  minimum: '2.75rem',    // 44px - WCAG minimum
  comfortable: '3rem',   // 48px - Recommended
  large: '3.5rem',       // 56px - Important actions
} as const;

export const borderRadius = {
  none: '0',
  sm: '0.25rem',
  base: '0.375rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.5rem',
  '3xl': '2rem',
  full: '9999px',
} as const;

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  base: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
  bounce: '500ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  spring: '400ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  press: '100ms cubic-bezier(0.4, 0, 0.2, 1)',
  release: '200ms cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

export const interactions = {
  button: {
    hoverScale: 1.02,
    activeScale: 0.97,
    hoverY: -2,
    activeY: 1,
    hoverShadow: '0 8px 25px rgba(0, 51, 102, 0.25), 0 4px 10px rgba(0, 51, 102, 0.15)',
    activeShadow: '0 2px 8px rgba(0, 51, 102, 0.2)',
    restShadow: '0 4px 15px rgba(0, 51, 102, 0.2)',
  },
  icon: {
    hoverRotate: 3,
    activeRotate: -2,
    hoverScale: 1.1,
  },
  card: {
    hoverY: -4,
    hoverShadow: '0 12px 30px rgba(0, 0, 0, 0.12)',
  },
} as const;

export const animations = {
  fadeIn: 'fadeIn 0.3s ease-out',
  fadeOut: 'fadeOut 0.3s ease-out',
  slideUp: 'slideUp 0.3s ease-out',
  slideDown: 'slideDown 0.3s ease-out',
  slideLeft: 'slideLeft 0.3s ease-out',
  slideRight: 'slideRight 0.3s ease-out',
  scaleIn: 'scaleIn 0.2s ease-out',
  scaleOut: 'scaleOut 0.2s ease-out',
  shimmer: 'shimmer 2s infinite linear',
  pulse: 'pulse 2s infinite',
  spin: 'spin 1s linear infinite',
  bounce: 'bounce 0.5s ease-out',
} as const;

export const zIndex = {
  dropdown: 1000,
  sticky: 1020,
  fixed: 1030,
  modalBackdrop: 1040,
  modal: 1050,
  popover: 1060,
  tooltip: 1070,
  toast: 1080,
} as const;

// Breakpoints for responsive design
export const breakpoints = {
  mobile: '375px',
  mobileLarge: '428px',
  tablet: '768px',
  desktop: '1024px',
  desktopLarge: '1280px',
} as const;
