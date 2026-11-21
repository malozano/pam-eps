import {
  Alert, Anchor, Badge, Button, Collapse, FileInput, Group, List, NumberInput, Paper, SegmentedControl, Select,
  SimpleGrid, Stack, Table, Text, Title, UnstyledButton,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconAlertTriangle, IconChevronDown, IconChevronRight, IconFileSpreadsheet, IconFileTypeDocx,
} from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import {
  analizarTasas, aspectosDestacados, criteriosDesdeAjustes, pct, type AjustesInforme, type AnalisisTasas, type Motivo,
} from '../lib/analisisTasas'
import { etiquetaCurso } from '../lib/cursos'
import { descargar } from '../lib/exportacion'
import { fechaCorta } from '../lib/formato'
import { fechasFinalizacion } from '../lib/historial'
import {
  anyoInformePorDefecto, cargarPlantillaInforme, COLOR_MOTIVO, datosInforme, generarInforme, nombreFicheroInforme,
  pendientesVencidas, semestrePorDefecto,
} from '../lib/informeCen19'
import { supabase } from '../lib/supabase'
import { leerTasas, mismaTitulacion, type TasasTitulacion } from '../lib/tasas'
import type { Accion, Titulacion } from '../lib/tipos'

const PRIORIDAD: Motivo[] = ['baja', 'no_presentados', 'atipica', 'cambio']
const fondo = (m: Motivo[]) => {
  const x = PRIORIDAD.find((p) => m.includes(p))
  return x ? `#${COLOR_MOTIVO[x]}` : undefined
}

function useAjustesInforme() {
  return useQuery({
    queryKey: ['ajustes_informe'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ajustes_informe').select('*').single()
      if (error) throw error
      return data as AjustesInforme
    },
  })
}

/** Vista previa de las tablas de tasas con los valores destacados. */
function VistaPrevia({ a }: { a: AnalisisTasas }) {
  return (
    <Stack gap="sm">
      {a.tablas.map((tb) => (
        <div key={tb.titulo}>
          <Text fw={600} size="sm" mb={4}>{tb.titulo}</Text>
          <Table.ScrollContainer minWidth={640}>
            <Table withTableBorder withColumnBorders verticalSpacing={2} fz="xs">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th rowSpan={2}>Asignatura</Table.Th>
                  <Table.Th rowSpan={2} ta="right">Mat.</Table.Th>
                  <Table.Th colSpan={a.cursos.length} ta="center">Éxito</Table.Th>
                  <Table.Th colSpan={a.cursos.length} ta="center">Rendimiento</Table.Th>
                </Table.Tr>
                <Table.Tr>
                  {[...a.cursos, ...a.cursos].map((c, k) => <Table.Th key={k} ta="right">{c.slice(2)}</Table.Th>)}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tb.filas.map((f) => (
                  <Table.Tr key={f.asignatura.codigo}>
                    <Table.Td>{f.asignatura.nombre}</Table.Td>
                    <Table.Td ta="right">{f.matriculados ?? '—'}</Table.Td>
                    {f.exito.map((v, k) => {
                      const m = k === a.cursos.length - 1 ? f.marcas.exito : []
                      return <Table.Td key={'e' + k} ta="right" bg={fondo(m)} fw={m.length ? 700 : undefined}>{pct(v)}</Table.Td>
                    })}
                    {f.rendimiento.map((v, k) => {
                      const m = k === a.cursos.length - 1 ? f.marcas.rendimiento : []
                      return <Table.Td key={'r' + k} ta="right" bg={fondo(m)} fw={m.length ? 700 : undefined}>{pct(v)}</Table.Td>
                    })}
                  </Table.Tr>
                ))}
                <Table.Tr fw={700} fs="italic">
                  <Table.Td>Mediana</Table.Td>
                  <Table.Td />
                  {[...tb.mediana.exito, ...tb.mediana.rendimiento].map((v, k) => <Table.Td key={k} ta="right">{pct(v)}</Table.Td>)}
                </Table.Tr>
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </div>
      ))}
    </Stack>
  )
}

