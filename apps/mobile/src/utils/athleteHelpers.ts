import type { Athlete, Category } from '@/src/domain/types';
import { isDoublesCategory } from '@/src/utils/categoryHelpers';
import { getCategoryDisplayName } from '@/src/utils/categoryLabel';

export function getCategoryNameForAthlete(
  categories: Category[],
  categoryId: string,
): string {
  const category = categories.find((c) => c.id === categoryId);
  return category ? getCategoryDisplayName(category) : 'Sem categoria';
}

/** Singles/Open/Pro — exclui atletas já em dupla nas categorias Doubles */
export function groupAthletesByCategory(
  athletes: Athlete[],
  categories: Category[],
): { category: Category; athletes: Athlete[] }[] {
  return categories
    .filter((c) => !isDoublesCategory(c))
    .map((category) => ({
      category,
      athletes: athletes.filter((a) => a.categoryId === category.id && !a.pairId),
    }))
    .filter((group) => group.athletes.length > 0);
}
