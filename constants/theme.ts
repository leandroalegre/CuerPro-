/**
 * CuerPro – Design Tokens
 * Paleta: grafito + naranja energía
 */

export const Colors = {
  // Fondos
  bg:         '#0c0d10',
  bgCard:     '#16181d',
  bgInput:    '#1d2027',
  bgMuted:    '#23262e',

  // Bordes
  border:     '#2b2f38',
  borderFocus:'#ff6b35',

  // Texto
  textPrimary:  '#f2f3f5',
  textSecondary:'#a0a6b4',
  textMuted:    '#6b7180',
  textInverse:  '#0c0d10',

  // Acento
  accent:     '#ff6b35',
  accentDark: '#e0521f',
  accentGlow: 'rgba(255,107,53,0.16)',

  // Estados
  success:    '#22c55e',
  successBg:  'rgba(34,197,94,0.12)',
  error:      '#ef4444',
  errorBg:    'rgba(239,68,68,0.12)',
  warning:    '#f59e0b',
  warningBg:  'rgba(245,158,11,0.12)',
} as const;

// Colores de cada nivel de la temporada
export const NivelColor: Record<string, string> = {
  Bronce:   '#cd7f32',
  Plata:    '#c0c6d0',
  Oro:      '#f5c542',
  Platino:  '#7fd8d0',
  Diamante: '#8ab4ff',
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
} as const;

export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  full: 999,
} as const;

export const Typography = {
  displayMd: { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.3 },
  titleLg:   { fontSize: 20, fontWeight: '700' as const },
  titleMd:   { fontSize: 17, fontWeight: '600' as const },
  body:      { fontSize: 15, fontWeight: '400' as const, lineHeight: 22 },
  label:     { fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.6 },
  caption:   { fontSize: 12, fontWeight: '400' as const },
} as const;
