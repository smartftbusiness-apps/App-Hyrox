import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { HyroxTheme } from '@/constants/Theme';

type InputProps = TextInputProps & {
  label: string;
  error?: string;
};

export function Input({ label, error, style, secureTextEntry, ...props }: InputProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const isPasswordField = secureTextEntry === true;

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[
            styles.input,
            isPasswordField && styles.inputWithToggle,
            error && styles.inputError,
            style,
          ]}
          placeholderTextColor={HyroxTheme.textMuted}
          secureTextEntry={isPasswordField && !passwordVisible}
          {...props}
        />
        {isPasswordField ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={styles.toggleBtn}
            hitSlop={8}>
            <Text style={styles.toggleText}>{passwordVisible ? 'Ocultar' : 'Ver'}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    color: HyroxTheme.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
  },
  inputRow: {
    position: 'relative',
  },
  input: {
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: HyroxTheme.text,
    fontSize: 16,
  },
  inputWithToggle: {
    paddingRight: 76,
  },
  toggleBtn: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  toggleText: {
    color: HyroxTheme.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  inputError: {
    borderColor: HyroxTheme.danger,
  },
  error: {
    color: HyroxTheme.danger,
    fontSize: 12,
    marginTop: 4,
  },
});
