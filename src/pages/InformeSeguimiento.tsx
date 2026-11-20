import {
  Alert, Anchor, Badge, Button, Checkbox, CopyButton, Group, List, Paper, Skeleton, Stack, Table, Text, Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconArchive, IconCheck, IconCopy } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { EstadoBadge } from '../components/EstadoBadge'
import { SituacionBadge } from '../components/SituacionBadge'
import { TextoConEnlaces } from '../components/TextoConEnlaces'
import { etiquetaCurso } from '../lib/cursos'
import { fechaCorta } from '../lib/formato'
import { accionesParaInforme, GRUPOS, grupoDe, textoGrupo, type GrupoInforme } from '../lib/informe'
import { supabase } from '../lib/supabase'
import type { Accion } from '../lib/tipos'
import { useAccionesTitulacion } from '../lib/useCatalogos'
import { useTitulaciones } from '../lib/useTitulaciones'

/**
 * Preparación del informe de seguimiento (CEN19): acciones de mejora no cerradas agrupadas
 * en completadas/canceladas, en proceso y pendientes, con texto listo para copiar. Tras
 * reportarlas, las completadas y canceladas se marcan como cerradas.
 */
export function InformeSeguimiento() {
  const { codigo = '' } = useParams()
  const qc = useQueryClient()
  const { esAdmin, titulaciones: mias } = useAuth()
  const { data: titulaciones = [] } = useTitulaciones()
  const { data: acciones = [], isLoading } = useAccionesTitulacion(codigo)
  const [noCerrar, setNoCerrar] = useState<Set<string>>(new Set())
  const [cerrando, setCerrando] = useState(false)

  const grupos = useMemo(() => {
    const m: Record<GrupoInforme, Accion[]> = { finalizadas: [], en_proceso: [], pendientes: [] }
    for (const a of accionesParaInforme(acciones)) m[grupoDe(a)].push(a)
    for (const g of Object.values(m)) g.sort((x, y) => x.anyo - y.anyo || x.codigo.localeCompare(y.codigo))
    return m
  }, [acciones])

  if (!esAdmin && !mias.includes(codigo)) return <Navigate to="/" replace />
  const tit = titulaciones.find((t) => t.codigo === codigo)
  const aCerrar = grupos.finalizadas.filter((a) => !noCerrar.has(a.id))

  function cerrar() {
    modals.openConfirmModal({
      title: 'Marcar como cerradas',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Confirma que estas acciones ya se han reportado en el informe de seguimiento. Pasarán al histórico y no
            aparecerán en los próximos informes:
          </Text>
          <List size="sm">
            {aCerrar.map((a) => (
              <List.Item key={a.id}>
                <Text span ff="monospace" size="sm">{a.codigo}</Text> {a.nombre}
              </List.Item>
            ))}
          </List>
        </Stack>
      ),
      labels: { confirm: `Cerrar ${aCerrar.length}`, cancel: 'Cancelar' },
      onConfirm: async () => {
        setCerrando(true)
        const { data, error } = await supabase.rpc('marcar_cerradas', { p_acciones: aCerrar.map((a) => a.id) })
        setCerrando(false)
        if (error) {
          notifications.show({ color: 'red', title: 'No se ha guardado', message: error.message })
          return
        }
        await qc.invalidateQueries({ queryKey: ['acciones'] })
        notifications.show({
          color: 'green',
          message: data === 1 ? '1 acción marcada como cerrada' : `${data} acciones marcadas como cerradas`,
        })
      },
    })
  }

  return (
    <Stack maw={1100}>
      <Anchor component={Link} to={`/gestion/${codigo}`} size="sm">
        ← {tit ? `Plan ${tit.codigo}` : 'Volver al plan'}
      </Anchor>
      <div>
        <Title order={2}>Informe de seguimiento</Title>
        <Text c="dimmed">{tit ? `${tit.codigo} · ${tit.nombre}` : codigo}</Text>
      </div>
      <Text size="sm">
        Acciones de mejora todavía no cerradas, agrupadas como en el informe semestral (CEN19). Actualiza antes el
        estado de cada acción con «Registrar seguimiento» desde su ficha. Puedes copiar cada bloque para pegarlo en el
        informe.
      </Text>

      {isLoading ? (
        <Skeleton h={300} />
      ) : (
        GRUPOS.map(({ grupo, titulo, ayuda }) => {
          const lista = grupos[grupo]
          return (
            <Paper key={grupo} withBorder p="md">
              <Stack gap="xs">
                <Group justify="space-between">
                  <Group gap="xs">
                    <Title order={4}>{titulo}</Title>
                    <Badge variant="light">{lista.length}</Badge>
                  </Group>
                  {lista.length > 0 && (
                    <CopyButton value={textoGrupo(grupo, lista)}>
                      {({ copied, copy }) => (
                        <Button
                          size="xs"
                          variant={copied ? 'light' : 'default'}
                          color={copied ? 'green' : undefined}
                          leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                          onClick={copy}
                        >
                          {copied ? 'Copiado' : 'Copiar texto'}
                        </Button>
                      )}
                    </CopyButton>
                  )}
                </Group>
                <Text size="sm" c="dimmed">{ayuda}</Text>
                {lista.length === 0 ? (
                  <Text size="sm" c="dimmed" fs="italic">Ninguna acción.</Text>
                ) : (
                  <Table.ScrollContainer minWidth={760}>
                    <Table verticalSpacing="xs">
                      <Table.Thead>
                        <Table.Tr>
                          {grupo === 'finalizadas' && <Table.Th w={40}>Cerrar</Table.Th>}
                          <Table.Th w={190}>Acción</Table.Th>
                          <Table.Th w={150}>{grupo === 'pendientes' ? 'Inicio previsto' : 'Fechas'}</Table.Th>
                          <Table.Th>Observaciones</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {lista.map((a) => (
                          <Table.Tr key={a.id}>
                            {grupo === 'finalizadas' && (
                              <Table.Td>
                                <Checkbox
                                  aria-label={`Cerrar ${a.codigo}`}
                                  checked={!noCerrar.has(a.id)}
                                  onChange={(e) => {
                                    const marcado = e.currentTarget.checked
                                    setNoCerrar((s) => {
                                      const n = new Set(s)
                                      if (marcado) n.delete(a.id)
                                      else n.add(a.id)
                                      return n
                                    })
                                  }}
                                />
                              </Table.Td>
                            )}
                            <Table.Td style={{ verticalAlign: 'top' }}>
                              <Anchor component={Link} to={`/gestion/${codigo}/accion/${a.id}`} size="sm" ff="monospace">
                                {a.codigo}
                              </Anchor>
                              <Text size="sm" lineClamp={3}>{a.nombre}</Text>
                              <Group gap={4} mt={2}>
                                {grupo === 'finalizadas' && <EstadoBadge estado={a.estado} />}
                                {grupo !== 'finalizadas' && <SituacionBadge accion={a} />}
                                {a.anyo !== Math.max(...lista.map((x) => x.anyo)) && (
                                  <Badge size="xs" variant="outline" color="gray">{etiquetaCurso(a.anyo)}</Badge>
                                )}
                              </Group>
                            </Table.Td>
                            <Table.Td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                              <Text size="sm">
                                {grupo === 'pendientes'
                                  ? fechaCorta(a.fecha_inicio)
                                  : `${fechaCorta(a.fecha_inicio)} – ${fechaCorta(a.fecha_fin)}`}
                              </Text>
                            </Table.Td>
                            <Table.Td style={{ verticalAlign: 'top' }}>
                              {a.observaciones ? (
                                <TextoConEnlaces texto={a.observaciones} size="sm" />
                              ) : (
                                <Text size="sm" c="red">
                                  Sin observaciones
                                </Text>
                              )}
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                )}
                {grupo === 'finalizadas' && lista.length > 0 && (
                  <Group justify="flex-end">
                    <Button
                      leftSection={<IconArchive size={16} />}
                      variant="light"
                      disabled={aCerrar.length === 0}
                      loading={cerrando}
                      onClick={cerrar}
                    >
                      Marcar {aCerrar.length === 1 ? '1 como cerrada' : `${aCerrar.length} como cerradas`} (ya reportadas)
                    </Button>
                  </Group>
                )}
              </Stack>
            </Paper>
          )
        })
      )}
      {!isLoading && GRUPOS.every(({ grupo }) => grupos[grupo].length === 0) && (
        <Alert color="green">No hay acciones de mejora pendientes de reportar.</Alert>
      )}
    </Stack>
  )
}
