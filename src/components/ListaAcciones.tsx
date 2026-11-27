import { Badge, Group, Paper, Stack, Table, Text, Tooltip } from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useMediaQuery } from '@mantine/hooks'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { etiquetaCurso } from '../lib/cursos'
import { fechaCorta } from '../lib/formato'
import { usePorRevisar } from '../lib/revision'
import { estaAbierta } from '../lib/seguimiento'
import { useCatalogoIndicadores } from '../lib/useCatalogos'
import type { Accion } from '../lib/tipos'
import { EstadoBadge } from './EstadoBadge'
import { FONDO_POR_REVISAR, MarcaPorRevisar } from './Revision'
import { SituacionBadge } from './SituacionBadge'
import { useEstadoDesde } from '../lib/navegacion'

/** Datos mínimos para mostrar una acción en un listado */
export type AccionListado = Pick<Accion, 'id' | 'codigo' | 'titulacion' | 'nombre' | 'estado' | 'fecha_inicio' | 'fecha_fin'> &
  Partial<Pick<Accion, 'anyo' | 'responsable' | 'es_mejora' | 'cerrada' | 'tareas' | 'indicadores'>>

/** Códigos de los indicadores (nombre del catálogo al pasar el ratón). */
function CodigosIndicadores({ indicadores }: { indicadores: string[] }) {
  const { data: cat } = useCatalogoIndicadores()
  if (!indicadores.length) return <Text size="sm" c="dimmed">—</Text>
  return (
    <Group gap={4}>
      {indicadores.map((x) => {
        const i = cat?.porCodigo.get(x)
        // los que no son del catálogo («Si / No», texto libre) se abrevian
        const corto = i || x.length <= 12 ? x : `${x.slice(0, 11)}…`
        return (
          <Tooltip key={x} label={i ? `${i.codigo} · ${i.nombre}` : x} multiline maw={320} withArrow>
            <Text size="xs" ff={i ? 'monospace' : undefined} fw={i ? 600 : undefined} style={{ whiteSpace: 'nowrap' }}>{corto}</Text>
          </Tooltip>
        )
      })}
    </Group>
  )
}

/** Datos que faltan en una acción abierta (tareas, indicadores, fecha de fin). */
function datosQueFaltan(a: AccionListado): string[] {
  if (!estaAbierta(a.estado)) return []
  const f: string[] = []
  if (a.tareas !== undefined && !a.tareas?.trim()) f.push('Sin tareas')
  if (a.indicadores !== undefined && !a.indicadores.length) f.push('Sin indicadores')
  if (!a.fecha_fin) f.push('Sin fecha de fin')
  return f
}

function AvisoDatos({ a }: { a: AccionListado }) {
  const faltan = datosQueFaltan(a)
  if (!faltan.length) return null
  return (
    <Group gap={4} wrap="nowrap" mt={2} c="orange.8">
      <IconAlertTriangle size={13} aria-hidden style={{ flexShrink: 0 }} />
      <Text size="xs" c="orange.8">{faltan.join(' · ')}</Text>
    </Group>
  )
}

/** Ids de las acciones pendientes de las revisiones del estado en curso (centro y titulaciones). */
export function usePorRevisarTodas() {
  const centro = usePorRevisar(null, 'centro')
  const titulaciones = usePorRevisar(null, 'titulaciones')
  return (id: string) => centro.porRevisar.has(id) || titulaciones.porRevisar.has(id)
}

/**
 * Listado de acciones común a toda la aplicación: mismas columnas, etiquetas de plazo, estado,
 * marca «Por revisar» (con la fila azulada) y tarjetas en el móvil. Cada página solo decide qué
 * acciones muestra (y en qué orden) y las columnas opcionales.
 */
