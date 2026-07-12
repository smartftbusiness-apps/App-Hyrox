import type { HyroxEvent } from '@/src/domain/types';

import { useIsEventOwner } from '@/src/hooks/useEvent';

import { useIsAthleteMode, useIsJudgeMode } from '@/src/stores/accessModeStore';

import { useAuthStore } from '@/src/stores/authStore';
import { useEventStaffStore } from '@/src/stores/eventStaffStore';
import { isSupabaseConfigured } from '@/src/lib/supabase';



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
  const isAthleteMode = useIsAthleteMode();
  const isAuthenticated = useAuthStore((s) => !!s.user);
  const cloudReady = !isSupabaseConfigured() || isAuthenticated;

  const isAssignedJudge = useEventStaffStore((s) => s.isAssignedJudge(event?.id));

  const isFinished = event?.status === 'finished';



  const canEditStructure = !!event && isOwner && !isJudgeMode && !isAthleteMode && !isFinished;
  const canControlTiming =
    !!event &&
    !isFinished &&
    !isAthleteMode &&
    event.status !== 'draft' &&
    (isOwner || isAssignedJudge);
  const canManageJudges =
    !!event && isOwner && cloudReady && !isJudgeMode && !isAthleteMode && !isFinished;
  const canDeleteEvent = !!event && isOwner && !isJudgeMode && !isAthleteMode;



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


