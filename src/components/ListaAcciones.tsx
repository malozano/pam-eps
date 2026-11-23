import { Badge, Group, Paper, Stack, Table, Text } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { etiquetaCurso } from '../lib/cursos'
import { fechaCorta } from '../lib/formato'
import { usePorRevisar } from '../lib/revision'
import type { Accion } from '../lib/tipos'
import { EstadoBadge } from './EstadoBadge'
import { FONDO_POR_REVISAR, MarcaPorRevisar } from './Revision'
import { SituacionBadge } from './SituacionBadge'

/** Datos mínimos para mostrar una acción en un listado */
export type AccionListado = Pick<Accion, 'id' | 'codigo' | 'titulacion' | 'nombre' | 'estado' | 'fecha_inicio' | 'fecha_fin'> &
  Partial<Pick<Accion, 'anyo' | 'responsable' | 'es_mejora' | 'cerrada'>>

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
}: {
  acciones: AccionListado[]
  /** Columna «Responsable» */
  verResponsable?: boolean
  /** Indica «de 2024-25» en las acciones de otro curso */
  cursoReferencia?: number
  /** Contenido de una última columna (p. ej., botón de editar) */
  extra?: (a: AccionListado) => ReactNode
  minWidth?: number
}) {
  const navigate = useNavigate()
  const movil = useMediaQuery('(max-width: 48em)')
  const porRevisar = usePorRevisarTodas()
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
              onClick={() => navigate(url(a))}
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
              </Table.Td>
              {verResponsable && <Table.Td><Text size="sm">{a.responsable ?? '—'}</Text></Table.Td>}
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
