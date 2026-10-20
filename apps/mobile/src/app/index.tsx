import React, { useEffect, useState } from 'react';
import { AppState, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@react-native-vector-icons/ionicons';
import { router, usePathname } from 'expo-router';

import { DPad } from '@/components/remote/DPad';
import { RemoteKey } from '@/components/remote/RemoteKey';
import { Rocker } from '@/components/remote/Rocker';
import { tapFeedback } from '@/components/remote/useRemoteKey';
import { useTranslate } from '@/localization/utils';
import { remote, useConnectionStore } from '@/remote/client';
import { useSettingsStore } from '@/store';
import { TextStyles } from '@/theme';
import { ms } from '@/utils';

function StatusHeader() {
  const { theme } = useUnistyles();
  const t = useTranslate();
  const status = useConnectionStore((s) => s.status);
  const host = useConnectionStore((s) => s.host);
  const latencyMs = useConnectionStore((s) => s.latencyMs);

  const color = {
    idle: theme.colors.remoteDim,
    connecting: theme.colors.statusConnecting,
    connected: theme.colors.statusConnected,
    failed: theme.colors.statusFailed,
    pairing: theme.colors.statusConnecting,
  }[status];

  const subtitle = {
    idle: t('remote.not_connected'),
    connecting: t('remote.connecting', { host }),
    connected:
      latencyMs === undefined
        ? t('remote.connected', { host })
        : t('remote.connected_latency', { host, ms: latencyMs }),
    failed: t('remote.failed', { host }),
    pairing: t('remote.pairing', { host }),
  }[status];

  return (
    <Pressable
      accessibilityLabel={t('remote.choose_tv')}
      accessibilityRole="button"
      style={styles.header}
      onPress={() => router.push('/connect')}
    >
      <View style={[styles.statusDot, { backgroundColor: color, shadowColor: color }]} />
      <View style={styles.headerText}>
        <Text style={[TextStyles.bodySemiBold, styles.title]}>{t('remote.title')}</Text>
        <Text numberOfLines={1} style={[TextStyles.caption, styles.subtitle]}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.headerButton}>
        <Ionicons color={theme.colors.remoteDim} name="tv-outline" size={ms(18)} />
      </View>
    </Pressable>
  );
}

function TypeBar() {
  const { theme } = useUnistyles();
  const t = useTranslate();
  const [text, setText] = useState('');

  const send = () => {
    if (!text) return;
    remote.type(text);
    setText('');
  };

  return (
    <View style={styles.typeBar}>
      <Ionicons color={theme.colors.remoteDim} name="keypad-outline" size={ms(18)} />
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={t('remote.type_placeholder')}
        placeholderTextColor={theme.colors.remoteDim}
        returnKeyType="send"
        style={[TextStyles.body, styles.typeInput]}
        submitBehavior="blurAndSubmit"
        value={text}
        onChangeText={setText}
        onSubmitEditing={send}
      />
      <Pressable
        accessibilityLabel={t('remote.delete')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => {
          tapFeedback();
          remote.press('del');
        }}
      >
        <Ionicons color={theme.colors.remoteDim} name="backspace-outline" size={ms(20)} />
      </Pressable>
    </View>
  );
}

