import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HyroxTheme } from '@/constants/Theme';

type ScreenProps = ViewProps & {
  scroll?: boolean;
  padded?: boolean;
};

const WEB_MAX_WIDTH = 720;

export function Screen({ scroll, padded = true, style, children, ...props }: ScreenProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';
  const contentWidth =
    isWeb && width > WEB_MAX_WIDTH + 32 ? WEB_MAX_WIDTH : undefined;

  const content = (
    <View
      style={[
        padded && styles.padded,
        { width: '100%', maxWidth: contentWidth ?? '100%', alignSelf: 'center' },
        style,
      ]}
      {...props}>
      {children}
    </View>
  );

  const scrollView = (
    <ScrollView
      style={[styles.screen, isWeb && styles.scrollWeb]}
      contentContainerStyle={[
        styles.scrollContent,
        isWeb && styles.scrollContentWeb,
        { paddingBottom: Math.max(32, insets.bottom + 24) },
      ]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag">
      {content}
    </ScrollView>
  );

  if (scroll) {
    if (isWeb) {
      return <View style={[styles.screen, styles.screenWeb]}>{scrollView}</View>;
    }

    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}>
        {scrollView}
      </KeyboardAvoidingView>
    );
  }

  return <View style={[styles.screen, isWeb && styles.screenWeb]}>{content}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: HyroxTheme.background,
  },
  screenWeb: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
    alignItems: 'stretch',
  },
  scrollWeb: {
    width: '100%',
    maxWidth: '100%',
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentWeb: {
    alignItems: 'center',
    width: '100%',
    maxWidth: '100%',
  },
  padded: {
    padding: 16,
    paddingBottom: 24,
  },
});
