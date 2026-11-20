import { Badge, Stack, Text, Tooltip } from '@mantine/core'
import { useCatalogoIndicadores } from '../lib/useCatalogos'

/** Indicadores de una acción con su nombre del catálogo (definición al pasar el ratón). */
export function ListaIndicadores({ indicadores, marcarInactivos = false }: { indicadores: string[]; marcarInactivos?: boolean }) {
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
              {marcarInactivos && !i.activo && (
                <Badge size="xs" color="gray" variant="outline" ml={6}>en desuso</Badge>
              )}
            </Text>
          </Tooltip>
        )
      })}
    </Stack>
  )
}
