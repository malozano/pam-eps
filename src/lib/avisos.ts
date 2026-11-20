/** Direcciones que necesita la tarea programada de avisos (se guardan al entrar un administrador). */
export function direccionesAvisos() {
  return {
    url_app: `${window.location.origin}${import.meta.env.BASE_URL}`,
    url_funciones: import.meta.env.VITE_SUPABASE_URL.replace(/\/$/, ''),
  }
}
