import { useCallback, useEffect, useRef } from 'react';
import * as Haptics from 'expo-haptics';

import type { AndroidKeyName } from '@/milink/keys';
import { remote } from '@/remote/client';
import { useSettingsStore } from '@/store';

/** How long a finger must stay down before a repeating key starts repeating. */
const HOLD_DELAY_MS = 350;

export function tapFeedback(): void {
  if (useSettingsStore.getState().haptics) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
}

/**
 * Press handlers for a remote key. A tap sends DOWN+UP on release. With `repeat`, keeping the
 * finger down past HOLD_DELAY_MS turns it into a held key that repeats until release, the way
 * the D-pad and volume behave on a physical remote.
 */
export function useRemoteKey(key: AndroidKeyName, repeat = false) {
  const holdTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const holding = useRef(false);

  useEffect(
    () => () => {
      clearTimeout(holdTimer.current);
      if (holding.current) remote.endHold();
    },
    [],
  );

  const onPressIn = useCallback(() => {
    tapFeedback();
    if (!repeat) return;
    holding.current = false;
    holdTimer.current = setTimeout(() => {
      holding.current = true;
      remote.beginHold(key);
    }, HOLD_DELAY_MS);
  }, [key, repeat]);

  const onPressOut = useCallback(() => {
    clearTimeout(holdTimer.current);
    if (holding.current) {
      holding.current = false;
      remote.endHold();
    } else {
      remote.press(key);
    }
  }, [key]);

  return { onPressIn, onPressOut };
}
