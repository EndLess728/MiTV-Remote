import React, { forwardRef, useEffect } from 'react';
import {
  Image,
  type ImageSourcePropType,
  type ImageStyle,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { TextStyles } from '@/theme';
import { ms } from '@/utils';

interface TextFieldProps extends TextInputProps {
  placeholder?: string;
  containerStyle?: ViewStyle;
  endIcon?: ImageSourcePropType;
  icon?: ImageSourcePropType;
  endIconStyle?: ImageStyle;
  /** When true, border turns danger-red and stays red regardless of focus state */
  hasError?: boolean;
}

const TextField = forwardRef<TextInput, TextFieldProps>(
  (
    {
      placeholder = '',
      containerStyle = {},
      endIcon,
      icon,
      endIconStyle,
      hasError = false,
      style,
      onFocus,
      onBlur,
      ...rest
    },
    ref,
  ) => {
    const { theme } = useUnistyles();
    const borderColor = useSharedValue<string>(
      hasError ? theme.colors.danger : theme.colors.borderGray,
    );

    // React to error state changes
    useEffect(() => {
      borderColor.value = withTiming(hasError ? theme.colors.danger : theme.colors.borderGray);
    }, [hasError, borderColor, theme.colors.danger, theme.colors.borderGray]);

    const animatedBorderStyle = useAnimatedStyle(() => ({
      borderColor: borderColor.value,
    }));

    return (
      <Animated.View style={[styles.container, containerStyle, animatedBorderStyle]}>
        {icon && <Image source={icon} style={styles.leftImageStyle} />}
        <TextInput
          ref={ref}
          autoComplete="off"
          autoCorrect={false}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textGray}
          style={[
            {
              color: theme.colors.typography,
              flex: 1,
              height: ms(40),
            },
            TextStyles.bodySmallSemiBold,
            style,
          ]}
          underlineColorAndroid="transparent"
          onBlur={(e) => {
            borderColor.value = withTiming(
              hasError ? theme.colors.danger : theme.colors.borderGray,
            );
            onBlur?.(e);
          }}
          onFocus={(e) => {
            borderColor.value = withTiming(hasError ? theme.colors.danger : theme.colors.primary);
            onFocus?.(e);
          }}
          {...rest}
        />
        {endIcon && (
          <View>
            <Image source={endIcon} style={[styles.eyeIcon, endIconStyle]} />
          </View>
        )}
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create((theme) => ({
  leftImageStyle: {
    width: ms(20),
    height: ms(20),
    marginRight: ms(10),
    resizeMode: 'contain',
  },
  container: {
    padding: ms(12),
    borderWidth: ms(1),
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: ms(10),
    borderRadius: ms(10),
    borderColor: theme.colors.borderGray,
    backgroundColor: theme.colors.fadedWhite,
    height: ms(50),
  },
  eyeIcon: {
    width: ms(25),
    height: ms(25),
    resizeMode: 'contain',
    tintColor: theme.colors.typography,
  },
}));

export default TextField;
