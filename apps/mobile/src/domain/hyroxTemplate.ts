import type { Segment } from './types';

export const HYROX_SEGMENTS: Segment[] = [
  { id: 's01', order: 1, type: 'run', name: 'Run 1', target: '1 km' },
  { id: 's02', order: 2, type: 'station', name: 'SkiErg', target: '1.000 m' },
  { id: 's03', order: 3, type: 'run', name: 'Run 2', target: '1 km' },
  { id: 's04', order: 4, type: 'station', name: 'Sled Push', target: '50 m' },
  { id: 's05', order: 5, type: 'run', name: 'Run 3', target: '1 km' },
  { id: 's06', order: 6, type: 'station', name: 'Sled Pull', target: '50 m' },
  { id: 's07', order: 7, type: 'run', name: 'Run 4', target: '1 km' },
  { id: 's08', order: 8, type: 'station', name: 'Burpee Broad Jumps', target: '80 m' },
  { id: 's09', order: 9, type: 'run', name: 'Run 5', target: '1 km' },
  { id: 's10', order: 10, type: 'station', name: 'Rowing', target: '1.000 m' },
  { id: 's11', order: 11, type: 'run', name: 'Run 6', target: '1 km' },
  { id: 's12', order: 12, type: 'station', name: 'Farmers Carry', target: '200 m' },
  { id: 's13', order: 13, type: 'run', name: 'Run 7', target: '1 km' },
  { id: 's14', order: 14, type: 'station', name: 'Sandbag Lunges', target: '100 m' },
  { id: 's15', order: 15, type: 'run', name: 'Run 8', target: '1 km' },
  { id: 's16', order: 16, type: 'station', name: 'Wall Balls', target: '100 reps' },
];

export function cloneHyroxSegments(eventId: string): Segment[] {
  return HYROX_SEGMENTS.map((seg) => ({
    ...seg,
    id: `${eventId}-seg-${String(seg.order).padStart(2, '0')}`,
  }));
}
