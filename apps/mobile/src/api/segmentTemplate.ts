import { getSupabase, isSupabaseConfigured } from '@/src/lib/supabase';

export const HYROX_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001';

type TemplateSegment = { id: string; order_index: number };

let segmentByOrder: Map<number, string> | null = null;

export async function getTemplateSegmentIdByOrder(order: number): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  if (!segmentByOrder) {
    const { data, error } = await getSupabase()
      .from('segments')
      .select('id, order_index')
      .eq('course_template_id', HYROX_TEMPLATE_ID)
      .order('order_index');

    if (error || !data?.length) return null;
    segmentByOrder = new Map(
      (data as TemplateSegment[]).map((row) => [row.order_index, row.id]),
    );
  }
  return segmentByOrder.get(order) ?? null;
}

export function resetTemplateSegmentCache(): void {
  segmentByOrder = null;
}
