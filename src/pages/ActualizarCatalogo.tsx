import {
  Alert, Anchor, Badge, Button, FileInput, Group, List, Paper, Skeleton, Stack, Switch, Table, Text, Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconFileSpreadsheet } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { analizarCatalogo, CABECERA_CATALOGO, type FilaCatalogo } from '../lib/catalogo'
import { leerExcel } from '../lib/importacion'
import { supabase } from '../lib/supabase'
import { useCatalogoIndicadores, useUsoIndicadores } from '../lib/useCatalogos'

function Bloque({ titulo, color, n, children }: { titulo: string; color: string; n: number; children: ReactNode }) {
  if (n === 0) return null
  return (
    <Paper withBorder p="md">
      <Group gap="xs" mb="xs">
        <Title order={5}>{titulo}</Title>
        <Badge color={color} variant="light">{n}</Badge>
      </Group>
      {children}
    </Paper>
  )
}

function TablaFilas({ filas, detalle }: { filas: FilaCatalogo[]; detalle: (f: FilaCatalogo) => ReactNode }) {
  return (
    <Table.ScrollContainer minWidth={600}>
      <Table verticalSpacing={4}>
        <Table.Tbody>
          {filas.map((f) => (
            <Table.Tr key={f.fila}>
              <Table.Td w={60}><Text size="xs" c="dimmed">fila {f.fila}</Text></Table.Td>
              <Table.Td w={100}><Text size="sm" ff="monospace" fw={600}>{f.codigo || '—'}</Text></Table.Td>
              <Table.Td>{detalle(f)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  )
}

/**
 * Actualización del catálogo de indicadores desde Excel (p. ej. al publicarse una nueva versión
 * del documento de indicadores por procedimiento), con vista previa de los cambios.
 */
export function ActualizarCatalogo() {
  const { esAdmin } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: cat, isLoading } = useCatalogoIndicadores()
  const { data: uso } = useUsoIndicadores()
  const [fichero, setFichero] = useState<File | null>(null)
  const [datos, setDatos] = useState<unknown[][] | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [desactivar, setDesactivar] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const analisis = useMemo(() => (datos && cat ? analizarCatalogo(datos, cat) : null), [datos, cat])

  if (!esAdmin) return <Navigate to="/indicadores" replace />

  async function leer(f: File | null) {
    setFichero(f)
    setDatos(null)
    setErrorLectura(null)
    if (!f) return
    if (!/\.xlsx$/i.test(f.name)) {
      setErrorLectura('Solo se admiten ficheros .xlsx')
      return
    }
    try {
      setDatos(await leerExcel(await f.arrayBuffer()))
    } catch (e) {
      setErrorLectura(`No se ha podido leer el fichero: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const por = (t: FilaCatalogo['tipo']) => analisis?.filas.filter((f) => f.tipo === t) ?? []
  const nuevos = por('nuevo')
  const modificados = por('modificado')
  const iguales = por('igual')
  const errores = por('error')
  const validas = analisis?.filas.filter((f) => f.datos) ?? []
  const ausentes = analisis?.ausentes ?? []
  const procNuevos = analisis?.procedimientos.filter((p) => p.nuevo) ?? []
  const hayCambios = nuevos.length + modificados.length + procNuevos.length > 0 || (desactivar && ausentes.length > 0)

  function confirmar() {
    modals.openConfirmModal({
      title: 'Actualizar el catálogo de indicadores',
      children: (
        <List size="sm">
          {procNuevos.length > 0 && <List.Item>{procNuevos.length} procedimientos nuevos</List.Item>}
          <List.Item>{nuevos.length} indicadores nuevos</List.Item>
          <List.Item>{modificados.length} indicadores modificados</List.Item>
          {desactivar && ausentes.length > 0 && <List.Item>{ausentes.length} indicadores se desactivan</List.Item>}
          {errores.length > 0 && <List.Item>{errores.length} filas con errores se ignoran</List.Item>}
        </List>
      ),
      labels: { confirm: 'Actualizar', cancel: 'Cancelar' },
      onConfirm: async () => {
        setGuardando(true)
        const { data, error } = await supabase.rpc('actualizar_catalogo_indicadores', {
          p_procedimientos: analisis!.procedimientos.map(({ codigo, nombre }) => ({ codigo, nombre })),
          p_indicadores: validas.map((f) => f.datos),
          p_desactivar_ausentes: desactivar,
        })
        setGuardando(false)
        if (error) {
          notifications.show({ color: 'red', title: 'No se ha actualizado nada', message: error.message, autoClose: false })
          return
        }
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['catalogo_indicadores'] }),
          qc.invalidateQueries({ queryKey: ['uso_indicadores'] }),
        ])
        const r = data as { nuevos: number; actualizados: number; desactivados: number }
        notifications.show({
          color: 'green',
          title: 'Catálogo actualizado',
          message: `${r.nuevos} nuevos, ${modificados.length} modificados, ${r.desactivados} desactivados`,
        })
        navigate('/indicadores')
      },
    })
  }

  return (
    <Stack maw={1000}>
      <Anchor component={Link} to="/indicadores" size="sm">← Indicadores</Anchor>
      <div>
        <Title order={2}>Actualizar el catálogo de indicadores</Title>
        <Text size="sm" c="dimmed">
          Para una nueva versión del documento de indicadores: exporta el catálogo actual desde «Indicadores», actualízalo
          (añadir, modificar o quitar filas) y súbelo aquí. Columnas: {CABECERA_CATALOGO.join(' · ')}. Los indicadores sin
          código no se incluyen. Nada cambia hasta que confirmes.
        </Text>
      </div>
      <FileInput
        label="Fichero Excel del catálogo"
        placeholder="Selecciona un fichero .xlsx"
        accept=".xlsx"
        leftSection={<IconFileSpreadsheet size={18} />}
        value={fichero}
        onChange={leer}
        clearable
        disabled={isLoading}
        maw={520}
      />
      {errorLectura && <Alert color="red">{errorLectura}</Alert>}
      {analisis?.error && <Alert color="red">{analisis.error}</Alert>}
      {isLoading && <Skeleton h={200} />}

      {analisis && !analisis.error && (
        <>
          <Group gap="xs">
            <Badge color="green" variant="light" size="lg">{nuevos.length} nuevos</Badge>
            <Badge color="orange" variant="light" size="lg">{modificados.length} modificados</Badge>
            <Badge color="gray" variant="light" size="lg">{iguales.length} sin cambios</Badge>
            <Badge color="red" variant="light" size="lg">{errores.length} con errores</Badge>
            <Badge color="grape" variant="light" size="lg">{ausentes.length} no están en el fichero</Badge>
          </Group>

          <Bloque titulo="Procedimientos nuevos" color="green" n={procNuevos.length}>
            <List size="sm">
              {procNuevos.map((p) => <List.Item key={p.codigo}>{p.codigo} · {p.nombre}</List.Item>)}
            </List>
          </Bloque>
          <Bloque titulo="Filas con errores (se ignoran)" color="red" n={errores.length}>
            <TablaFilas filas={errores} detalle={(f) => f.errores.map((e) => <Text key={e} size="sm" c="red">✖ {e}</Text>)} />
          </Bloque>
          <Bloque titulo="Indicadores nuevos" color="green" n={nuevos.length}>
            <TablaFilas
              filas={nuevos}
              detalle={(f) => <Text size="sm">{f.datos!.nombre} <Text span size="xs" c="dimmed">({f.datos!.procedimiento})</Text></Text>}
            />
          </Bloque>
          <Bloque titulo="Indicadores modificados" color="orange" n={modificados.length}>
            <TablaFilas filas={modificados} detalle={(f) => f.cambios.map((c) => <Text key={c} size="sm">{c}</Text>)} />
          </Bloque>
          <Bloque titulo="Indicadores activos que no están en el fichero" color="grape" n={ausentes.length}>
            <Stack gap="xs">
              <Switch
                checked={desactivar}
                onChange={(e) => setDesactivar(e.currentTarget.checked)}
                label="Desactivarlos"
                description="Dejarán de ofrecerse al elegir indicadores. Las acciones que ya los usan los conservan (aparecerán como «en desuso»)."
              />
              <Table.ScrollContainer minWidth={600}>
                <Table verticalSpacing={4}>
                  <Table.Tbody>
                    {ausentes.map((i) => (
                      <Table.Tr key={i.codigo}>
                        <Table.Td w={100}><Text size="sm" ff="monospace" fw={600}>{i.codigo}</Text></Table.Td>
                        <Table.Td><Text size="sm">{i.nombre}</Text></Table.Td>
                        <Table.Td w={120}>
                          <Text size="xs" c="dimmed">{(uso?.get(i.codigo) ?? 0) === 1 ? '1 acción' : `${uso?.get(i.codigo) ?? 0} acciones`}</Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Stack>
          </Bloque>

          <Group justify="flex-end">
            <Button variant="default" onClick={() => leer(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!hayCambios} loading={guardando}>
              {hayCambios ? 'Actualizar catálogo' : 'No hay cambios'}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  )
}
