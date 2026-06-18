export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  '2xl': 28,
  full: 9999,
  card: 18,
  button: 14,
  input: 14,
} as const;

export type Radius = typeof radius;
