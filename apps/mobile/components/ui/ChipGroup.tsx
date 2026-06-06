import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HyroxTheme } from '@/constants/Theme';

type Option<T extends string> = { value: T; label: string };

type ChipGroupProps<T extends string> = {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

export function ChipGroup<T extends string>({ label, options, value, onChange }: ChipGroupProps<T>) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {options.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.chip, value === opt.value && styles.chipActive]}
            onPress={() => onChange(opt.value)}>
            <Text style={[styles.chipText, value === opt.value && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 16 },
  label: {
    color: HyroxTheme.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  chipActive: {
    backgroundColor: HyroxTheme.accent,
    borderColor: HyroxTheme.accent,
  },
  chipText: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: { color: '#000' },
});
