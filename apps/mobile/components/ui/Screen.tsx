import {
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type ViewProps,
} from 'react-native';
import { HyroxTheme } from '@/constants/Theme';

type ScreenProps = ViewProps & {
  scroll?: boolean;
  padded?: boolean;
};

const WEB_MAX_WIDTH = 720;

export function Screen({ scroll, padded = true, style, children, ...props }: ScreenProps) {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const contentWidth =
    isWeb && width > WEB_MAX_WIDTH + 32 ? WEB_MAX_WIDTH : undefined;

  const content = (
    <View
      style={[
        padded && styles.padded,
        contentWidth != null && { width: contentWidth, maxWidth: '100%', alignSelf: 'center' },
        style,
      ]}
      {...props}>
      {children}
    </View>
  );

  if (scroll) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.scrollContent, isWeb && styles.scrollContentWeb]}>
        {content}
      </ScrollView>
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
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentWeb: {
    alignItems: 'center',
    width: '100%',
  },
  padded: {
    padding: 16,
    paddingBottom: 24,
  },
});
