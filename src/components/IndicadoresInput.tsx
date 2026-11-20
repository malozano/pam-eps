import { Group, Stack, TagsInput, Text, type ComboboxParsedItem, type TagsInputProps } from '@mantine/core'
import { useMemo } from 'react'
import { normalizar } from '../lib/importacion'
import { esCodigo, SI_NO } from '../lib/indicadores'
import { useCatalogoIndicadores } from '../lib/useCatalogos'

type Props = Omit<TagsInputProps, 'data' | 'renderOption' | 'filter'> & {
  /** Indicadores usados en otras acciones del plan (incluidos los escritos a mano) */
  usados?: string[]
}

/**
 * Selección de uno o varios indicadores: «Si / No» primero, después el catálogo agrupado
 * por procedimiento (búsqueda por código, nombre o definición) y, si se quiere, texto libre
 * para indicadores sin código (se escribe y se pulsa Intro).
 */
export function IndicadoresInput({ usados = [], ...props }: Props) {
  const { data: cat } = useCatalogoIndicadores()

  const { datos, buscable } = useMemo(() => {
    const buscable = new Map<string, string>([[SI_NO, normalizar(`${SI_NO} si no comodin`)]])
    if (!cat) return { datos: [SI_NO], buscable }
    const nombreProc = new Map(cat.procedimientos.map((p) => [p.codigo, p.nombre]))
    const grupos = new Map<string, string[]>()
    for (const i of cat.indicadores.filter((x) => x.activo)) {
      const g = `${i.procedimiento} · ${nombreProc.get(i.procedimiento) ?? ''}`
      grupos.set(g, [...(grupos.get(g) ?? []), i.codigo])
      buscable.set(i.codigo, normalizar(`${i.codigo} ${i.nombre} ${i.definicion ?? ''} ${i.procedimientos.join(' ')}`))
    }
    // Indicadores escritos a mano en otras acciones del plan
    const libres = Array.from(new Set(usados.filter((u) => u !== SI_NO && !cat.porCodigo.has(u) && !esCodigo(u))))
    for (const l of libres) buscable.set(l, normalizar(l))
    const datos = [
      { group: 'Comodín', items: [SI_NO] },
      ...Array.from(grupos, ([group, items]) => ({ group, items })),
      ...(libres.length ? [{ group: 'Sin código (usados en este plan)', items: libres }] : []),
    ]
    return { datos, buscable }
  }, [cat, usados])

  const filtrar = ({ options, search }: { options: ComboboxParsedItem[]; search: string }) => {
    const palabras = normalizar(search).split(' ').filter(Boolean)
    const pasa = (v: string) => palabras.every((p) => (buscable.get(v) ?? normalizar(v)).includes(p))
    return options
      .map((o) => ('group' in o ? { ...o, items: o.items.filter((i) => pasa(i.value)) } : o))
      .filter((o) => ('group' in o ? o.items.length > 0 : pasa(o.value)))
  }

  return (
    <TagsInput
      data={datos}
      filter={filtrar}
      maxDropdownHeight={360}
      splitChars={[',', ';']}
      acceptValueOnBlur={false}
      clearable
      comboboxProps={{ width: 'target' }}
      renderOption={({ option }) => {
        const i = cat?.porCodigo.get(option.value)
        if (!i)
          return (
            <Text size="sm">
              {option.value === SI_NO ? <b>{SI_NO}</b> : option.value}
              {option.value === SI_NO && <Text span size="xs" c="dimmed"> · se ha conseguido o no</Text>}
            </Text>
          )
        return (
          <Stack gap={0}>
            <Group gap={6} wrap="nowrap" align="baseline">
              <Text size="sm" fw={700} ff="monospace" style={{ flexShrink: 0 }}>{i.codigo}</Text>
              <Text size="sm">{i.nombre}</Text>
            </Group>
            {i.definicion && (
              <Text size="xs" c="dimmed" lineClamp={2}>{i.definicion}</Text>
            )}
          </Stack>
        )
      }}
      {...props}
    />
  )
}
