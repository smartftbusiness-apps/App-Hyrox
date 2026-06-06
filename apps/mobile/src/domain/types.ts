export type EventStatus = 'draft' | 'open' | 'live' | 'finished';
export type AthleteStatus = 'registered' | 'checked_in' | 'racing' | 'finished' | 'dnf' | 'dns';
export type SegmentType = 'run' | 'station';

export interface Segment {
  id: string;
  order: number;
  type: SegmentType;
  name: string;
  target: string;
}

export type Division = 'Open' | 'Pro' | 'Doubles' | 'Relay';
export type Gender = 'M' | 'F' | 'Mixed';

export interface Category {
  id: string;
  name: string;
  division: Division;
  gender: Gender;
}

export interface HyroxEvent {
  id: string;
  /** UUID do registro em `events` no Supabase */
  supabaseId?: string | null;
  organizerId: string;
  name: string;
  date: string;
  location: string;
  status: EventStatus;
  athleteCount: number;
  categories: Category[];
  segments: Segment[];
}

export interface Athlete {
  id: string;
  eventId: string;
  name: string;
  bib: number;
  categoryId: string;
  pairId?: string | null;
  status: AthleteStatus;
  totalMs: number | null;
  segmentTimes?: SegmentTime[];
}

/** Dupla Hyrox — dois atletas, um bib, uma categoria Doubles */
export interface DoublesPair {
  id: string;
  eventId: string;
  categoryId: string;
  bib: number;
  athlete1Id: string;
  athlete2Id: string;
  teamName?: string;
  status: AthleteStatus;
  totalMs: number | null;
  segmentTimes?: SegmentTime[];
}

export interface LeaderboardEntry {
  rank: number;
  athleteId: string;
  name: string;
  bib: number;
  categoryName: string;
  totalMs: number;
  currentSegment?: number;
}

export interface SegmentTime {
  segmentId: string;
  durationMs: number;
}
