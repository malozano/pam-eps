export type EstadoAccion = 'pendiente' | 'en_proceso' | 'completada' | 'cancelada'
export type RolUsuario = 'admin' | 'coordinador'
export type TipoTitulacion = 'centro' | 'grado' | 'master'

export const ESTADOS: EstadoAccion[] = ['pendiente', 'en_proceso', 'completada', 'cancelada']

export interface Titulacion {
  codigo: string
  nombre: string
  tipo: TipoTitulacion
  activa: boolean
  orden: number
}

export interface Perfil {
  id: string
  email: string
  nombre: string | null
  rol: RolUsuario
  activo: boolean
  created_at: string
  avisos_push: boolean
  avisos_email: boolean
}

export interface PerfilConTitulaciones extends Perfil {
  perfil_titulacion: { titulacion: string }[]
}

export interface Accion {
  id: string
  titulacion: string
  anyo: number
  numero: number
  codigo: string
  nombre: string
  tareas: string | null
  responsable: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  indicadores: string[]
  origen: string | null
  estado: EstadoAccion
  presupuesto: number | null
  es_mejora: boolean
  observaciones: string | null
  cerrada: boolean
  created_at: string
  updated_at: string
}

export type TipoHistorial = 'alta' | 'importacion' | 'estado' | 'seguimiento' | 'cierre'

export interface EntradaHistorial {
  id: number
  accion_id: string
  fecha: string
  usuario_email: string | null
  estado_anterior: EstadoAccion | null
  estado_nuevo: EstadoAccion | null
  comentario: string | null
  evidencias: string | null
  tipo: TipoHistorial
  fecha_inicio: string | null
  fecha_fin: string | null
}
