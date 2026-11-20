/** 'aaaa-mm-dd' → 'dd/mm/aaaa' */
export function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
