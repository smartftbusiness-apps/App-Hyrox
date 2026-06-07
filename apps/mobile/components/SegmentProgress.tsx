import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { HyroxTheme } from '@/constants/Theme';
import type { Segment } from '@/src/domain/types';

type SegmentProgressProps = {
  segments: Segment[];
  currentIndex: number;
  completedIndices: number[];
};

export function SegmentProgress({ segments, currentIndex, completedIndices }: SegmentProgressProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}>
      {segments.map((seg, idx) => {
        const isCurrent = idx === currentIndex;
        const isDone = completedIndices.includes(idx);
        return (
          <View
            key={seg.id}
            style={[
              styles.item,
              isCurrent && styles.current,
              isDone && styles.done,
            ]}>
            <Text style={styles.order}>{seg.order}</Text>
            <Text style={styles.name} numberOfLines={1}>
              {seg.name}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    marginBottom: 16,
    maxWidth: '100%',
  },
  scrollContent: {
    paddingRight: 8,
  },
  item: {
    width: 72,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: HyroxTheme.surfaceElevated,
    borderWidth: 1,
    borderColor: HyroxTheme.border,
    alignItems: 'center',
  },
  current: {
    borderColor: HyroxTheme.accent,
    backgroundColor: 'rgba(255, 237, 0, 0.1)',
  },
  done: {
    borderColor: HyroxTheme.success,
    opacity: 0.7,
  },
  order: {
    color: HyroxTheme.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  name: {
    color: HyroxTheme.text,
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
});
