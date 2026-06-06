import type { Athlete, Category, DoublesPair } from '@/src/domain/types';
import { isDoublesCategory } from '@/src/utils/categoryHelpers';

export function getPairDisplayName(
  pair: DoublesPair,
  athletes: Athlete[],
): string {
  if (pair.teamName?.trim()) return pair.teamName.trim();
  const names = getPairMemberNames(pair, athletes);
  if (names.length === 2) return `${names[0]} / ${names[1]}`;
  return 'Dupla';
}

export function getPairMemberNames(pair: DoublesPair, athletes: Athlete[]): string[] {
  const a1 = athletes.find((a) => a.id === pair.athlete1Id);
  const a2 = athletes.find((a) => a.id === pair.athlete2Id);
  return [a1?.name, a2?.name].filter((n): n is string => Boolean(n));
}

export function getUnpairedAthletes(
  athletes: Athlete[],
  categoryId: string,
): Athlete[] {
  return athletes.filter((a) => a.categoryId === categoryId && !a.pairId);
}

export function groupPairsByDoublesCategory(
  pairs: DoublesPair[],
  athletes: Athlete[],
  categories: Category[],
): { category: Category; pairs: { pair: DoublesPair; label: string }[] }[] {
  return categories
    .filter(isDoublesCategory)
    .map((category) => ({
      category,
      pairs: pairs
        .filter((p) => p.categoryId === category.id)
        .map((pair) => ({
          pair,
          label: getPairDisplayName(pair, athletes),
        })),
    }))
    .filter((g) => g.pairs.length > 0);
}
