/**
 * References:
 * - Introduction: https://www.unistyl.es/v3/start/getting-started
 * - Migration from Unistyle v2 to v3: https://www.unistyl.es/v3/start/migration-guide
 */

// Colors that look correct on both light and dark surfaces — kept in a
// single map so each theme only declares its differences.
const constantsColors = {
  danger: '#dc3545',
  grey: '#B0B0B0',
  black: '#000000',
  white: '#ffffff',
  blue: '#001EB9',
  light: '#f8f9fa',
  green: '#62EA9F',
  cancel: '#EB5757',
  // Text color to use on top of a primary-colored fill (white reads on
  // the cyan primary in both themes).
  onPrimary: '#ffffff',
  // Remote control surface. A remote reads as a dark physical object in
  // either theme, so these are shared rather than per-theme.
  remoteScreen: '#0E0E11',
  remoteBody: '#1B1B20',
  remoteBodyEdge: 'rgba(255,255,255,0.07)',
  remoteRing: '#24242B',
  remoteKey: '#2B2B33',
  remoteKeyPressed: '#3D3D48',
  remoteLabel: '#F2F2F5',
  remoteDim: '#8E8E9A',
  // Xiaomi orange, used for the primary media key and active states.
  accent: '#FF6900',
  power: '#E5484D',
  statusConnected: '#30D158',
  statusConnecting: '#FFD60A',
  statusFailed: '#FF453A',
};
export const lightTheme = {
  colors: {
    ...constantsColors,
    typography: '#000000',
    background: '#ffffff',
    // Elevated UI surface (cards, segmented controls, language pills, …).
    // Different from `background` so screens render a subtle layer on the
    // root background — in dark mode this becomes a near-black charcoal
    // instead of pure-black, which is what users actually want.
    surface: '#ffffff',
    barStyle: 'dark-content',
    opacity50: 'rgba(1,1,1,0.5)',
    textInputColor: 'rgba(217, 217, 217,0.2)',
    placeholder: 'rgba(1,1,1,0.52)',
    darkwhite: '#000000',
    primary: '#00BFFF',
    primaryTransparent: '#E1F8FF',
    textGray: '#6B7F85',
    primaryText: '#394347',
    fadedWhite: '#F7F8F9',
    borderGray: '#E8ECF4',
    iconGray: '#8BA1A8',
  },
  margins: {
    sm: 2,
    md: 4,
    lg: 8,
    xl: 12,
  },
} as const;

export const darkTheme = {
  colors: {
    ...constantsColors,
    typography: '#ffffff',
    background: '#000000',
    surface: '#1A1A1A',
    barStyle: 'light-content',
    opacity50: 'rgba(201, 201, 201,0.5)',
    textInputColor: '#000000',
    placeholder: '#f8f9fa',
    darkwhite: '#ffffff',
    primary: '#00BFFF',
    primaryTransparent: '#001A1F',
    textGray: '#6B7F85',
    primaryText: '#394347',
    fadedWhite: '#1A1A1A',
    borderGray: '#2A2A2A',
    iconGray: '#8BA1A8',
  },
  margins: {
    sm: 2,
    md: 4,
    lg: 8,
    xl: 12,
  },
} as const;
