import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';

import { normalizeCode } from '@/atv/messages';
import { tapFeedback } from '@/components/remote/useRemoteKey';
import { useTranslate } from '@/localization/utils';
import { remote, useConnectionStore } from '@/remote/client';
import { TextStyles } from '@/theme';
import { ms } from '@/utils';

/** Code field and Pair button. Remounts whenever the TV shows a new code, which clears it. */
function CodeEntry({ verifying }: { verifying: boolean }): React.JSX.Element {
  const { theme } = useUnistyles();
  const t = useTranslate();
  const [code, setCode] = useState('');
  const valid = normalizeCode(code) !== null;

  const submit = () => {
    if (!valid || verifying) return;
    tapFeedback();
    remote.submitPairingCode(code);
  };

  return (
    <>
      <Text style={[TextStyles.bodySmallSemiBold, styles.dim]}>{t('pair.enter_code')}</Text>
      <View style={styles.codeRow}>
        <TextInput
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect={false}
          editable={!verifying}
          maxLength={6}
          placeholder="A1B2C3"
          placeholderTextColor={theme.colors.remoteDim}
          returnKeyType="go"
          style={[TextStyles.h3, styles.codeInput]}
          value={code}
          onChangeText={(text) => setCode(text.toUpperCase())}
          onSubmitEditing={submit}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!valid || verifying}
          style={({ pressed }) => styles.pairButton(valid && !verifying, pressed)}
          onPress={submit}
        >
          {verifying ? (
            <ActivityIndicator color={theme.colors.white} size="small" />
          ) : (
            <Text style={[TextStyles.bodySemiBold, styles.white]}>{t('pair.pair')}</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

/**
 * One-time pairing for TVs that only have Google's Android TV Remote service: the TV shows a
 * 6-character code and the user types it here. Opened by the remote screen when the client
 * reports `pairing`, and closes itself once the TV is connected.
 */
export default function PairScreen(): React.JSX.Element {
  const { theme } = useUnistyles();
  const t = useTranslate();
  const status = useConnectionStore((s) => s.status);
  const host = useConnectionStore((s) => s.host);
  const step = useConnectionStore((s) => s.pairingStep);
  const error = useConnectionStore((s) => s.pairingError);

  useEffect(() => {
    if (status === 'connected') router.back();
  }, [status]);

  // Leaving mid-pairing (swipe down, back button) cancels it, so it doesn't reopen.
  useEffect(
    () => () => {
      if (useConnectionStore.getState().status === 'pairing') remote.disconnect();
    },
    [],
  );

  const verifying = step === 'verifying';
  const canRetry = error === 'rejected' || error === 'connection' || status === 'failed';
  const waiting = !canRetry && (step === 'starting' || status === 'connecting' || !step);

  const errorText = error
    ? {
        wrongCode: t('pair.error_wrong_code'),
        rejected: t('pair.error_rejected'),
        connection: t('pair.error_connection'),
        certificate: t('pair.error_certificate'),
      }[error]
    : status === 'failed'
      ? t('pair.error_rejected')
      : undefined;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.sheet}
    >
      <View style={styles.titleRow}>
        <Text style={[TextStyles.h3, styles.label]}>{t('pair.title')}</Text>
        <Pressable
          accessibilityLabel={t('pair.cancel')}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.close}
          onPress={() => {
            remote.disconnect();
            router.back();
          }}
        >
          <Ionicons color={theme.colors.remoteDim} name="close" size={ms(20)} />
        </Pressable>
      </View>

      <Text style={[TextStyles.body, styles.dim]}>{t('pair.intro', { host })}</Text>

      {waiting ? (
        <View style={styles.waitingRow}>
          <ActivityIndicator color={theme.colors.remoteDim} size="small" />
          <Text style={[TextStyles.body, styles.label]}>{t('pair.requesting')}</Text>
        </View>
      ) : null}

      {!waiting && !canRetry ? <CodeEntry verifying={verifying} /> : null}

      {errorText ? <Text style={[TextStyles.bodySmall, styles.error]}>{errorText}</Text> : null}

      {canRetry ? (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => styles.pairButton(true, pressed)}
          onPress={() => {
            tapFeedback();
            remote.retryPairing();
          }}
        >
          <Text style={[TextStyles.bodySemiBold, styles.white]}>{t('pair.retry')}</Text>
        </Pressable>
      ) : null}

      <Text style={[TextStyles.caption, styles.dim, styles.hint]}>{t('pair.hint')}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  sheet: {
    flex: 1,
    backgroundColor: theme.colors.remoteBody,
  },
  content: {
    padding: ms(20),
    // The Android modal is full screen and needs the status bar inset; the iOS sheet doesn't.
    paddingTop: (Platform.OS === 'android' ? rt.insets.top : 0) + ms(20),
    paddingBottom: rt.insets.bottom + ms(24),
    gap: ms(14),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: ms(4),
  },
  close: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.remoteKey,
  },
  label: {
    color: theme.colors.remoteLabel,
  },
  dim: {
    color: theme.colors.remoteDim,
  },
  white: {
    color: theme.colors.white,
  },
  error: {
    color: theme.colors.statusFailed,
  },
  hint: {
    marginTop: ms(8),
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    paddingVertical: ms(8),
  },
  codeRow: {
    flexDirection: 'row',
    gap: ms(10),
  },
  codeInput: {
    flex: 1,
    height: ms(52),
    paddingHorizontal: ms(14),
    borderRadius: ms(12),
    backgroundColor: theme.colors.remoteKey,
    color: theme.colors.remoteLabel,
    letterSpacing: 6,
    textAlign: 'center',
  },
  pairButton: (enabled: boolean, pressed: boolean) => ({
    height: ms(52),
    minWidth: ms(88),
    paddingHorizontal: ms(18),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
    opacity: !enabled ? 0.4 : pressed ? 0.8 : 1,
  }),
}));
