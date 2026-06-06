import type { Category } from '@/src/domain/types';

export function isDoublesCategory(category: Category): boolean {
  return category.division === 'Doubles';
}

export function getDoublesCategories(categories: Category[]): Category[] {
  return categories.filter(isDoublesCategory);
}
