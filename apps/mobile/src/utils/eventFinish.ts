import type { Athlete, DoublesPair } from '@/src/domain/types';

export type FinishReadiness = {
  totalParticipants: number;
  finishedCount: number;
  pendingCount: number;
  allFinished: boolean;
};

function isCountableParticipant(athlete: Athlete): boolean {
  if (athlete.pairId) return false;
  // Atleta só cadastrado aguardando formar dupla — não bloqueia encerramento
  if (athlete.bib === 0 && athlete.status === 'registered') return false;
  return true;
}

/** Participantes ativos = atletas individuais + duplas (membros de dupla não contam à parte). */
export function getEventFinishReadiness(
  athletes: Athlete[],
  pairs: DoublesPair[],
): FinishReadiness {
  const singles = athletes.filter(isCountableParticipant);
  const statuses = [
    ...singles.map((a) => a.status),
    ...pairs.map((p) => p.status),
  ];
  const totalParticipants = statuses.length;
  const finishedCount = statuses.filter((s) => s === 'finished').length;
  const pendingCount = totalParticipants - finishedCount;

  return {
    totalParticipants,
    finishedCount,
    pendingCount,
    allFinished: totalParticipants > 0 && pendingCount === 0,
  };
}

export function getFinishEventBlockReason(readiness: FinishReadiness): string | null {
  if (readiness.totalParticipants === 0) {
    return null;
  }
  if (!readiness.allFinished) {
    return `Marque todos os participantes como Finalizado no cronômetro (${readiness.finishedCount}/${readiness.totalParticipants} prontos, ${readiness.pendingCount} pendente(s))`;
  }
  return null;
}
