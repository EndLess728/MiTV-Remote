import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router } from 'expo-router';
import MiLink, { type FoundTV } from 'milink';

import { tapFeedback } from '@/components/remote/useRemoteKey';
import { useTranslate } from '@/localization/utils';
import { remote, useConnectionStore } from '@/remote/client';
import { useSettingsStore } from '@/store';
import { TextStyles } from '@/theme';
import { ms } from '@/utils';

const SEARCH_MS = 8000;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isIPv4(value: string): boolean {
  const match = IPV4.exec(value.trim());
  return !!match && match.slice(1).every((part) => Number(part) <= 255);
}

/** Finds Mi TVs over Bonjour/NSD for SEARCH_MS after each (re)scan. */
function useDiscovery() {
  const [tvs, setTvs] = useState<FoundTV[]>([]);
  const [searching, setSearching] = useState(true);
  const [scan, setScan] = useState(0);

  useEffect(() => {
    const subscription = MiLink.addListener('onTvFound', (tv) => {
      setTvs((current) => (current.some((t) => t.id === tv.id) ? current : [...current, tv]));
    });
    MiLink.startDiscovery();
    const timer = setTimeout(() => setSearching(false), SEARCH_MS);
    return () => {
      clearTimeout(timer);
      subscription.remove();
      MiLink.stopDiscovery();
    };
  }, [scan]);

  const rescan = () => {
    setTvs([]);
    setSearching(true);
    setScan((n) => n + 1);
  };

  return { tvs, searching, rescan };
}

