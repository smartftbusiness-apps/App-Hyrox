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

function orderFromSegmentId(segmentId: string): number | null {
  const match = segmentId.match(/-seg-(\d+)$/i) ?? segmentId.match(/^s(\d+)$/i);
  if (!match) return null;
  const order = Number(match[1]);
  return Number.isFinite(order) && order > 0 ? order : null;
}

function resolveSegment(
  st: SegmentTime,
  segments: Segment[],
  fallbackIndex: number,
): Segment | undefined {
  const byId = segments.find((s) => s.id === st.segmentId);
  if (byId) return byId;

  if (st.segmentOrder != null && st.segmentOrder > 0) {
    const byStoredOrder = segments.find((s) => s.order === st.segmentOrder);
    if (byStoredOrder) return byStoredOrder;
  }

  const parsedOrder = orderFromSegmentId(st.segmentId);
  if (parsedOrder != null) {
    const byOrder = segments.find((s) => s.order === parsedOrder);
    if (byOrder) return byOrder;
  }

  return segments[fallbackIndex];
}

export function buildSplits(
  segmentTimes: SegmentTime[] | undefined,
  segments: Segment[],
): LeaderboardSplit[] {
  if (!segmentTimes?.length) return [];

  const withDuration = segmentTimes.filter((st) => st.durationMs > 0);
  if (!withDuration.length) return [];

  return withDuration
    .map((st, idx) => {
      const seg = segments.length ? resolveSegment(st, segments, idx) : undefined;
      const segmentOrder =
        seg?.order ??
        st.segmentOrder ??
        orderFromSegmentId(st.segmentId) ??
        idx + 1;
      return {
        segmentId: st.segmentId || `split-${segmentOrder}`,
        segmentName: seg?.name ?? st.segmentName ?? `Segmento ${segmentOrder}`,
        segmentOrder,
        segmentType: seg?.type ?? st.segmentType ?? 'station',
        durationMs: st.durationMs,
      };
    })
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
