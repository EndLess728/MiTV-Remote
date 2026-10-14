import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';

import { useTranslate } from '@/localization/utils';
import type { AndroidKeyName } from '@/milink/keys';
import { TextStyles } from '@/theme';

import { useRemoteKey } from './useRemoteKey';

type Direction = 'up' | 'down' | 'left' | 'right';

const ARROWS: Record<Direction, { key: AndroidKeyName; icon: IoniconsIconName }> = {
  up: { key: 'dpadUp', icon: 'chevron-up' },
  down: { key: 'dpadDown', icon: 'chevron-down' },
  left: { key: 'dpadLeft', icon: 'chevron-back' },
  right: { key: 'dpadRight', icon: 'chevron-forward' },
};

function Arrow({ direction, diameter }: { direction: Direction; diameter: number }) {
  const { theme } = useUnistyles();
  const t = useTranslate();
  const { key, icon } = ARROWS[direction];
  const handlers = useRemoteKey(key, true);

  return (
    <Pressable
      accessibilityLabel={t(`remote.${direction}`)}
      accessibilityRole="button"
      style={({ pressed }) => styles.arrow(direction, diameter, pressed)}
      {...handlers}
    >
      <Ionicons color={theme.colors.remoteLabel} name={icon} size={diameter * 0.11} />
    </Pressable>
  );
}

function OkButton({ diameter }: { diameter: number }) {
  const t = useTranslate();
  const handlers = useRemoteKey('dpadCenter');

  return (
    <Pressable
      accessibilityLabel={t('remote.ok')}
      accessibilityRole="button"
      style={({ pressed }) => styles.ok(diameter, pressed)}
      {...handlers}
    >
      <Text style={[TextStyles.h3, styles.okLabel]}>OK</Text>
    </Pressable>
  );
}

/** Circular D-pad: four hold-to-repeat arrows around a center OK key. */
export function DPad({ diameter }: { diameter: number }): React.JSX.Element {
  return (
    <View style={styles.ring(diameter)}>
      <Arrow diameter={diameter} direction="up" />
      <Arrow diameter={diameter} direction="down" />
      <Arrow diameter={diameter} direction="left" />
      <Arrow diameter={diameter} direction="right" />
      <OkButton diameter={diameter} />
    </View>
  );
}

const ARROW_RATIO = 0.3;
const OK_RATIO = 0.4;

const styles = StyleSheet.create((theme) => ({
  ring: (diameter: number) => ({
    width: diameter,
    height: diameter,
    borderRadius: diameter / 2,
    backgroundColor: theme.colors.remoteRing,
    alignItems: 'center',
    justifyContent: 'center',
  }),
  arrow: (direction: Direction, diameter: number, pressed: boolean) => {
    const size = diameter * ARROW_RATIO;
    const inset = diameter * 0.03;
    const middle = (diameter - size) / 2;
    const position = {
      up: { top: inset, left: middle },
      down: { bottom: inset, left: middle },
      left: { left: inset, top: middle },
      right: { right: inset, top: middle },
    }[direction];
    return {
      position: 'absolute',
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: pressed ? theme.colors.remoteKeyPressed : 'transparent',
      ...position,
    };
  },
  ok: (diameter: number, pressed: boolean) => {
    const size = diameter * OK_RATIO;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: pressed ? theme.colors.remoteKeyPressed : theme.colors.remoteKey,
      transform: [{ scale: pressed ? 0.96 : 1 }],
    };
  },
  okLabel: {
    color: theme.colors.remoteLabel,
  },
}));
