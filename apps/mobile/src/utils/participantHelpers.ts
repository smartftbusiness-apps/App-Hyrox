import type { Athlete, AthleteStatus, Category, DoublesPair, EventHeat } from '@/src/domain/types';
import { isDoublesCategory } from '@/src/utils/categoryHelpers';
import { getCategoryNameForAthlete } from '@/src/utils/athleteHelpers';
import { getCategoryDisplayName } from '@/src/utils/categoryLabel';
import { getPairDisplayName, getPairMemberNames } from '@/src/utils/pairHelpers';
import { participantKey } from '@/src/utils/timingRun';

export type TimingParticipant = {
  id: string;
  type: 'athlete' | 'pair';
  bib: number;
  label: string;
  categoryId: string;
  categoryName: string;
  status: AthleteStatus;
  memberNames: string[];
  racingStartedAt?: string | null;
};

export type EventParticipantRow =
  | {
      kind: 'athlete';
      id: string;
      bib: number;
      name: string;
      categoryId: string;
      categoryName: string;
      status: AthleteStatus;
    }
  | {
      kind: 'pair';
      id: string;
      bib: number;
      label: string;
      memberNames: string[];
      categoryId: string;
      categoryName: string;
      status: AthleteStatus;
      teamName?: string;
    };

export function participantsForHeat(
  participants: TimingParticipant[],
  heat: EventHeat,
): TimingParticipant[] {
  const keys = heat.participantKeys ?? [];
  if (keys.length > 0) {
    const set = new Set(keys);
    return participants.filter((p) => set.has(participantKey(p)) && p.status !== 'finished');
  }
  return participants.filter((p) => {
    if (heat.categoryIds.length > 0 && !heat.categoryIds.includes(p.categoryId)) {
      return false;
    }
    if (heat.bibNumbers.length > 0 && !heat.bibNumbers.includes(p.bib)) {
      return false;
    }
    if (heat.categoryIds.length === 0 && heat.bibNumbers.length === 0) {
      return false;
    }
    return p.status !== 'finished';
  });
}

export function findHeatWithParticipant(
  heats: EventHeat[],
  participantKeyValue: string,
  excludeHeatId?: string,
): EventHeat | undefined {
  return heats.find(
    (h) =>
      h.id !== excludeHeatId &&
      (h.participantKeys ?? []).includes(participantKeyValue),
  );
}

export function assignedParticipantsForHeat(
  participants: TimingParticipant[],
  heat: EventHeat,
): TimingParticipant[] {
  const keys = heat.participantKeys ?? [];
  if (keys.length > 0) {
    const set = new Set(keys);
    return participants.filter((p) => set.has(participantKey(p)));
  }
  return participants.filter((p) => {
    if (heat.categoryIds.length > 0 && !heat.categoryIds.includes(p.categoryId)) return false;
    if (heat.bibNumbers.length > 0 && !heat.bibNumbers.includes(p.bib)) return false;
    if (heat.categoryIds.length === 0 && heat.bibNumbers.length === 0) return false;
    return true;
  });
}

export function buildTimingParticipants(
  athletes: Athlete[],
  pairs: DoublesPair[],
  categories: Category[],
): TimingParticipant[] {
  const singles = athletes
    .filter((a) => !a.pairId && a.status !== 'dns')
    .map((a) => ({
      id: a.id,
      type: 'athlete' as const,
      bib: a.bib,
      label: a.name,
      categoryId: a.categoryId,
      categoryName: getCategoryNameForAthlete(categories, a.categoryId),
      status: a.status,
      memberNames: [a.name],
      racingStartedAt: a.racingStartedAt,
    }));

  const pairRows = pairs
    .filter((p) => p.status !== 'dns')
    .map((p) => ({
      id: p.id,
      type: 'pair' as const,
      bib: p.bib,
      label: getPairDisplayName(p, athletes),
      categoryId: p.categoryId,
      categoryName: getCategoryNameForAthlete(categories, p.categoryId),
      status: p.status,
      memberNames: getPairMemberNames(p, athletes),
      racingStartedAt: p.racingStartedAt,
    }));

  return [...singles, ...pairRows].sort((a, b) => {
    if (a.bib !== b.bib) return (a.bib || 9999) - (b.bib || 9999);
    return a.label.localeCompare(b.label);
  });
}

export function groupEventParticipants(
  athletes: Athlete[],
  pairs: DoublesPair[],
  categories: Category[],
): { category: Category; participants: EventParticipantRow[] }[] {
  return categories.map((category) => {
    const participants: EventParticipantRow[] = [];

    if (isDoublesCategory(category)) {
      pairs
        .filter((p) => p.categoryId === category.id)
        .forEach((pair) => {
          participants.push({
            kind: 'pair',
            id: pair.id,
            bib: pair.bib,
            label: getPairDisplayName(pair, athletes),
            memberNames: getPairMemberNames(pair, athletes),
            categoryId: category.id,
            categoryName: getCategoryDisplayName(category),
            status: pair.status,
            teamName: pair.teamName,
          });
        });
      athletes
        .filter((a) => a.categoryId === category.id && !a.pairId)
        .forEach((a) => {
          participants.push({
            kind: 'athlete',
            id: a.id,
            bib: a.bib,
            name: a.name,
            categoryId: category.id,
            categoryName: getCategoryDisplayName(category),
            status: a.status,
          });
        });
    } else {
      athletes
        .filter((a) => a.categoryId === category.id && !a.pairId)
        .forEach((a) => {
          participants.push({
            kind: 'athlete',
            id: a.id,
            bib: a.bib,
            name: a.name,
            categoryId: category.id,
            categoryName: getCategoryDisplayName(category),
            status: a.status,
          });
        });
    }

    return { category, participants };
  }).filter((g) => g.participants.length > 0);
}