export default function RemoteScreen(): React.JSX.Element {
  const t = useTranslate();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const status = useConnectionStore((s) => s.status);
  // The Android TV Remote service has no recent-apps key (see atvKey in the client).
  const atv = useConnectionStore((s) => s.protocol === 'atv');
  const pathname = usePathname();

  // Android TVs without MiLink need a one-time pairing code; ask for it when the client does.
  useEffect(() => {
    if (status === 'pairing' && pathname !== '/pair') router.push('/pair');
  }, [status, pathname]);

  // Connect to the saved TV, or ask the user to pick one on first launch.
  useEffect(() => {
    const { tvHost } = useSettingsStore.getState();
    if (tvHost) {
      remote.connect(tvHost);
    } else {
      router.push('/connect');
    }
  }, []);

  // Phones kill background sockets anyway; drop it cleanly and reconnect on return.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') remote.resume();
      else if (state === 'background') remote.suspend();
    });
    return () => subscription.remove();
  }, []);

  const dpad = Math.min(width * 0.68, ms(280));

  return (
    <View style={styles.screen}>
      <View style={styles.body}>
        <StatusHeader />

        <View style={styles.row}>
          <RemoteKey
            accessibilityLabel={t('remote.power')}
            icon="power"
            keyName="power"
            variant="power"
          />
          <RemoteKey accessibilityLabel={t('remote.input')} icon="tv-outline" keyName="tvInput" />
          <RemoteKey
            accessibilityLabel={t('remote.apps')}
            disabled={atv}
            icon="apps-outline"
            keyName="appSwitch"
          />
          <RemoteKey
            accessibilityLabel={t('remote.settings')}
            icon="settings-outline"
            keyName="settings"
          />
        </View>

        <View style={styles.center}>
          <DPad diameter={dpad} />
        </View>

        <View style={styles.navRow}>
          <RemoteKey accessibilityLabel={t('remote.back')} icon="arrow-undo" keyName="back" />
          <RemoteKey
            accessibilityLabel={t('remote.home')}
            icon="home"
            keyName="home"
            size={ms(60)}
          />
          <RemoteKey accessibilityLabel={t('remote.menu')} icon="menu" keyName="menu" />
        </View>

        <View style={styles.rockerRow}>
          <Rocker
            down={{
              keyName: 'volumeDown',
              icon: 'remove',
              accessibilityLabel: t('remote.volume_down'),
            }}
            label={t('remote.volume')}
            up={{ keyName: 'volumeUp', icon: 'add', accessibilityLabel: t('remote.volume_up') }}
          />
          <View style={styles.rockerMiddle}>
            <RemoteKey accessibilityLabel={t('remote.mute')} icon="volume-mute" keyName="mute" />
            <RemoteKey accessibilityLabel={t('remote.search')} icon="search" keyName="search" />
          </View>
          <Rocker
            down={{
              keyName: 'channelDown',
              icon: 'chevron-down',
              accessibilityLabel: t('remote.channel_down'),
            }}
            label={t('remote.channel')}
            up={{
              keyName: 'channelUp',
              icon: 'chevron-up',
              accessibilityLabel: t('remote.channel_up'),
            }}
          />
        </View>

        <View style={styles.row}>
          <RemoteKey
            accessibilityLabel={t('remote.previous')}
            icon="play-skip-back"
            keyName="previous"
            size={ms(44)}
          />
          <RemoteKey
            repeat
            accessibilityLabel={t('remote.rewind')}
            icon="play-back"
            keyName="rewind"
            size={ms(44)}
          />
          <RemoteKey
            accessibilityLabel={t('remote.play_pause')}
            icon="play"
            keyName="playPause"
            variant="accent"
          />
          <RemoteKey
            repeat
            accessibilityLabel={t('remote.fast_forward')}
            icon="play-forward"
            keyName="fastForward"
            size={ms(44)}
          />
          <RemoteKey
            accessibilityLabel={t('remote.next')}
            icon="play-skip-forward"
            keyName="next"
            size={ms(44)}
          />
        </View>

        {/* Rides above the keyboard so the text stays visible while typing. The bar sits
            insets.bottom + 8 (screen) + 16 (body) above the screen edge; keep an 8pt gap. */}
        <KeyboardStickyView offset={{ opened: insets.bottom + ms(16) }}>
          <TypeBar />
        </KeyboardStickyView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.remoteScreen,
    paddingTop: rt.insets.top + ms(8),
    paddingBottom: rt.insets.bottom + ms(8),
    paddingHorizontal: ms(12),
  },
  body: {
    flex: 1,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    borderRadius: ms(32),
    borderWidth: 1,
    borderColor: theme.colors.remoteBodyEdge,
    backgroundColor: theme.colors.remoteBody,
    paddingHorizontal: ms(20),
    paddingVertical: ms(16),
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
  },
  statusDot: {
    width: ms(9),
    height: ms(9),
    borderRadius: ms(5),
    shadowOpacity: 0.9,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: theme.colors.remoteLabel,
  },
  subtitle: {
    color: theme.colors.remoteDim,
  },
  headerButton: {
    width: ms(36),
    height: ms(36),
    borderRadius: ms(18),
    backgroundColor: theme.colors.remoteKey,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  center: {
    alignItems: 'center',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  rockerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: ms(8),
  },
  rockerMiddle: {
    gap: ms(14),
  },
  typeBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ms(10),
    paddingHorizontal: ms(14),
    height: ms(46),
    borderRadius: ms(14),
    backgroundColor: theme.colors.remoteKey,
  },
  typeInput: {
    flex: 1,
    color: theme.colors.remoteLabel,
    paddingVertical: 0,
  },
}));
