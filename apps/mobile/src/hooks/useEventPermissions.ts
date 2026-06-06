import type { HyroxEvent } from '@/src/domain/types';
import { useIsEventOwner } from '@/src/hooks/useEvent';
import { useIsJudgeMode } from '@/src/stores/accessModeStore';
import { useEventStaffStore } from '@/src/stores/eventStaffStore';

export type EventPermissions = {
  isOwner: boolean;
  isAssignedJudge: boolean;
  isJudgeMode: boolean;
  isFinished: boolean;
  /** Criar/editar/excluir estrutura do evento */
  canEditStructure: boolean;
  /** Cronômetro e tempos */
  canControlTiming: boolean;
  /** Designar juízes */
  canManageJudges: boolean;
  /** Excluir evento */
  canDeleteEvent: boolean;
  /** Somente leitura do evento */
  isReadOnly: boolean;
};

export function useEventPermissions(event: HyroxEvent | undefined): EventPermissions {
  const isOwner = useIsEventOwner(event);
  const isJudgeMode = useIsJudgeMode();
  const isAssignedJudge = useEventStaffStore((s) => s.isAssignedJudge(event?.id));
  const isFinished = event?.status === 'finished';

  const canEditStructure = !!event && isOwner && !isJudgeMode && !isFinished;
  const canControlTiming =
    !!event &&
    !isFinished &&
    event.status !== 'draft' &&
    (isOwner || isAssignedJudge);
  const canManageJudges = !!event && isOwner && !isJudgeMode && !isFinished;
  const canDeleteEvent = !!event && isOwner && !isJudgeMode;

  return {
    isOwner,
    isAssignedJudge,
    isJudgeMode,
    isFinished,
    canEditStructure,
    canControlTiming,
    canManageJudges,
    canDeleteEvent,
    isReadOnly: !canEditStructure,
  };
}
