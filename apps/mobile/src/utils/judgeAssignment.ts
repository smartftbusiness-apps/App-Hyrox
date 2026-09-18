import { localIdFromDb } from '@/src/api/repositoryTypes';
import type { HyroxEvent } from '@/src/domain/types';

/** Evento designado ao juiz (id local, supabaseId ou chave de estação). */
export function isJudgeAssignedToEvent(
  event: Pick<HyroxEvent, 'id' | 'supabaseId'>,
  assignedEventIds: string[],
  judgeStationByEvent: Record<string, number | null> = {},
): boolean {
  if (assignedEventIds.includes(event.id)) return true;
  if (event.supabaseId) {
    if (assignedEventIds.includes(event.supabaseId)) return true;
    if (assignedEventIds.includes(localIdFromDb('evt', event.supabaseId))) return true;
    if (Object.prototype.hasOwnProperty.call(judgeStationByEvent, event.supabaseId)) return true;
  }
  return (
    Object.prototype.hasOwnProperty.call(judgeStationByEvent, event.id) ||
    (!!event.supabaseId &&
      Object.prototype.hasOwnProperty.call(
        judgeStationByEvent,
        localIdFromDb('evt', event.supabaseId),
      ))
  );
}
