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
  indicador: string | null
  origen: string | null
  estado: EstadoAccion
  presupuesto: number | null
  es_mejora: boolean
  observaciones: string | null
  cerrada: boolean
  created_at: string
  updated_at: string
}
