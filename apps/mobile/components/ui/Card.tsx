import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { HyroxTheme } from '@/constants/Theme';

type CardProps = Omit<PressableProps, 'style' | 'children'> & {
  title?: string;
  subtitle?: string;
  badge?: string;
  badgeColor?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Card({ title, subtitle, badge, badgeColor, children, style, ...props }: CardProps) {
  return (
    <Pressable style={({ pressed }) => [styles.card, pressed && styles.pressed, style] as StyleProp<ViewStyle>} {...props}>
      {(title || badge) && (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {title && <Text style={styles.title}>{title}</Text>}
            {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          </View>
          {badge && (
            <View style={[styles.badge, { backgroundColor: badgeColor ?? HyroxTheme.surfaceElevated }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </View>
      )}
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: HyroxTheme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    padding: 16,
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.85,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  title: {
    color: HyroxTheme.text,
    fontSize: 17,
    fontWeight: '700',
  },
  subtitle: {
    color: HyroxTheme.textMuted,
    fontSize: 14,
    marginTop: 4,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    color: HyroxTheme.accent,
    fontSize: 12,
    fontWeight: '600',
  },
});
