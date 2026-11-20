import { Stack, Text, Tooltip } from '@mantine/core'
import { useCatalogoIndicadores } from '../lib/useCatalogos'

/** Indicadores de una acción con su nombre del catálogo (definición al pasar el ratón). */
export function ListaIndicadores({ indicadores }: { indicadores: string[] }) {
  const { data: cat } = useCatalogoIndicadores()
  if (!indicadores.length) return <Text size="sm">—</Text>
  return (
    <Stack gap={2}>
      {indicadores.map((x) => {
        const i = cat?.porCodigo.get(x)
        if (!i) return <Text key={x} size="sm">{x}</Text>
        return (
          <Tooltip key={x} label={i.definicion} disabled={!i.definicion} multiline w={360} withArrow>
            <Text size="sm">
              <Text span ff="monospace" fw={600}>{i.codigo}</Text> · {i.nombre}
            </Text>
          </Tooltip>
        )
      })}
    </Stack>
  )
}
