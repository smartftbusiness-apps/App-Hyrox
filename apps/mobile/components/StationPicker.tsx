import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HyroxTheme } from '@/constants/Theme';
import type { Segment } from '@/src/domain/types';
import { stationLabel, stationSegmentOptions } from '@/src/utils/stationTiming';

type StationPickerProps = {
  segments: Segment[];
  value: number | null;
  onChange: (order: number) => void;
  label?: string;
};

export function StationPicker({ segments, value, onChange, label }: StationPickerProps) {
  const [open, setOpen] = useState(false);
  const options = stationSegmentOptions(segments);
  const selectedText =
    value != null ? stationLabel(segments, value) : 'Selecionar estação';

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button">
        <Text style={styles.triggerText} numberOfLines={2}>
          {selectedText}
        </Text>
        <Text style={styles.chevron}>▼</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Estação</Text>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {options.map((seg) => (
                <Pressable
                  key={seg.id}
                  style={[
                    styles.option,
                    value === seg.order && styles.optionActive,
                  ]}
                  onPress={() => {
                    onChange(seg.order);
                    setOpen(false);
                  }}>
                  <Text
                    style={[
                      styles.optionText,
                      value === seg.order && styles.optionTextActive,
                    ]}>
                    {stationLabel(segments, seg.order)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.cancelBtn} onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { color: HyroxTheme.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: HyroxTheme.surface,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
  },
  triggerPressed: { opacity: 0.85 },
  triggerText: { flex: 1, color: HyroxTheme.text, fontSize: 14, fontWeight: '600' },
  chevron: { color: HyroxTheme.textMuted, fontSize: 12 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    backgroundColor: HyroxTheme.surfaceElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    maxHeight: '70%',
    overflow: 'hidden',
  },
  sheetTitle: {
    color: HyroxTheme.text,
    fontSize: 16,
    fontWeight: '800',
    padding: 16,
    paddingBottom: 8,
  },
  list: { maxHeight: 320 },
  option: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: HyroxTheme.border,
  },
  optionActive: { backgroundColor: 'rgba(255, 237, 0, 0.12)' },
  optionText: { color: HyroxTheme.text, fontSize: 14 },
  optionTextActive: { color: HyroxTheme.accent, fontWeight: '700' },
  cancelBtn: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: HyroxTheme.border,
  },
  cancelText: { color: HyroxTheme.textMuted, fontSize: 14, fontWeight: '600' },
});
