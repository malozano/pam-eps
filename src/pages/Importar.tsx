import {
  Alert, Anchor, Badge, Button, FileInput, Group, List, Paper, SegmentedControl, Stack, Switch, Table, Text, Title,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconFileSpreadsheet } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { EstadoBadge } from '../components/EstadoBadge'
import { etiquetaCurso } from '../lib/cursos'
import { fechaCorta } from '../lib/formato'
import {
  analizarFilas, cruzarConExistentes, leerExcel, resultadoFila, type AnalisisExcel, type Resultado,
} from '../lib/importacion'
import { supabase } from '../lib/supabase'
import { useAccionesTitulacion, useCatalogoIndicadores, useResponsables } from '../lib/useCatalogos'
import { useTitulaciones } from '../lib/useTitulaciones'

const ETIQUETA: Record<Resultado, { texto: string; color: string }> = {
  nueva: { texto: 'Nueva', color: 'green' },
  actualizar: { texto: 'Actualizar', color: 'orange' },
  omitir: { texto: 'Ya existe: se omite', color: 'gray' },
  error: { texto: 'Error: no se importa', color: 'red' },
}

type Filtro = 'todas' | 'errores' | 'avisos'

export function Importar() {
  const { codigo = '' } = useParams()
  const { esAdmin, titulaciones: mias } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: titulaciones = [] } = useTitulaciones()
  const tipo = titulaciones.find((t) => t.codigo === codigo)?.tipo
  const { data: responsables = [], isPending: cargandoResponsables } = useResponsables(
    tipo === undefined ? undefined : tipo === 'centro' ? 'centro' : 'titulacion',
  )
  const { data: existentes = [], isLoading: cargandoExistentes } = useAccionesTitulacion(codigo)

  const [fichero, setFichero] = useState<File | null>(null)
  const [datosExcel, setDatosExcel] = useState<unknown[][] | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [actualizar, setActualizar] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [importando, setImportando] = useState(false)
  const { data: catalogo } = useCatalogoIndicadores()

  // El análisis se recalcula si cambian los catálogos o las acciones existentes
  const analisisCompleto: AnalisisExcel | null = useMemo(
    () =>
      datosExcel
        ? analizarFilas(datosExcel, {
            titulacion: codigo,
            codigosTitulaciones: titulaciones.map((t) => t.codigo),
            responsables,
            indicadores: catalogo?.indicadores.map((i) => i.codigo),
          })
        : null,
    [datosExcel, codigo, titulaciones, responsables, catalogo],
  )
  const errorAnalisis =
    analisisCompleto?.error ?? (analisisCompleto && analisisCompleto.filas.length === 0 ? 'El fichero no contiene acciones.' : null)
  const analisis = errorAnalisis ? null : analisisCompleto
  const filas = useMemo(
    () => (analisis ? cruzarConExistentes(analisis.filas, existentes) : []),
    [analisis, existentes],
  )
  const resultados = filas.map((f) => resultadoFila(f, actualizar))
  const cuenta = (r: Resultado) => resultados.filter((x) => x === r).length
  const conAvisos = filas.filter((f) => f.avisos.length > 0).length
  const aEnviar = filas.filter((_, i) => resultados[i] === 'nueva' || resultados[i] === 'actualizar')

  if (!esAdmin && !mias.includes(codigo)) return <Navigate to="/" replace />
  const tit = titulaciones.find((t) => t.codigo === codigo)

  async function analizar(f: File | null) {
    setFichero(f)
    setDatosExcel(null)
    setErrorLectura(null)
    if (!f) return
    if (!/\.xlsx$/i.test(f.name)) {
      setErrorLectura('Solo se admiten ficheros .xlsx (Excel 2007 o posterior). Si es .xls, guárdalo antes como .xlsx.')
      return
    }
    setLeyendo(true)
    try {
      setDatosExcel(await leerExcel(await f.arrayBuffer()))
    } catch (e) {
      setErrorLectura(`No se ha podido leer el fichero: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLeyendo(false)
    }
  }

  async function importar() {
    setImportando(true)
    const { data, error } = await supabase.rpc('importar_acciones', {
      p_titulacion: codigo,
      p_acciones: aEnviar.map((f) => f.datos),
      p_actualizar: actualizar,
    })
    setImportando(false)
    if (error) {
      notifications.show({
        color: 'red',
        title: 'No se ha importado nada',
        message: `La importación se ha cancelado completa. Detalle: ${error.message}`,
        autoClose: false,
      })
      return
    }
    const r = data as { insertadas: number; actualizadas: number; omitidas: number }
    notifications.show({
      color: 'green',
      title: 'Importación completada',
      message: `${r.insertadas} nuevas, ${r.actualizadas} actualizadas, ${r.omitidas} omitidas.`,
    })
    await qc.invalidateQueries({ queryKey: ['acciones'] })
    navigate(`/gestion/${codigo}`)
  }

  function confirmar() {
    const nuevas = cuenta('nueva')
    const act = cuenta('actualizar')
    modals.openConfirmModal({
      title: 'Confirmar importación',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            Se importarán en <b>{tit?.nombre ?? codigo}</b>:
          </Text>
          <List size="sm">
            <List.Item>{nuevas === 1 ? '1 acción nueva' : `${nuevas} acciones nuevas`}</List.Item>
            {act > 0 && (
              <List.Item>
                <b>{act} acciones existentes se sobrescribirán</b> con los datos del Excel
              </List.Item>
            )}
            {cuenta('omitir') > 0 && <List.Item>{cuenta('omitir')} acciones existentes se dejan como están</List.Item>}
            {cuenta('error') > 0 && <List.Item>{cuenta('error')} filas con errores no se importarán</List.Item>}
          </List>
        </Stack>
      ),
      labels: { confirm: 'Importar', cancel: 'Cancelar' },
      confirmProps: { color: act > 0 ? 'orange' : undefined },
      onConfirm: importar,
    })
  }

  const visibles = filas
    .map((f, i) => ({ f, r: resultados[i] }))
    .filter(({ f }) => filtro === 'todas' || (filtro === 'errores' ? f.errores.length > 0 : f.avisos.length > 0))

  return (
    <Stack>
      <Anchor component={Link} to={`/gestion/${codigo}`} size="sm">
        ← Volver al plan
      </Anchor>
      <div>
        <Title order={2}>Importar acciones desde Excel</Title>
        <Text c="dimmed">{tit ? `${tit.codigo} · ${tit.nombre}` : codigo}</Text>
      </div>

      <Paper withBorder p="md">
        <Stack gap="xs">
          <FileInput
            label="Fichero Excel del plan de acciones"
            description="Formato común de la EPS: columnas Código, Acción, Tareas, Responsable, Fechas, Indicador, Origen, Estado…"
            placeholder="Selecciona un fichero .xlsx"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            leftSection={<IconFileSpreadsheet size={18} />}
            value={fichero}
            onChange={analizar}
            clearable
            disabled={leyendo || importando || cargandoExistentes || cargandoResponsables}
          />
          <Text size="xs" c="dimmed">
            Nada se guarda hasta que confirmes la importación. Las columnas que no se usan (p. ej. «Reto») se ignoran.
          </Text>
        </Stack>
      </Paper>

      {leyendo && <Text>Leyendo el fichero…</Text>}
      {(errorLectura || errorAnalisis) && <Alert color="red">{errorLectura ?? errorAnalisis}</Alert>}

      {analisis && (
        <>
          <Group gap="xs">
            <Badge size="lg" color="green" variant="light">{cuenta('nueva')} nuevas</Badge>
            <Badge size="lg" color={actualizar ? 'orange' : 'gray'} variant="light">
              {filas.filter((f) => f.existente).length} ya existen
            </Badge>
            <Badge size="lg" color="red" variant="light">{cuenta('error')} con errores</Badge>
            <Badge size="lg" color="yellow" variant="light">{conAvisos} con avisos</Badge>
          </Group>
          {analisis.columnasIgnoradas.length > 0 && (
            <Text size="sm" c="dimmed">Columnas ignoradas: {analisis.columnasIgnoradas.join(', ')}</Text>
          )}

          <Group justify="space-between">
            <SegmentedControl
              value={filtro}
              onChange={(v) => setFiltro(v as Filtro)}
              data={[
                { value: 'todas', label: `Todas (${filas.length})` },
                { value: 'errores', label: `Errores (${filas.filter((f) => f.errores.length).length})` },
                { value: 'avisos', label: `Avisos (${conAvisos})` },
              ]}
            />
            {filas.some((f) => f.existente) && (
              <Switch
                checked={actualizar}
                onChange={(e) => setActualizar(e.currentTarget.checked)}
                label="Sobrescribir las acciones que ya existen"
              />
            )}
          </Group>

          <Table.ScrollContainer minWidth={900}>
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fila</Table.Th>
                  <Table.Th>Código</Table.Th>
                  <Table.Th>Acción</Table.Th>
                  <Table.Th>Curso</Table.Th>
                  <Table.Th>Fechas</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Resultado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visibles.map(({ f, r }) => (
                  <Table.Tr key={f.fila} bg={r === 'error' ? 'var(--mantine-color-red-light)' : undefined}>
                    <Table.Td>{f.fila}</Table.Td>
                    <Table.Td>
                      <Text size="sm" ff="monospace" style={{ whiteSpace: 'nowrap' }}>{f.codigo || '—'}</Text>
                    </Table.Td>
                    <Table.Td maw={380}>
                      <Text size="sm" lineClamp={2}>{f.nombre ?? ''}</Text>
                      {f.errores.map((e) => (
                        <Text key={e} size="xs" c="red">✖ {e}</Text>
                      ))}
                      {f.avisos.map((a) => (
                        <Text key={a} size="xs" c="yellow.8">⚠ {a}</Text>
                      ))}
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{f.datos ? etiquetaCurso(f.datos.anyo) : ''}</Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>
                      {f.datos && (
                        <Text size="sm">
                          {fechaCorta(f.datos.fecha_inicio)} – {fechaCorta(f.datos.fecha_fin)}
                        </Text>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {f.datos && <EstadoBadge estado={f.datos.estado} />}
                      {f.datos?.cerrada && <Badge size="xs" variant="outline" color="gray" ml={4}>Cerrada</Badge>}
                    </Table.Td>
                    <Table.Td miw={190}>
                      <Badge color={ETIQUETA[r].color} variant="dot" style={{ overflow: 'visible' }}>
                        {ETIQUETA[r].texto}
                      </Badge>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>

          <Group justify="flex-end">
            <Button variant="default" onClick={() => analizar(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={aEnviar.length === 0} loading={importando}>
              {aEnviar.length === 0
                ? 'Nada que importar'
                : `Importar ${aEnviar.length} ${aEnviar.length === 1 ? 'acción' : 'acciones'}`}
            </Button>
          </Group>
        </>
      )}
    </Stack>
  )
}
