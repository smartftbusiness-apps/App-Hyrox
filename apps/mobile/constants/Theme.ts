export const HyroxTheme = {
  background: '#0A0A0A',
  surface: '#141414',
  surfaceElevated: '#1E1E1E',
  border: '#2A2A2A',
  text: '#FFFFFF',
  textMuted: '#9CA3AF',
  accent: '#FFED00',
  accentDark: '#C9B800',
  success: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  run: '#3B82F6',
  station: '#F97316',
} as const;

export type HyroxThemeType = typeof HyroxTheme;
