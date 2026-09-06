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
  /** UUID em `categories` no Supabase */
  supabaseId?: string | null;
  name: string;
  division: Division;
  gender: Gender;
}

/** Bateria de largada — o start da bateria dispara o cronômetro dos participantes */
export interface EventHeat {
  id: string;
  name: string;
  /** Horário planejado (ISO) */
  scheduledStartAt: string;
  /** Quando o juiz iniciou a bateria / cronômetro */
  startedAt?: string | null;
  /** Categorias incluídas (vazio = todas) */
  categoryIds: string[];
  /** Bibs específicos (espelho dos participantes vinculados) */
  bibNumbers: number[];
  /** Chaves "athlete:id" ou "pair:id" dos participantes vinculados */
  participantKeys: string[];
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
  heats?: EventHeat[];
  /** ISO — start da bateria na nuvem (cronômetro total compartilhado) */
  raceStartedAt?: string | null;
}

export interface Athlete {
  id: string;
  /** UUID em `athletes` no Supabase */
  supabaseId?: string | null;
  eventId: string;
  name: string;
  bib: number;
  categoryId: string;
  pairId?: string | null;
  status: AthleteStatus;
  /** ISO — início da prova ao vivo (athlete_runs in_progress na nuvem) */
  racingStartedAt?: string | null;
  totalMs: number | null;
  segmentTimes?: SegmentTime[];
}

/** Dupla Hyrox — dois atletas, um bib, uma categoria Doubles */
export interface DoublesPair {
  id: string;
  /** UUID em `doubles_pairs` no Supabase */
  supabaseId?: string | null;
  eventId: string;
  categoryId: string;
  bib: number;
  athlete1Id: string;
  athlete2Id: string;
  teamName?: string;
  status: AthleteStatus;
  /** ISO — início da prova ao vivo (pair_runs in_progress na nuvem) */
  racingStartedAt?: string | null;
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
