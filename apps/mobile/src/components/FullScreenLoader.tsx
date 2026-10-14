import React from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { translate } from '@/localization/utils';
import { TextStyles } from '@/theme';
import { ms } from '@/utils';

interface FullscreenLoaderProps {
  visible: boolean;
  size?: 'small' | 'large';
  color?: string;
}

const FullscreenLoader: React.FC<FullscreenLoaderProps> = ({
  visible = false,
  size = 'large',
  color,
}) => {
  const { theme } = useUnistyles();

  return (
    <Modal statusBarTranslucent transparent animationType="fade" visible={visible}>
      <View style={styles.modalBackground}>
        <View style={styles.activityIndicatorWrapper}>
          <ActivityIndicator color={color || theme.colors.primary} size={size} />
          <Text style={[TextStyles.label, styles.loadingText]}>{translate('common.loading')}</Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create((theme) => ({
  modalBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.opacity50,
  },
  activityIndicatorWrapper: {
    padding: ms(20),
    borderRadius: ms(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { color: theme.colors.white, marginTop: ms(10) },
}));

export default FullscreenLoader;
