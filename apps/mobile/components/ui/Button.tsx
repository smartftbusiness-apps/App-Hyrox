import { Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { HyroxTheme } from '@/constants/Theme';

type Variant = 'primary' | 'secondary' | 'danger';

type ButtonProps = Omit<PressableProps, 'style'> & {
  label: string;
  variant?: Variant;
  large?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, variant = 'primary', large, style, disabled, ...props }: ButtonProps) {
  return (
    <Pressable
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        large && styles.large,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        style,
      ] as StyleProp<ViewStyle>}
      {...props}>
      <Text
        style={[
          styles.label,
          large && styles.labelLarge,
          variant === 'primary' && styles.labelPrimary,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  large: {
    paddingVertical: 18,
    borderRadius: 14,
  },
  primary: {
    backgroundColor: HyroxTheme.accent,
  },
  secondary: {
    backgroundColor: HyroxTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  danger: {
    backgroundColor: HyroxTheme.danger,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: HyroxTheme.text,
  },
  labelLarge: {
    fontSize: 18,
  },
  labelPrimary: {
    color: '#000',
  },
});
