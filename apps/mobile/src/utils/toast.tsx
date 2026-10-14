/**
 * Toast — single source of truth.
 *
 * Wraps `react-native-toast-message` with a themed UI and ergonomic helpers.
 *
 * Public surface:
 *   - `toastConfig`  → pass to <Toast config={toastConfig} /> in App.tsx
 *   - `showSuccessToast` / `showErrorToast` / `showInfoToast` / `showWarningToast`
 *   - `ToastParams` type (extends ToastShowParams; renames text1→title, text2→message)
 *
 * `CustomToast` is intentionally not exported — it's a private renderer used
 * only by `toastConfig`.
 */

import React from 'react';
import { Text, View } from 'react-native';
import Toast, { ToastShowParams } from 'react-native-toast-message';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@react-native-vector-icons/ionicons';

import { fonts } from '@/theme';
import { ms } from '@/utils/scale';

type ToastType = 'success' | 'error' | 'info' | 'warning';

// ─────────────────────────────────────────────────────────────
//  UI (private)
// ─────────────────────────────────────────────────────────────

// Toast accent colors are intentionally NOT pulled from the theme. They are
// semantic UI signals (green = success, red = error, …) that should read the
// same in light and dark mode, and keeping them here makes the toast
// self-contained — no theme migration is needed to drop it into another app.
const TYPE_COLORS: Record<ToastType, string> = {
  success: '#22C55E',
  error: '#EF4444',
  info: '#3B82F6',
  warning: '#F59E0B',
};

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const TYPE_ICONS: Record<ToastType, IoniconsName> = {
  success: 'checkmark-circle',
  error: 'close-circle',
  info: 'information-circle',
  warning: 'warning',
};

interface CustomToastProps {
  type: ToastType;
  title: string;
  message?: string;
}

const CustomToast: React.FC<CustomToastProps> = ({ type, title, message }) => {
  const { theme } = useUnistyles();
  const accentColor = TYPE_COLORS[type];

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background, borderColor: accentColor },
      ]}
    >
      <Ionicons color={accentColor} name={TYPE_ICONS[type]} size={ms(24)} style={styles.icon} />
      <View style={styles.contentContainer}>
        <Text numberOfLines={2} style={[styles.title, { color: accentColor }]}>
          {title}
        </Text>
        {message ? (
          <Text numberOfLines={2} style={[styles.message, { color: theme.colors.textGray }]}>
            {message}
          </Text>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: ms(16),
    marginTop: ms(8),
    paddingHorizontal: ms(16),
    paddingVertical: ms(12),
    borderRadius: ms(12),
    borderWidth: 0.4,
    minHeight: ms(56),
    // `rt.screen.width` is reactive — unistyles recomputes the style on
    // rotation / iPad split-view so the toast resizes instead of staying
    // pinned to the cold-start width.
    maxWidth: rt.screen.width - ms(32),
    shadowColor: theme.colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  icon: {
    marginRight: ms(12),
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: ms(15),
    fontFamily: fonts.openSan.semiBold,
    lineHeight: ms(20),
    marginBottom: ms(2),
  },
  message: {
    fontSize: ms(12),
    fontFamily: fonts.openSan.regular,
    lineHeight: ms(16),
  },
}));

// ─────────────────────────────────────────────────────────────
//  Config — passed to <Toast />
// ─────────────────────────────────────────────────────────────

type ToastConfigProps = { text1?: string; text2?: string };

export const toastConfig = {
  success: (props: ToastConfigProps) => (
    <CustomToast message={props.text2} title={props.text1 ?? ''} type="success" />
  ),
  error: (props: ToastConfigProps) => (
    <CustomToast message={props.text2} title={props.text1 ?? ''} type="error" />
  ),
  info: (props: ToastConfigProps) => (
    <CustomToast message={props.text2} title={props.text1 ?? ''} type="info" />
  ),
  warning: (props: ToastConfigProps) => (
    <CustomToast message={props.text2} title={props.text1 ?? ''} type="warning" />
  ),
};

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Extends `ToastShowParams` from react-native-toast-message so callers can pass
 * any supported option (`position`, `visibilityTime`, `autoHide`, `onPress`,
 * `topOffset`, `bottomOffset`, `swipeable`, `props`, …) — see the library's
 * types for the full list.
 *
 * - `type` is overridden internally by each helper.
 * - `text1` / `text2` are renamed to `title` / `message` for ergonomics.
 */
export type ToastParams = Omit<ToastShowParams, 'type' | 'text1' | 'text2'> & {
  title: string;
  message?: string;
};

const show = (type: ToastType, params: ToastParams): void => {
  const { title, message, ...rest } = params;
  Toast.show({ ...rest, type, text1: title, text2: message });
};

export const showSuccessToast = (params: ToastParams): void => show('success', params);
export const showErrorToast = (params: ToastParams): void => show('error', params);
export const showInfoToast = (params: ToastParams): void => show('info', params);
export const showWarningToast = (params: ToastParams): void => show('warning', params);