function Criterios({ editable }: { editable: boolean }) {
  const qc = useQueryClient()
  const { data: ajustes } = useAjustesInforme()
  const [v, setV] = useState<AjustesInforme | null>(null)
  const actual = v ?? ajustes ?? null
  if (!actual) return null
  const campo = (k: keyof AjustesInforme, etiqueta: string, sufijo: string, min: number, max: number) => (
    <NumberInput
      label={etiqueta}
      suffix={sufijo}
      min={min}
      max={max}
      size="xs"
      disabled={!editable}
      value={actual[k]}
      onChange={(x) => setV({ ...actual, [k]: Number(x) || 0 })}
    />
  )
  async function guardar() {
    if (!v) return
    const { error } = await supabase.from('ajustes_informe').update(v).eq('id', true)
    if (error) return notifications.show({ color: 'red', title: 'No se ha guardado', message: error.message })
    notifications.show({ color: 'green', message: 'Criterios guardados' })
    setV(null)
    qc.invalidateQueries({ queryKey: ['ajustes_informe'] })
  }
  return (
    <Stack gap="xs">
      <SimpleGrid cols={{ base: 1, xs: 2, md: 5 }}>
        {campo('tasa_baja', 'Tasa baja (inferior a)', ' %', 0, 100)}
        {campo('cambio', 'Cambio respecto al curso anterior', ' puntos', 1, 100)}
        {campo('desviacion', 'Diferencia con la mediana del curso', ' puntos', 1, 100)}
        {campo('no_presentados', 'Éxito − rendimiento (no presentados)', ' puntos', 1, 100)}
        {campo('min_matriculados', 'Mínimo de matriculados para destacar', '', 1, 1000)}
      </SimpleGrid>
      {editable && v && (
        <Button size="xs" w="fit-content" onClick={guardar}>
          Guardar criterios
        </Button>
      )}
      {!editable && <Text size="xs" c="dimmed">Los criterios los configura la administración.</Text>}
    </Stack>
  )
}

