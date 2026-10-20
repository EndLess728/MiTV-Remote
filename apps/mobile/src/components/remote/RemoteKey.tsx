import React from 'react';
import { Pressable, type ViewStyle } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';

import type { AndroidKeyName } from '@/milink/keys';
import { ms } from '@/utils';

import { useRemoteKey } from './useRemoteKey';

type Variant = 'default' | 'accent' | 'power';

interface RemoteKeyProps {
  keyName: AndroidKeyName;
  icon: IoniconsIconName;
  accessibilityLabel: string;
  repeat?: boolean;
  size?: number;
  variant?: Variant;
  style?: ViewStyle;
  /** Dimmed and inert, for keys the connected TV doesn't support. */
  disabled?: boolean;
}

/** A round remote button that sends one Android key. */
export function RemoteKey({
  keyName,
  icon,
  accessibilityLabel,
  repeat = false,
  size = ms(52),
  variant = 'default',
  style,
  disabled = false,
}: RemoteKeyProps): React.JSX.Element {
  const { theme } = useUnistyles();
  const handlers = useRemoteKey(keyName, repeat);
  const iconColor = variant === 'default' ? theme.colors.remoteLabel : theme.colors.white;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        styles.key(size, variant, pressed),
        disabled && styles.disabled,
        style,
      ]}
      {...handlers}
    >
      <Ionicons color={iconColor} name={icon} size={size * 0.42} />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  disabled: {
    opacity: 0.35,
  },
  key: (size: number, variant: Variant, pressed: boolean) => {
    const fill =
      variant === 'accent'
        ? theme.colors.accent
        : variant === 'power'
          ? theme.colors.power
          : theme.colors.remoteKey;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: pressed && variant === 'default' ? theme.colors.remoteKeyPressed : fill,
      opacity: pressed && variant !== 'default' ? 0.8 : 1,
      transform: [{ scale: pressed ? 0.94 : 1 }],
    };
  },
}));
