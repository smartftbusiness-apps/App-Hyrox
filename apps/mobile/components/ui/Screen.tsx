import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native';
import { HyroxTheme } from '@/constants/Theme';

type ScreenProps = ViewProps & {
  scroll?: boolean;
  padded?: boolean;
};

export function Screen({ scroll, padded = true, style, children, ...props }: ScreenProps) {
  const content = (
    <View style={[padded && styles.padded, style]} {...props}>
      {children}
    </View>
  );

  if (scroll) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.scrollContent}>
        {content}
      </ScrollView>
    );
  }

  return <View style={[styles.screen, padded && styles.padded, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: HyroxTheme.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  padded: {
    padding: 16,
  },
});
