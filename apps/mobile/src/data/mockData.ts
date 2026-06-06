import type { Athlete, Category, DoublesPair, HyroxEvent, LeaderboardEntry } from '@/src/domain/types';
import { cloneHyroxSegments } from '@/src/domain/hyroxTemplate';

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-open-m', name: 'Open Masculino', division: 'Open', gender: 'M' },
  { id: 'cat-open-f', name: 'Open Feminino', division: 'Open', gender: 'F' },
  { id: 'cat-pro-m', name: 'Pro Masculino', division: 'Pro', gender: 'M' },
  { id: 'cat-doubles-m', name: 'Doubles', division: 'Doubles', gender: 'M' },
  { id: 'cat-doubles-f', name: 'Doubles', division: 'Doubles', gender: 'F' },
];

export const MOCK_EVENTS: HyroxEvent[] = [
  {
    id: 'evt-1',
    organizerId: 'legacy',
    name: 'Hyrox São Paulo 2026',
    date: '2026-08-15',
    location: 'Expo Center Norte',
    status: 'live',
    athleteCount: 48,
    categories: MOCK_CATEGORIES,
    segments: cloneHyroxSegments('evt-1'),
  },
  {
    id: 'evt-2',
    organizerId: 'legacy',
    name: 'Simulado Box CrossFit SP',
    date: '2026-07-20',
    location: 'CrossFit Vila Mariana',
    status: 'open',
    athleteCount: 24,
    categories: MOCK_CATEGORIES.slice(0, 2),
    segments: cloneHyroxSegments('evt-2'),
  },
];

export const MOCK_ATHLETES: Athlete[] = [
  { id: 'a1', eventId: 'evt-1', name: 'Carlos Silva', bib: 101, categoryId: 'cat-open-m', status: 'racing', totalMs: null },
  { id: 'a2', eventId: 'evt-1', name: 'Ana Costa', bib: 102, categoryId: 'cat-open-f', status: 'racing', totalMs: null },
  { id: 'a3', eventId: 'evt-1', name: 'Pedro Mendes', bib: 103, categoryId: 'cat-open-m', status: 'finished', totalMs: 3847120 },
  { id: 'a4', eventId: 'evt-1', name: 'Julia Santos', bib: 104, categoryId: 'cat-open-f', status: 'finished', totalMs: 4123050 },
  { id: 'a5', eventId: 'evt-1', name: 'Rafael Lima', bib: 105, categoryId: 'cat-pro-m', status: 'checked_in', totalMs: null },
  { id: 'a6', eventId: 'evt-1', name: 'Marina Oliveira', bib: 106, categoryId: 'cat-open-f', status: 'registered', totalMs: null },
  { id: 'a10', eventId: 'evt-1', name: 'Diego Rocha', bib: 201, categoryId: 'cat-doubles-m', pairId: 'pair-1', status: 'finished', totalMs: null },
  { id: 'a11', eventId: 'evt-1', name: 'Felipe Nunes', bib: 201, categoryId: 'cat-doubles-m', pairId: 'pair-1', status: 'finished', totalMs: null },
  { id: 'a12', eventId: 'evt-1', name: 'Camila Dias', bib: 0, categoryId: 'cat-doubles-f', pairId: null, status: 'registered', totalMs: null },
];

export const MOCK_PAIRS: DoublesPair[] = [
  {
    id: 'pair-1',
    eventId: 'evt-1',
    categoryId: 'cat-doubles-m',
    bib: 201,
    athlete1Id: 'a10',
    athlete2Id: 'a11',
    teamName: 'Team RX',
    status: 'finished',
    totalMs: 3650000,
  },
];

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, athleteId: 'a3', name: 'Pedro Mendes', bib: 103, categoryName: 'Open Masculino', totalMs: 3847120 },
  { rank: 2, athleteId: 'a7', name: 'Lucas Ferreira', bib: 107, categoryName: 'Open Masculino', totalMs: 3912040 },
  { rank: 3, athleteId: 'a8', name: 'Bruno Alves', bib: 108, categoryName: 'Open Masculino', totalMs: 3988500 },
  { rank: 1, athleteId: 'a4', name: 'Julia Santos', bib: 104, categoryName: 'Open Feminino', totalMs: 4123050 },
  { rank: 2, athleteId: 'a9', name: 'Fernanda Rocha', bib: 109, categoryName: 'Open Feminino', totalMs: 4210000 },
];

export function getCategoryName(categoryId: string): string {
  return MOCK_CATEGORIES.find((c) => c.id === categoryId)?.name ?? categoryId;
}

export function getAthletesByEvent(eventId: string): Athlete[] {
  return MOCK_ATHLETES.filter((a) => a.eventId === eventId);
}

export function getLeaderboardByCategory(categoryName: string): LeaderboardEntry[] {
  return MOCK_LEADERBOARD.filter((e) => e.categoryName === categoryName).sort((a, b) => a.rank - b.rank);
}
