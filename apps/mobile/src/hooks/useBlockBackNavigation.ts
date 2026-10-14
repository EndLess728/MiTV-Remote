import { useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from 'expo-router';

interface Options {
  /** Title shown in the confirm dialog. Defaults to "Discard changes?". */
  title?: string;
  /** Body of the confirm dialog. Defaults to a generic warning. */
  message?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Confirm/leave button label. Defaults to "Leave". */
  confirmLabel?: string;
}

/**
 * Blocks back navigation (Android hardware back, iOS swipe-back, and any
 * programmatic `navigation.goBack()`) when `shouldBlock` is true, prompting
 * the user to confirm before leaving. On confirm, the originally-attempted
 * navigation action is dispatched so the user ends up where they wanted.
 *
 * Common use case: a form with unsaved changes.
 *
 * @example
 * const dirty = useFormState();
 * useBlockBackNavigation(dirty, {
 *   title: 'Unsaved changes',
 *   message: 'Your edits will be lost.',
 * });
 */
export function useBlockBackNavigation(shouldBlock: boolean, options: Options = {}): void {
  const {
    title = 'Discard changes?',
    message = 'You have unsaved changes. Are you sure you want to leave?',
    cancelLabel = 'Cancel',
    confirmLabel = 'Leave',
  } = options;

  const navigation = useNavigation();

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!shouldBlock) {
        return;
      }

      // Prevent default behavior of leaving the screen
      e.preventDefault();

      Alert.alert(title, message, [
        { text: cancelLabel, style: 'cancel', isPreferred: true },
        {
          text: confirmLabel,
          style: 'destructive',
          onPress: () => navigation.dispatch(e.data.action),
        },
      ]);
    });

    return unsubscribe;
  }, [navigation, shouldBlock, title, message, cancelLabel, confirmLabel]);
}
