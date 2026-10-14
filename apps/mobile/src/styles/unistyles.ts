/**
 * References:
 * - Introduction: https://www.unistyl.es/v3/start/getting-started
 * - Migration from Unistyle v2 to v3: https://www.unistyl.es/v3/start/migration-guide
 */

import { StyleSheet } from 'react-native-unistyles';

import breakpoints from './breakpoints';
import { darkTheme, lightTheme } from './themes';

const appThemes = {
  light: lightTheme,
  dark: darkTheme,
};

type AppBreakpoints = typeof breakpoints;
type AppThemes = typeof appThemes;

declare module 'react-native-unistyles' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesBreakpoints extends AppBreakpoints {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface UnistylesThemes extends AppThemes {}
}

StyleSheet.configure({
  settings: {
    initialTheme: 'dark',
  },
  breakpoints,
  themes: appThemes,
});
