import type { HyroxEvent } from '@/src/domain/types';

function isDbMappedId(id: string): boolean {
  return /-db-[0-9a-f-]{36}$/i.test(id);
}

function preferLocalEvent(a: HyroxEvent, b: HyroxEvent): HyroxEvent {
  const aIsDbId = isDbMappedId(a.id);
  const bIsDbId = isDbMappedId(b.id);
  const primary = !aIsDbId && bIsDbId ? a : !bIsDbId && aIsDbId ? b : a;
  const secondary = primary === a ? b : a;

  return {
    ...secondary,
    ...primary,
    id: primary.id,
    supabaseId: primary.supabaseId ?? secondary.supabaseId ?? null,
    segments: primary.segments?.length ? primary.segments : secondary.segments,
    heats: (primary.heats?.length ? primary.heats : secondary.heats) ?? [],
    categories: primary.categories?.length ? primary.categories : secondary.categories,
  };
}

/** Remove eventos duplicados (mesmo id ou mesmo supabaseId) após merges de sync */
export function dedupeEvents(events: HyroxEvent[]): HyroxEvent[] {
  const byId = new Map<string, HyroxEvent>();

  for (const event of events) {
    const duplicateById = byId.get(event.id);
    if (duplicateById) {
      byId.set(event.id, preferLocalEvent(duplicateById, event));
      continue;
    }

    const duplicateBySupabase = event.supabaseId
      ? [...byId.values()].find((e) => e.supabaseId === event.supabaseId)
      : undefined;

    if (duplicateBySupabase) {
      const merged = preferLocalEvent(duplicateBySupabase, event);
      byId.delete(duplicateBySupabase.id);
      byId.set(merged.id, merged);
      continue;
    }

    byId.set(event.id, event);
  }

  return [...byId.values()];
}