/** Generación del informe de seguimiento semestral (CEN19) en Word. */
export function InformeCen19Panel({ titulacion, acciones }: { titulacion: Titulacion; acciones: Accion[] }) {
  const { esAdmin } = useAuth()
  const { data: ajustes } = useAjustesInforme()
  const criterios = criteriosDesdeAjustes(ajustes)
  const [anyo, setAnyo] = useState(anyoInformePorDefecto())
  const [bloque, setBloque] = useState<'primero' | 'segundo'>(semestrePorDefecto())
  const [fichero, setFichero] = useState<File | null>(null)
  const [tasas, setTasas] = useState<TasasTitulacion | null>(null)
  const [errorFichero, setErrorFichero] = useState<string | null>(null)
  const [verTablas, setVerTablas] = useState(false)
  const [verCriterios, setVerCriterios] = useState(false)
  const [generando, setGenerando] = useState(false)

  const cursoTxt = etiquetaCurso(anyo)
  const sinPrimerSemestre = !!tasas && !tasas.asignaturas.some((x) => x.semestre === 'primero')
  const bloqueEfectivo = sinPrimerSemestre ? 'segundo' : bloque

  const { analisis, errorAnalisis } = useMemo(() => {
    if (!tasas) return { analisis: null, errorAnalisis: null }
    try {
      return { analisis: analizarTasas(tasas, cursoTxt, bloqueEfectivo, criterios), errorAnalisis: null }
    } catch (e) {
      return { analisis: null, errorAnalisis: e instanceof Error ? e.message : String(e) }
    }
  }, [tasas, cursoTxt, bloqueEfectivo, criterios])
  const otraTitulacion = !!tasas && !mismaTitulacion(tasas.titulacion, titulacion.nombre)

  const { data: finalizadas } = useQuery({
    queryKey: ['finalizadas', titulacion.codigo, acciones.length],
    queryFn: () => fechasFinalizacion(acciones.map((a) => a.id)),
  })
  const vencidas = finalizadas ? pendientesVencidas(acciones, anyo, finalizadas) : []

  async function leer(f: File | null) {
    setFichero(f)
    setTasas(null)
    setErrorFichero(null)
    if (!f) return
    try {
      setTasas(await leerTasas(await f.arrayBuffer()))
    } catch (e) {
      setErrorFichero(e instanceof Error ? e.message : String(e))
    }
  }

  async function generar() {
    setGenerando(true)
    try {
      const fin = finalizadas ?? (await fechasFinalizacion(acciones.map((a) => a.id)))
      const datos = datosInforme({
        titulacion, anyo, bloque: bloqueEfectivo, acciones, finalizadas: fin,
        analisis: otraTitulacion ? null : analisis, criterios,
      })
      descargar(await generarInforme(await cargarPlantillaInforme(), datos), nombreFicheroInforme(titulacion.codigo, anyo, bloqueEfectivo))
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se ha podido generar el informe', message: e instanceof Error ? e.message : String(e) })
    } finally {
      setGenerando(false)
    }
  }

  const aspectos = analisis ? aspectosDestacados(analisis) : []
  const hoy = new Date().getFullYear()
  const cursos = [hoy - 3, hoy - 2, hoy - 1, hoy].map((a) => ({ value: String(a), label: etiquetaCurso(a) }))

  return (
    <Paper withBorder p="md">
      <Stack>
        <div>
          <Group gap="xs">
            <IconFileTypeDocx size={20} />
            <Title order={4}>Informe de seguimiento semestral (CEN19) en Word</Title>
          </Group>
          <Text size="sm" c="dimmed">
            Genera el bloque del semestre con la plantilla de la EPS: titulación, análisis de tasas (si aportas el Excel de
            tasas por asignatura), estado de las acciones del plan del curso y acciones ya propuestas para el siguiente. El
            resto de apartados, el nombre del coordinador/a y la fecha se completan a mano.
          </Text>
        </div>

        <Group align="flex-end" gap="md">
          <Select label="Curso analizado" w={150} data={cursos} value={String(anyo)} allowDeselect={false} onChange={(x) => x && setAnyo(Number(x))} />
          <div>
            <Text size="sm" fw={500} mb={4}>Semestre</Text>
            <SegmentedControl
              value={bloqueEfectivo}
              onChange={(x) => setBloque(x as 'primero' | 'segundo')}
              data={[
                { value: 'primero', label: 'Primer semestre', disabled: sinPrimerSemestre },
                { value: 'segundo', label: 'Segundo semestre' },
              ]}
            />
          </div>
        </Group>
        {sinPrimerSemestre && (
          <Text size="xs" c="dimmed">La titulación no tiene asignaturas de primer semestre: el informe corresponde al segundo (curso completo).</Text>
        )}

        <FileInput
          label="Excel de tasas por asignatura (opcional)"
          description="Exportación «Tasas de Éxito, Rendimiento y No presentados por Asignatura» de la titulación. Se analiza en el navegador y no se guarda."
          placeholder="Selecciona el fichero .xlsx"
          accept=".xlsx"
          leftSection={<IconFileSpreadsheet size={18} />}
          value={fichero}
          onChange={leer}
          clearable
          maw={560}
        />
        {errorFichero && <Alert color="red">{errorFichero}</Alert>}
        {otraTitulacion && (
          <Alert color="red" title="El fichero es de otra titulación">
            El Excel corresponde a «{tasas!.titulacion}» y este plan es «{titulacion.nombre}». No se incluirá en el informe.
          </Alert>
        )}
        {errorAnalisis && !otraTitulacion && <Alert color="red">{errorAnalisis}</Alert>}

        {analisis && !otraTitulacion && (
          <Stack gap="xs">
            <Group gap="xs">
              <Badge variant="light">Cursos: {analisis.cursos.join(', ')}</Badge>
              <Badge variant="light">{analisis.tablas.reduce((n, t) => n + t.filas.length, 0)} asignaturas</Badge>
              <Badge variant="light" color={analisis.totalDestacadas ? 'orange' : 'green'}>
                {analisis.totalDestacadas} con valores destacados
              </Badge>
            </Group>
            {analisis.avisos.map((x) => <Alert key={x} color="yellow" variant="light">{x}</Alert>)}
            {aspectos.length > 0 && (
              <List size="sm" spacing={2}>
                {aspectos.map((s) => <List.Item key={s}>{s}</List.Item>)}
              </List>
            )}
            <UnstyledButton onClick={() => setVerTablas((x) => !x)}>
              <Group gap={4}>
                {verTablas ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                <Text size="sm">Ver las tablas de tasas</Text>
              </Group>
            </UnstyledButton>
            <Collapse expanded={verTablas}>
              <VistaPrevia a={analisis} />
            </Collapse>
          </Stack>
        )}

        {vencidas.length > 0 && (
          <Alert color="orange" icon={<IconAlertTriangle size={18} />} title="Acciones pendientes con la fecha de fin ya pasada">
            <Text size="sm" mb={4}>
              Conviene registrar su nueva fecha prevista («Registrar seguimiento») antes de generar el informe:
            </Text>
            <List size="sm">
              {vencidas.map((a) => (
                <List.Item key={a.id}>
                  <Anchor component={Link} to={`/gestion/${titulacion.codigo}/accion/${a.id}`} size="sm">{a.codigo}</Anchor>{' '}
                  {a.nombre} (fin: {fechaCorta(a.fecha_fin)})
                </List.Item>
              ))}
            </List>
          </Alert>
        )}

        <Group>
          <Button leftSection={<IconFileTypeDocx size={16} />} onClick={generar} loading={generando}>
            Generar informe {bloqueEfectivo === 'primero' ? 'del primer' : 'del segundo'} semestre {cursoTxt}
          </Button>
          {!tasas && <Text size="xs" c="dimmed">Sin Excel de tasas, el apartado de indicadores queda para completarlo a mano.</Text>}
        </Group>

        <UnstyledButton onClick={() => setVerCriterios((x) => !x)}>
          <Group gap={4}>
            {verCriterios ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
            <Text size="xs" c="dimmed">Criterios para destacar tasas</Text>
          </Group>
        </UnstyledButton>
        <Collapse expanded={verCriterios}>
          <Criterios editable={esAdmin} />
        </Collapse>
      </Stack>
    </Paper>
  )
}