export function ListaAcciones({
  acciones,
  verResponsable = false,
  cursoReferencia,
  extra,
  minWidth = 760,
  verIndicadores = false,
  avisosDatos = false,
}: {
  acciones: AccionListado[]
  /** Columna «Responsable» */
  verResponsable?: boolean
  /** Indica «de 2024-25» en las acciones de otro curso */
  cursoReferencia?: number
  /** Contenido de una última columna (p. ej., botón de editar) */
  extra?: (a: AccionListado) => ReactNode
  minWidth?: number
  /** Columna con los códigos de los indicadores */
  verIndicadores?: boolean
  /** Avisa de lo que falta en las acciones abiertas (tareas, indicadores, fecha de fin) */
  avisosDatos?: boolean
}) {
  const navigate = useNavigate()
  const movil = useMediaQuery('(max-width: 48em)')
  const porRevisar = usePorRevisarTodas()
  const estado = useEstadoDesde()
  const url = (a: AccionListado) => `/gestion/${a.titulacion}/accion/${a.id}`
  const etiquetas = (a: AccionListado) => (
    <>
      <SituacionBadge accion={a} />
      {a.es_mejora === false && <Badge size="xs" variant="outline" color="gray">No es acción de mejora</Badge>}
      {a.cerrada && <Badge size="xs" variant="outline" color="gray">Cerrada</Badge>}
    </>
  )

  if (movil)
    return (
      <Stack gap="xs">
        {acciones.map((a) => (
          <Paper
            key={a.id}
            withBorder
            p="sm"
            component={Link}
            to={url(a)}
            state={estado}
            opacity={a.cerrada ? 0.6 : 1}
            bg={porRevisar(a.id) ? FONDO_POR_REVISAR : undefined}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <Group justify="space-between" wrap="nowrap" mb={4} align="flex-start">
              <Text size="sm" ff="monospace">{a.codigo}</Text>
              <div>
                <EstadoBadge estado={a.estado} />
                {porRevisar(a.id) && <MarcaPorRevisar />}
              </div>
            </Group>
            <Text size="sm" fw={500} lineClamp={3}>{a.nombre}</Text>
            {avisosDatos && <AvisoDatos a={a} />}
            {verIndicadores && !!a.indicadores?.length && (
              <Group gap={4} mt={4}><Text size="xs" c="dimmed">Indicadores:</Text><CodigosIndicadores indicadores={a.indicadores} /></Group>
            )}
            <Text size="xs" c="dimmed" mt={4}>
              {fechaCorta(a.fecha_inicio)} – {fechaCorta(a.fecha_fin)}
              {verResponsable && ` · ${a.responsable ?? 'Sin responsable'}`}
            </Text>
            <Group gap={4} mt={4}>{etiquetas(a)}</Group>
          </Paper>
        ))}
      </Stack>
    )

  return (
    <Table.ScrollContainer minWidth={minWidth}>
      <Table striped highlightOnHover verticalSpacing="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Código</Table.Th>
            <Table.Th>Acción</Table.Th>
            {verResponsable && <Table.Th>Responsable</Table.Th>}
            {verIndicadores && <Table.Th>Indicadores</Table.Th>}
            <Table.Th>Inicio</Table.Th>
            <Table.Th>Fin</Table.Th>
            <Table.Th>Estado</Table.Th>
            {extra && <Table.Th />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {acciones.map((a) => (
            <Table.Tr
              key={a.id}
              opacity={a.cerrada ? 0.6 : 1}
              style={{ cursor: 'pointer', ...(porRevisar(a.id) ? { background: FONDO_POR_REVISAR } : {}) }}
              onClick={() => navigate(url(a), { state: estado })}
            >
              <Table.Td>
                <Text size="sm" ff="monospace" style={{ whiteSpace: 'nowrap' }}>{a.codigo}</Text>
                {cursoReferencia !== undefined && a.anyo !== undefined && a.anyo !== cursoReferencia && (
                  <Text size="xs" c="dimmed">de {etiquetaCurso(a.anyo)}</Text>
                )}
              </Table.Td>
              <Table.Td>
                <Text size="sm" lineClamp={2}>{a.nombre}</Text>
                <Group gap={4} mt={2}>{etiquetas(a)}</Group>
                {avisosDatos && <AvisoDatos a={a} />}
              </Table.Td>
              {verResponsable && <Table.Td><Text size="sm">{a.responsable ?? '—'}</Text></Table.Td>}
              {verIndicadores && <Table.Td maw={160}><CodigosIndicadores indicadores={a.indicadores ?? []} /></Table.Td>}
              <Table.Td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(a.fecha_inicio)}</Table.Td>
              <Table.Td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(a.fecha_fin)}</Table.Td>
              <Table.Td miw={130}>
                <EstadoBadge estado={a.estado} />
                {porRevisar(a.id) && <MarcaPorRevisar />}
              </Table.Td>
              {extra && <Table.Td onClick={(e) => e.stopPropagation()}>{extra(a)}</Table.Td>}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}
