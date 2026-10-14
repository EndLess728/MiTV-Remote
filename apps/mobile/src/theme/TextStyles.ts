import { StyleSheet } from 'react-native-unistyles';

import { ms } from '@/utils';

import { fonts } from './fonts';

export const TextStyles = StyleSheet.create(() => ({
  // ── Headings ───────────────────────────────────────────────
  h1: {
    fontSize: ms(32),
    lineHeight: ms(40),
    fontFamily: fonts.openSan.bold,
  },
  h2: {
    fontSize: ms(24),
    lineHeight: ms(32),
    fontFamily: fonts.openSan.bold,
  },
  h3: {
    fontSize: ms(20),
    lineHeight: ms(28),
    fontFamily: fonts.openSan.bold,
  },

  // ── Body ───────────────────────────────────────────────────
  bodyLarge: {
    fontSize: ms(18),
    lineHeight: ms(26),
    fontFamily: fonts.openSan.regular,
  },
  body: {
    fontSize: ms(16),
    lineHeight: ms(24),
    fontFamily: fonts.openSan.regular,
  },
  bodySmall: {
    fontSize: ms(14),
    lineHeight: ms(20),
    fontFamily: fonts.openSan.regular,
  },

  // ── Emphasis (semiBold variants) ───────────────────────────
  bodyLargeSemiBold: {
    fontSize: ms(18),
    lineHeight: ms(26),
    fontFamily: fonts.openSan.semiBold,
  },
  bodySemiBold: {
    fontSize: ms(16),
    lineHeight: ms(24),
    fontFamily: fonts.openSan.semiBold,
  },
  bodySmallSemiBold: {
    fontSize: ms(14),
    lineHeight: ms(20),
    fontFamily: fonts.openSan.semiBold,
  },

  // ── UI Elements ────────────────────────────────────────────
  button: {
    fontSize: ms(18),
    lineHeight: ms(24),
    fontFamily: fonts.openSan.semiBold,
  },
  buttonSmall: {
    fontSize: ms(14),
    lineHeight: ms(20),
    fontFamily: fonts.openSan.semiBold,
  },
  label: {
    fontSize: ms(16),
    lineHeight: ms(22),
    fontFamily: fonts.openSan.bold,
  },
  caption: {
    fontSize: ms(12),
    lineHeight: ms(16),
    fontFamily: fonts.openSan.regular,
  },
  overline: {
    fontSize: ms(10),
    lineHeight: ms(14),
    fontFamily: fonts.openSan.semiBold,
    textTransform: 'uppercase' as const,
    letterSpacing: ms(1),
  },

  // ── Utility ────────────────────────────────────────────────
  error: {
    fontSize: ms(12),
    lineHeight: ms(16),
    fontFamily: fonts.openSan.regular,
  },
  link: {
    fontSize: ms(16),
    lineHeight: ms(24),
    fontFamily: fonts.openSan.semiBold,
    textDecorationLine: 'underline' as const,
  },
}));
