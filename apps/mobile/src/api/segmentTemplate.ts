import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';

export const HYROX_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001';

type TemplateSegment = { id: string; order_index: number };

let segmentByOrder: Map<number, string> | null = null;
let orderBySegmentId: Map<string, number> | null = null;

export async function getTemplateSegmentIdByOrder(order: number): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  await ensureTemplateSegmentCache();
  return segmentByOrder?.get(order) ?? null;
}

export async function getTemplateOrderBySegmentId(segmentId: string): Promise<number | null> {
  if (!isSupabaseConfigured()) return null;
  await ensureTemplateSegmentCache();
  return orderBySegmentId?.get(segmentId) ?? null;
}

async function ensureTemplateSegmentCache(): Promise<void> {
  if (segmentByOrder && orderBySegmentId) return;
  const { data, error } = await getSupabase()
    .from('segments')
    .select('id, order_index')
    .eq('course_template_id', HYROX_TEMPLATE_ID)
    .order('order_index');

  if (error || !data?.length) return;
  const rows = data as TemplateSegment[];
  segmentByOrder = new Map(rows.map((row) => [row.order_index, row.id]));
  orderBySegmentId = new Map(rows.map((row) => [row.id, row.order_index]));
}

export function resetTemplateSegmentCache(): void {
  segmentByOrder = null;
  orderBySegmentId = null;
}
