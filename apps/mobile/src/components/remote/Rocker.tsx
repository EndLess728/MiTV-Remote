import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons, type IoniconsIconName } from '@react-native-vector-icons/ionicons';

import type { AndroidKeyName } from '@/milink/keys';
import { TextStyles } from '@/theme';
import { ms } from '@/utils';

import { useRemoteKey } from './useRemoteKey';

interface HalfProps {
  keyName: AndroidKeyName;
  icon: IoniconsIconName;
  accessibilityLabel: string;
  position: 'top' | 'bottom';
}

function Half({ keyName, icon, accessibilityLabel, position }: HalfProps) {
  const { theme } = useUnistyles();
  const handlers = useRemoteKey(keyName, true);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      style={({ pressed }) => styles.half(position, pressed)}
      {...handlers}
    >
      <Ionicons color={theme.colors.remoteLabel} name={icon} size={ms(22)} />
    </Pressable>
  );
}

interface RockerProps {
  label: string;
  up: Omit<HalfProps, 'position'>;
  down: Omit<HalfProps, 'position'>;
}

/** A vertical up/down pill, like the volume and channel rockers on a physical remote. */
export function Rocker({ label, up, down }: RockerProps): React.JSX.Element {
  return (
    <View style={styles.pill}>
      <Half {...up} position="top" />
      <Text style={[TextStyles.caption, styles.label]}>{label}</Text>
      <Half {...down} position="bottom" />
    </View>
  );
}

const WIDTH = ms(58);

const styles = StyleSheet.create((theme) => ({
  pill: {
    width: WIDTH,
    borderRadius: WIDTH / 2,
    backgroundColor: theme.colors.remoteKey,
    alignItems: 'center',
    overflow: 'hidden',
  },
  half: (position: 'top' | 'bottom', pressed: boolean) => ({
    width: WIDTH,
    height: ms(58),
    alignItems: 'center',
    justifyContent: position === 'top' ? 'flex-end' : 'flex-start',
    paddingTop: position === 'top' ? 0 : ms(6),
    paddingBottom: position === 'top' ? ms(6) : 0,
    backgroundColor: pressed ? theme.colors.remoteKeyPressed : 'transparent',
  }),
  label: {
    color: theme.colors.remoteDim,
    letterSpacing: 1,
    fontSize: ms(11),
    lineHeight: ms(14),
  },
}));
