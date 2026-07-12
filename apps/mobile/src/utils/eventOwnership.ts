import { isUuid } from '@/src/api/repositoryTypes';
import type { HyroxEvent } from '@/src/domain/types';

export function isLegacyLocalOrganizerId(id: string): boolean {
  return id.startsWith('org-') || id === 'legacy' || !isUuid(id);
}

/** Verdadeiro se o usuário/aparelho atual é dono do evento (conta Supabase ou id local legado). */
export function isEventOwnedByCurrentUser(
  event: Pick<HyroxEvent, 'organizerId'> | undefined,
  authUserId: string | undefined | null,
  localOrganizerId: string | null | undefined,
): boolean {
  if (!event) return false;

  const ownerId = authUserId ?? localOrganizerId;
  if (!ownerId) return false;
  if (event.organizerId === ownerId) return true;
  if (localOrganizerId && event.organizerId === localOrganizerId) return true;

  return !!authUserId && isLegacyLocalOrganizerId(event.organizerId);
}
