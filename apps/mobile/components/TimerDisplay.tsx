import { StyleSheet, Text, View } from 'react-native';
import { HyroxTheme } from '@/constants/Theme';
import { formatMs } from '@/src/utils/formatTime';

type TimerDisplayProps = {
  elapsedMs: number;
  segmentName: string;
  segmentTarget: string;
  segmentType: 'run' | 'station';
  segmentIndex: number;
  totalSegments: number;
};

export function TimerDisplay({
  elapsedMs,
  segmentName,
  segmentTarget,
  segmentType,
  segmentIndex,
  totalSegments,
}: TimerDisplayProps) {
  return (
    <View style={styles.container}>
      <View style={styles.meta}>
        <View style={[styles.typeBadge, segmentType === 'run' ? styles.runBadge : styles.stationBadge]}>
          <Text style={styles.typeText}>{segmentType === 'run' ? 'CORRIDA' : 'ESTAÇÃO'}</Text>
        </View>
        <Text style={styles.progress}>
          Segmento {segmentIndex}/{totalSegments}
        </Text>
      </View>
      <Text style={styles.segmentName}>{segmentName}</Text>
      <Text style={styles.target}>{segmentTarget}</Text>
      <Text style={styles.timer}>{formatMs(elapsedMs)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  runBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  stationBadge: {
    backgroundColor: 'rgba(249, 115, 22, 0.2)',
  },
  typeText: {
    fontSize: 11,
    fontWeight: '800',
    color: HyroxTheme.text,
    letterSpacing: 1,
  },
  progress: {
    color: HyroxTheme.textMuted,
    fontSize: 13,
  },
  segmentName: {
    color: HyroxTheme.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  target: {
    color: HyroxTheme.textMuted,
    fontSize: 16,
    marginTop: 4,
    marginBottom: 20,
  },
  timer: {
    color: HyroxTheme.accent,
    fontSize: 56,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
});
