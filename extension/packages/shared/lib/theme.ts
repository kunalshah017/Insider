/**
 * Shared Theme Constants
 *
 * Consistent design tokens used across popup and content-ui
 */

export const theme = {
  // Core colors
  colors: {
    bgPrimary: '#0a0b0d',
    bgSecondary: '#12141a',
    bgTertiary: '#1a1d25',
    bgCard: '#16181f',
    bgHover: '#1f222b',

    // Text
    textPrimary: '#f0f2f5',
    textSecondary: '#8b9199',
    textMuted: '#5c6370',

    // Accents
    accent: '#00d992',
    accentGlow: 'rgba(0, 217, 146, 0.15)',
    accentDim: '#00a870',
    accentBuy: '#00d992',
    accentSell: '#ff6b6b',
    accentWarn: '#ffb84d',

    // Borders
    borderSubtle: 'rgba(255, 255, 255, 0.06)',
    borderLight: 'rgba(255, 255, 255, 0.1)',
  },

  // Typography
  fonts: {
    primary: "'Roboto', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'Roboto Mono', 'SF Mono', monospace",
  },

  // Spacing
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },

  // Border radius
  radius: {
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '10px',
    xl: '16px',
  },

  // Transitions
  transitions: {
    fast: '0.15s ease',
    normal: '0.25s ease',
  },
} as const;

// Google Fonts import URL for Roboto
export const FONT_IMPORT_URL =
  'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;600;700&family=Roboto+Mono:wght@400;500&display=swap';

// CSS variables string for injection
export const getCSSVariables = () => `
  --bg-primary: ${theme.colors.bgPrimary};
  --bg-secondary: ${theme.colors.bgSecondary};
  --bg-tertiary: ${theme.colors.bgTertiary};
  --bg-card: ${theme.colors.bgCard};
  --bg-hover: ${theme.colors.bgHover};
  --text-primary: ${theme.colors.textPrimary};
  --text-secondary: ${theme.colors.textSecondary};
  --text-muted: ${theme.colors.textMuted};
  --accent: ${theme.colors.accent};
  --accent-glow: ${theme.colors.accentGlow};
  --accent-dim: ${theme.colors.accentDim};
  --accent-buy: ${theme.colors.accentBuy};
  --accent-sell: ${theme.colors.accentSell};
  --accent-warn: ${theme.colors.accentWarn};
  --border-subtle: ${theme.colors.borderSubtle};
  --border-light: ${theme.colors.borderLight};
  --font-primary: ${theme.fonts.primary};
  --font-mono: ${theme.fonts.mono};
`;
