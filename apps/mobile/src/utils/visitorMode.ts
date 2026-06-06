import { pullAndMergePublicEvents } from '@/src/api/syncService';
import { useAccessModeStore } from '@/src/stores/accessModeStore';

export type VisitorEnterResult =
  | { ok: true; eventCount: number }
  | { ok: false; reason: string };

export async function enterVisitorModeWithoutAccount(): Promise<VisitorEnterResult> {
  useAccessModeStore.getState().setAppRole('viewer');
  const sync = await pullAndMergePublicEvents();
  if (!sync.ok) return sync;
  return { ok: true, eventCount: sync.eventCount };
}
