/** Perfil global do usuário no app */
export type AppUserRole = 'organizer' | 'judge' | 'athlete';

export const APP_ROLE_LABELS: Record<AppUserRole, string> = {
  organizer: 'Organizador',
  judge: 'Juiz',
  athlete: 'Atleta',
};

export const APP_ROLE_DESCRIPTIONS: Record<AppUserRole, string> = {
  organizer:
    'Cria e exclui eventos, categorias, estações, baterias, atletas, duplas e cadastra juízes.',
  judge: 'Entra com e-mail e senha fornecidos pelo organizador. Controla o cronômetro na estação designada.',
  athlete: 'Vê apenas os eventos em que participou e consulta seus resultados.',
};

/** Perfis que podem se auto-cadastrar na tela de conta. Juízes são cadastrados pelo organizador. */
export const SELF_SIGNUP_ROLES: AppUserRole[] = ['organizer', 'athlete'];

/** Valor gravado em profiles.role no Supabase */
export function toSupabaseProfileRole(
  role: AppUserRole,
): 'organizer' | 'staff' | 'viewer' {
  if (role === 'judge') return 'staff';
  if (role === 'athlete') return 'viewer';
  return 'organizer';
}

export function fromSupabaseProfileRole(dbRole: string | undefined): AppUserRole | null {
  if (dbRole === 'staff') return 'judge';
  if (dbRole === 'viewer') return 'athlete';
  if (dbRole === 'organizer') return 'organizer';
  return null;
}
