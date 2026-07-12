import type { Segment } from '@/src/domain/types';

import type { LiveRunSnapshot, TimingRunState } from '@/src/utils/timingRun';

import { isSegmentRunning } from '@/src/utils/timingRun';



export function getCurrentSegmentOrder(

  run: TimingRunState,

  segments: Segment[],

): number | null {

  if (run.raceComplete) return null;

  const seg = segments[run.segmentIndex];

  return seg?.order ?? null;

}



function segmentIndexForOrder(segments: Segment[], order: number): number {

  return segments.findIndex((s) => s.order === order);

}



function isStationSegment(segments: Segment[], stationOrder: number): boolean {

  const seg = segments.find((s) => s.order === stationOrder);

  return seg?.type === 'station';

}



/** Índice do segmento de corrida imediatamente antes da estação (se existir). */

export function getRunIndexBeforeStation(segments: Segment[], stationOrder: number): number | null {

  const stationIdx = segmentIndexForOrder(segments, stationOrder);

  if (stationIdx <= 0) return null;

  const prev = segments[stationIdx - 1];

  return prev?.type === 'run' ? stationIdx - 1 : null;

}



export function stationSegmentOptions(segments: Segment[]): Segment[] {

  return segments.filter((s) => s.type === 'station');

}



export function stationLabel(segments: Segment[], stationOrder: number): string {

  const seg = segments.find((s) => s.order === stationOrder && s.type === 'station');

  if (!seg) return `Estação ${stationOrder}`;

  return `${seg.name} (${seg.target})`;

}



/** Atleta está executando o WOD na estação do juiz. */

export function isParticipantAtStation(

  run: TimingRunState,

  segments: Segment[],

  stationOrder: number,

): boolean {

  const order = getCurrentSegmentOrder(run, segments);

  if (order !== stationOrder) return false;

  return isStationSegment(segments, stationOrder);

}



/** Atleta está na corrida que antecede a estação do juiz (intervalo entre estações). */

export function isParticipantApproachingStation(

  run: TimingRunState,

  segments: Segment[],

  stationOrder: number,

): boolean {

  if (run.raceComplete) return false;

  const runIdx = getRunIndexBeforeStation(segments, stationOrder);

  if (runIdx == null) return false;

  return run.segmentIndex === runIdx;

}



/** Juiz vê o atleta na estação ou na corrida que chega até ela. */

export function isJudgeManagingParticipant(

  run: TimingRunState,

  segments: Segment[],

  stationOrder: number,

): boolean {

  return (

    isParticipantAtStation(run, segments, stationOrder) ||

    isParticipantApproachingStation(run, segments, stationOrder)

  );

}



/** Snapshot na nuvem indica segmento atual = esta estação. */

export function isSnapshotAtStation(

  snapshot: LiveRunSnapshot,

  segments: Segment[],

  stationOrder: number,

): boolean {

  if (snapshot.liveCompleteAt) return false;

  if (snapshot.currentSegmentOrder !== stationOrder) return false;

  return isStationSegment(segments, stationOrder);

}



export function isSnapshotApproachingStation(

  snapshot: LiveRunSnapshot,

  segments: Segment[],

  stationOrder: number,

): boolean {

  if (snapshot.liveCompleteAt) return false;

  const runIdx = getRunIndexBeforeStation(segments, stationOrder);

  if (runIdx == null) return false;

  const runSegment = segments[runIdx];

  return snapshot.currentSegmentOrder === runSegment?.order;

}



/** Cronômetro local ou snapshot na nuvem — atleta sob responsabilidade do juiz. */

export function isRunAtJudgeStation(

  run: TimingRunState,

  snapshot: LiveRunSnapshot,

  segments: Segment[],

  stationOrder: number,

): boolean {

  return (

    isJudgeManagingParticipant(run, segments, stationOrder) ||

    isSnapshotAtStation(snapshot, segments, stationOrder) ||

    isSnapshotApproachingStation(snapshot, segments, stationOrder)

  );

}



export type JudgeStationActions = {

  approaching: boolean;

  atStation: boolean;

  canReceive: boolean;

  canRelease: boolean;

};



/** Ações disponíveis para o juiz na estação designada. */

export function getJudgeStationActions(

  run: TimingRunState,

  segments: Segment[],

  stationOrder: number | null | undefined,

): JudgeStationActions | null {

  if (stationOrder == null) return null;



  const approaching = isParticipantApproachingStation(run, segments, stationOrder);

  const atStation = isParticipantAtStation(run, segments, stationOrder);

  const running = isSegmentRunning(run);



  return {

    approaching,

    atStation,

    canReceive: approaching || (atStation && !running),

    canRelease: atStation && running,

  };

}



export function canJudgeAdvanceAtStation(

  run: TimingRunState,

  segments: Segment[],

  stationOrder: number | null | undefined,

): boolean {

  const actions = getJudgeStationActions(run, segments, stationOrder);

  return !!actions?.canReceive || !!actions?.canRelease;

}


