import type { Category, Division, Gender } from '@/src/domain/types';
import { buildCategoryName } from '@/src/utils/categoryLabel';

export type CategoryPreset = {
  key: string;
  division: Division;
  gender: Gender;
  label: string;
};

export const EVENT_CATEGORY_PRESETS: CategoryPreset[] = [
  { key: 'open-m', division: 'Open', gender: 'M', label: 'Open Masculino' },
  { key: 'open-f', division: 'Open', gender: 'F', label: 'Open Feminino' },
  { key: 'pro-m', division: 'Pro', gender: 'M', label: 'Pro Masculino' },
  { key: 'pro-f', division: 'Pro', gender: 'F', label: 'Pro Feminino' },
  { key: 'doubles-m', division: 'Doubles', gender: 'M', label: 'Doubles · Masculino' },
  { key: 'doubles-f', division: 'Doubles', gender: 'F', label: 'Doubles · Feminino' },
  { key: 'doubles-mixed', division: 'Doubles', gender: 'Mixed', label: 'Doubles · Mista' },
];

/** Categorias padrão ao criar evento (inclui duplas) */
export const DEFAULT_EVENT_PRESET_KEYS = ['open-m', 'open-f', 'doubles-m', 'doubles-f'];

export function buildCategoriesForEvent(
  eventId: string,
  presets: CategoryPreset[],
): Category[] {
  return presets.map((preset) => ({
    id: `${eventId}-${preset.key}`,
    name: buildCategoryName(preset.division, preset.gender),
    division: preset.division,
    gender: preset.gender,
  }));
}

export function presetsFromKeys(keys: string[]): CategoryPreset[] {
  return EVENT_CATEGORY_PRESETS.filter((p) => keys.includes(p.key));
}