export default function ConnectScreen(): React.JSX.Element {
  const { theme } = useUnistyles();
  const t = useTranslate();
  const tvHost = useSettingsStore((s) => s.tvHost);
  const haptics = useSettingsStore((s) => s.haptics);
  const setTvHost = useSettingsStore((s) => s.setTvHost);
  const setHaptics = useSettingsStore((s) => s.setHaptics);
  const status = useConnectionStore((s) => s.status);
  const { tvs, searching, rescan } = useDiscovery();
  const [ip, setIp] = useState(tvHost);
  const autoPicked = useRef(false);

  const connect = useCallback(
    (host: string) => {
      tapFeedback();
      setTvHost(host);
      remote.connect(host);
      router.back();
    },
    [setTvHost],
  );

  // First run: if exactly one TV turns up, connect to it without asking.
  useEffect(() => {
    if (!tvHost && !autoPicked.current && tvs.length === 1) {
      autoPicked.current = true;
      connect(tvs[0].address);
    }
  }, [tvs, tvHost, connect]);

  const isConnected = (address: string) => status === 'connected' && address === tvHost;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      style={styles.sheet}
    >
      <View style={styles.titleRow}>
        <Text style={[TextStyles.h3, styles.title]}>{t('connect.title')}</Text>
        <Pressable
          accessibilityLabel={t('common.done')}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.close}
          onPress={() => router.back()}
        >
          <Ionicons color={theme.colors.remoteDim} name="close" size={ms(20)} />
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[TextStyles.bodySmallSemiBold, styles.dim]}>{t('connect.found')}</Text>
        {searching ? (
          <ActivityIndicator color={theme.colors.remoteDim} size="small" />
        ) : (
          <Pressable hitSlop={8} onPress={rescan}>
            <Text style={[TextStyles.bodySmallSemiBold, styles.link]}>{t('connect.rescan')}</Text>
          </Pressable>
        )}
      </View>

      {tvs.length === 0 ? (
        <Text style={[TextStyles.bodySmall, styles.dim, styles.empty]}>
          {searching ? t('connect.searching') : t('connect.none_found')}
        </Text>
      ) : (
        tvs.map((tv) => (
          <Pressable
            key={tv.id}
            accessibilityRole="button"
            style={({ pressed }) => styles.tvRow(pressed)}
            onPress={() => connect(tv.address)}
          >
            <Ionicons color={theme.colors.remoteLabel} name="tv" size={ms(22)} />
            <View style={styles.tvText}>
              <Text style={[TextStyles.bodySemiBold, styles.label]}>{tv.model || tv.name}</Text>
              <Text style={[TextStyles.caption, styles.dim]}>{tv.address}</Text>
            </View>
            <Ionicons
              color={
                isConnected(tv.address) ? theme.colors.statusConnected : theme.colors.remoteDim
              }
              name={isConnected(tv.address) ? 'checkmark-circle' : 'chevron-forward'}
              size={ms(20)}
            />
          </Pressable>
        ))
      )}

      <Text style={[TextStyles.bodySmallSemiBold, styles.dim, styles.manualTitle]}>
        {t('connect.manual')}
      </Text>
      <View style={styles.manualRow}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="decimal"
          placeholder={t('connect.ip_placeholder')}
          placeholderTextColor={theme.colors.remoteDim}
          returnKeyType="go"
          style={[TextStyles.body, styles.input]}
          value={ip}
          onChangeText={setIp}
          onSubmitEditing={() => isIPv4(ip) && connect(ip.trim())}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!isIPv4(ip)}
          style={({ pressed }) => styles.connectButton(isIPv4(ip), pressed)}
          onPress={() => connect(ip.trim())}
        >
          <Text style={[TextStyles.bodySemiBold, styles.connectLabel]}>{t('connect.connect')}</Text>
        </Pressable>
      </View>
      <Text style={[TextStyles.caption, styles.dim]}>{t('connect.ip_hint')}</Text>

      <View style={styles.settingRow}>
        <Text style={[TextStyles.body, styles.label]}>{t('connect.haptics')}</Text>
        <Switch
          thumbColor={theme.colors.white}
          trackColor={{ true: theme.colors.accent, false: theme.colors.remoteKey }}
          value={haptics}
          onValueChange={setHaptics}
        />
      </View>

      {tvHost && status !== 'idle' ? (
        <Pressable
          accessibilityRole="button"
          style={styles.disconnect}
          onPress={() => {
            remote.disconnect();
            router.back();
          }}
        >
          <Text style={[TextStyles.bodySemiBold, styles.disconnectLabel]}>
            {t('connect.disconnect')}
          </Text>
        </Pressable>
      ) : null}
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
    gap: ms(12),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: ms(4),
  },
  title: {
    color: theme.colors.remoteLabel,
  },
  close: {
    width: ms(32),
    height: ms(32),
    borderRadius: ms(16),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.remoteKey,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dim: {
    color: theme.colors.remoteDim,
  },
  label: {
    color: theme.colors.remoteLabel,
  },
  link: {
    color: theme.colors.accent,
  },
  empty: {
    paddingVertical: ms(8),
  },
  tvRow: (pressed: boolean) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(12),
    padding: ms(14),
    borderRadius: ms(14),
    backgroundColor: pressed ? theme.colors.remoteKeyPressed : theme.colors.remoteKey,
  }),
  tvText: {
    flex: 1,
  },
  manualTitle: {
    marginTop: ms(12),
  },
  manualRow: {
    flexDirection: 'row',
    gap: ms(10),
  },
  input: {
    flex: 1,
    height: ms(46),
    paddingHorizontal: ms(14),
    borderRadius: ms(12),
    backgroundColor: theme.colors.remoteKey,
    color: theme.colors.remoteLabel,
  },
  connectButton: (enabled: boolean, pressed: boolean) => ({
    height: ms(46),
    paddingHorizontal: ms(18),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.accent,
    opacity: !enabled ? 0.4 : pressed ? 0.8 : 1,
  }),
  connectLabel: {
    color: theme.colors.white,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: ms(12),
  },
  disconnect: {
    marginTop: ms(8),
    height: ms(46),
    borderRadius: ms(12),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.power,
  },
  disconnectLabel: {
    color: theme.colors.power,
  },
}));
