import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, 720);
  const compact = contentWidth < 360;
  const medium = contentWidth < 480;

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
      <Text
        style={[styles.segmentName, compact && styles.segmentNameCompact]}
        numberOfLines={2}
        adjustsFontSizeToFit>
        {segmentName}
      </Text>
      <Text style={[styles.target, compact && styles.targetCompact]} numberOfLines={2}>
        {segmentTarget}
      </Text>
      <Text
        style={[styles.timer, medium && styles.timerMedium, compact && styles.timerCompact]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.45}>
        {formatMs(elapsedMs)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    width: '100%',
    maxWidth: '100%',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
    justifyContent: 'center',
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
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  segmentNameCompact: {
    fontSize: 20,
  },
  target: {
    color: HyroxTheme.textMuted,
    fontSize: 15,
    marginTop: 4,
    marginBottom: 16,
    textAlign: 'center',
  },
  targetCompact: {
    fontSize: 13,
    marginBottom: 12,
  },
  timer: {
    color: HyroxTheme.accent,
    fontSize: 52,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
    maxWidth: '100%',
    textAlign: 'center',
  },
  timerMedium: {
    fontSize: 44,
  },
  timerCompact: {
    fontSize: 36,
  },
});
