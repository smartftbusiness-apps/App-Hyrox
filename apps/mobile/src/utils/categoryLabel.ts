import type { Category, Division, Gender } from '@/src/domain/types';

const GENDER_LABELS: Record<Gender, string> = {
  M: 'Masculino',
  F: 'Feminino',
  Mixed: 'Misto',
};

export function buildCategoryName(division: Division, gender: Gender): string {
  if (division === 'Doubles') return 'Doubles';
  return `${division} ${GENDER_LABELS[gender]}`;
}

/** Nome para exibição — normaliza categorias Doubles já salvas com nome antigo */
export function getCategoryDisplayName(category: Category): string {
  if (category.division === 'Doubles') return 'Doubles';
  return category.name;
}

export function genderLabel(gender: Gender): string {
  return GENDER_LABELS[gender];
}
