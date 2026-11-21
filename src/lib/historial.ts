import { supabase } from './supabase'

/**
 * Fecha (aaaa-mm-dd) en que cada acción pasó a completada o cancelada, según el historial.
 * Solo cuenta cambios de estado reales (no altas ni importaciones de acciones ya finalizadas).
 */
export async function fechasFinalizacion(ids: string[]): Promise<Map<string, string>> {
  const finalizadas = new Map<string, string>()
  if (!ids.length) return finalizadas
  const { data, error } = await supabase
    .from('historial')
    .select('accion_id, fecha')
    .in('accion_id', ids)
    .in('estado_nuevo', ['completada', 'cancelada'])
    .in('tipo', ['estado', 'seguimiento'])
  if (error) throw error
  for (const h of data ?? []) {
    const f = (h.fecha as string).slice(0, 10)
    if (f > (finalizadas.get(h.accion_id) ?? '')) finalizadas.set(h.accion_id, f)
  }
  return finalizadas
}
