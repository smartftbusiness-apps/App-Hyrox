export type RepositoryResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; reason: string };

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function resolveDbId(entity: { supabaseId?: string | null; id: string }): string | null {
  if (entity.supabaseId && isUuid(entity.supabaseId)) return entity.supabaseId;
  if (isUuid(entity.id)) return entity.id;
  return null;
}

export function localIdFromDb(prefix: string, dbId: string): string {
  return `${prefix}-db-${dbId}`;
}

export function dbIdFromLocalId(localId: string): string | null {
  const match = localId.match(/-db-([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}
