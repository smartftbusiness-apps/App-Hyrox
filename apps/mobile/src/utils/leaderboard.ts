import type { Athlete, DoublesPair, Segment, SegmentTime } from '@/src/domain/types';
import { getPairDisplayName } from '@/src/utils/pairHelpers';

export type LeaderboardSplit = {
  segmentId: string;
  segmentName: string;
  segmentOrder: number;
  segmentType: 'run' | 'station';
  durationMs: number;
};

export type LeaderboardRow = {
  rank: number;
  athleteId: string;
  name: string;
  bib: number;
  categoryName: string;
  totalMs: number;
  isPair?: boolean;
  splits: LeaderboardSplit[];
};

export function buildSplits(
  segmentTimes: SegmentTime[] | undefined,
  segments: Segment[],
): LeaderboardSplit[] {
  if (!segmentTimes?.length || !segments.length) return [];
  const byId = new Map(segments.map((s) => [s.id, s]));
  return segmentTimes
    .map((st) => {
      const seg = byId.get(st.segmentId);
      return {
        segmentId: st.segmentId,
        segmentName: seg?.name ?? 'Segmento',
        segmentOrder: seg?.order ?? 0,
        segmentType: seg?.type ?? 'station',
        durationMs: st.durationMs,
      };
    })
    .filter((s) => s.durationMs > 0)
    .sort((a, b) => a.segmentOrder - b.segmentOrder);
}

/** Ranking singles por categoria */
export function buildLeaderboardForCategory(
  athletes: Athlete[],
  categoryId: string,
  categoryName: string,
  segments: Segment[] = [],
): LeaderboardRow[] {
  return athletes
    .filter(
      (a) =>
        a.categoryId === categoryId &&
        !a.pairId &&
        a.totalMs != null &&
        (a.status === 'finished' || a.totalMs > 0),
    )
    .sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))
    .map((a, idx) => ({
      rank: idx + 1,
      athleteId: a.id,
      name: a.name,
      bib: a.bib,
      categoryName,
      totalMs: a.totalMs!,
      splits: buildSplits(a.segmentTimes, segments),
    }));
}

/** Ranking duplas por categoria Doubles */
export function buildLeaderboardForDoubles(
  pairs: DoublesPair[],
  athletes: Athlete[],
  categoryId: string,
  categoryName: string,
  segments: Segment[] = [],
): LeaderboardRow[] {
  return pairs
    .filter(
      (p) =>
        p.categoryId === categoryId &&
        p.totalMs != null &&
        (p.status === 'finished' || p.totalMs > 0),
    )
    .sort((a, b) => (a.totalMs ?? Infinity) - (b.totalMs ?? Infinity))
    .map((p, idx) => ({
      rank: idx + 1,
      athleteId: p.id,
      name: getPairDisplayName(p, athletes),
      bib: p.bib,
      categoryName,
      totalMs: p.totalMs!,
      isPair: true,
      splits: buildSplits(p.segmentTimes, segments),
    }));
}
