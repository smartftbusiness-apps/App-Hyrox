/** Perfil global do usuário no app */
export type AppUserRole = 'organizer' | 'judge';

export const APP_ROLE_LABELS: Record<AppUserRole, string> = {
  organizer: 'Organizador',
  judge: 'Juiz',
};

export const APP_ROLE_DESCRIPTIONS: Record<AppUserRole, string> = {
  organizer:
    'Cria e exclui eventos, categorias, estações, baterias, atletas, duplas e designa juízes.',
  judge: 'Visualiza o evento (somente leitura) e controla o cronômetro na prova.',
};

/** Valor gravado em profiles.role no Supabase */
export function toSupabaseProfileRole(role: AppUserRole): 'organizer' | 'staff' {
  return role === 'judge' ? 'staff' : 'organizer';
}

export function fromSupabaseProfileRole(dbRole: string | undefined): AppUserRole | null {
  if (dbRole === 'staff') return 'judge';
  if (dbRole === 'organizer') return 'organizer';
  return null;
}
