import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import es from './es.json'
import va from './va.json'

export const IDIOMAS = [
  { value: 'es', label: 'Castellano' },
  { value: 'va', label: 'Valencià' },
] as const

function idiomaGuardado(): string {
  try {
    return localStorage.getItem('idioma') ?? 'es'
  } catch {
    return 'es'
  }
}

i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, va: { translation: va } },
  lng: idiomaGuardado(),
  fallbackLng: 'es', // los textos no traducidos (y el contenido de las acciones) se muestran en castellano
  interpolation: { escapeValue: false },
})

export function cambiarIdioma(lng: string) {
  i18n.changeLanguage(lng)
  try {
    localStorage.setItem('idioma', lng)
  } catch {
    /* sin almacenamiento local */
  }
  document.documentElement.lang = lng
}

export default i18n
