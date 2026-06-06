/** Perfil de uso do app — segmentação para testes e produção */
export type AppUserRole = 'organizer' | 'viewer';

export const APP_ROLE_LABELS: Record<AppUserRole, string> = {
  organizer: 'Organizador',
  viewer: 'Visitante',
};

export const APP_ROLE_DESCRIPTIONS: Record<AppUserRole, string> = {
  organizer: 'Cria e gerencia eventos. Funciona no celular mesmo sem nuvem.',
  viewer: 'Vê eventos ao vivo e ranking pela internet (somente leitura).',
};
