import {
  Alert, Anchor, Badge, Button, Chip, CopyButton, Group, MultiSelect, Paper, SegmentedControl, Select, SimpleGrid, Skeleton, Stack,
  Switch, Table, Tabs, Text, TextInput, Title, Tooltip, UnstyledButton,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import {
  IconArrowsSort, IconCheck, IconChartBar, IconClipboardCheck, IconCopy, IconFileExport, IconFilter, IconListCheck, IconSearch, IconSortAscending,
  IconSortDescending,
} from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { EstadoBadge } from '../../components/EstadoBadge'
import { SituacionBadge } from '../../components/SituacionBadge'
import {
  accionesPorResponsable, accionesPorTitulacionYCurso, estadoPlanPorTitulacion, ESTADOS_ORDEN, evolucionPorCurso,
  FILTROS_VACIOS, filtrarAcciones, pendientesPorResponsable, textoListado, type FiltrosConsulta,
} from '../../lib/consultas'
import { anyoPorDefecto, etiquetaCurso } from '../../lib/cursos'
import { descargar, generarExcel } from '../../lib/exportacion'
import { fechaCorta } from '../../lib/formato'
import { hoyISO, situacion, type Situacion } from '../../lib/seguimiento'
import { supabase } from '../../lib/supabase'
import { ESTADOS, type Accion, type EstadoAccion } from '../../lib/tipos'
import { useTitulaciones } from '../../lib/useTitulaciones'
import { RevisionEstado } from './RevisionEstado'

/** Colores de los estados en los gráficos (paleta validada; mismo significado que las insignias). */
const COLOR_ESTADO: Record<EstadoAccion, string> = {
  completada: '#1baf7a',
  en_proceso: '#2a78d6',
  pendiente: '#eda100',
  cancelada: '#e34948',
}
/** Rampa secuencial (azul) para la tabla de acciones por titulación y curso */
const RAMPA = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281']

const urlApp = () => `${window.location.origin}${import.meta.env.BASE_URL}`

function useTodasLasAcciones() {
  return useQuery({
    queryKey: ['acciones', 'todas'],
    queryFn: async () => {
      const { data, error } = await supabase.from('acciones').select('*').order('titulacion').order('anyo').order('numero')
      if (error) throw error
      return data as Accion[]
    },
  })
}

// ---------------------------------------------------------------------------------------------
// Pendientes por responsable
// ---------------------------------------------------------------------------------------------
function PendientesPorResponsable({ acciones }: { acciones: Accion[] }) {
  const { data: tits = [] } = useTitulaciones()
  const [planes, setPlanes] = useState<string[]>(['CEN'])
  const ambito = planes.length ? acciones.filter((a) => planes.includes(a.titulacion)) : acciones
  const porPlan = planes.length !== 1
  const grupos = useMemo(() => pendientesPorResponsable(ambito, porPlan), [ambito, porPlan])
  const nombre = (c: string) => tits.find((t) => t.codigo === c)?.nombre ?? c
  const todo = grupos.map((g) => textoListado(g, urlApp())).join('\n\n\n')

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Acciones abiertas (pendientes o en proceso) agrupadas por responsable, con las de plazo vencido primero. Copia el
        listado de cada responsable para enviárselo por correo y preguntar por su estado.
      </Text>
      <Group align="flex-end">
        <MultiSelect
          label="Planes"
          placeholder={planes.length ? '' : 'Todos los planes'}
          data={tits.map((t) => ({ value: t.codigo, label: `${t.codigo} · ${t.nombre}` }))}
          value={planes}
          onChange={setPlanes}
          searchable
          clearable
          w={420}
        />
        <Button variant="default" size="sm" onClick={() => setPlanes(['CEN'])}>Plan del centro</Button>
        <Button variant="default" size="sm" onClick={() => setPlanes([])}>Todos los planes</Button>
        {grupos.length > 1 && (
          <CopyButton value={todo}>
            {({ copied, copy }) => (
              <Button size="sm" variant="light" color={copied ? 'green' : undefined} leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />} onClick={copy}>
                {copied ? 'Copiados' : 'Copiar todos los listados'}
              </Button>
            )}
          </CopyButton>
        )}
      </Group>
      {grupos.length === 0 && <Alert color="green">No hay acciones abiertas en {planes.length === 1 ? 'este plan' : 'estos planes'}.</Alert>}
      {grupos.map((g) => (
        <Paper key={g.clave} withBorder p="md">
          <Group justify="space-between" mb="xs" align="flex-start">
            <div>
              <Group gap="xs">
                <Text fw={600}>{g.responsable}</Text>
                {g.titulacion && <Badge variant="light">{g.titulacion}</Badge>}
              </Group>
              {g.titulacion && <Text size="xs" c="dimmed">{nombre(g.titulacion)}</Text>}
            </div>
            <Group gap="xs">
              <Badge variant="light" color="gray">{g.acciones.length === 1 ? '1 abierta' : `${g.acciones.length} abiertas`}</Badge>
              {g.vencidas > 0 && <Badge color="red">{g.vencidas === 1 ? '1 vencida' : `${g.vencidas} vencidas`}</Badge>}
              <CopyButton value={textoListado(g, urlApp())}>
                {({ copied, copy }) => (
                  <Button size="xs" variant={copied ? 'light' : 'default'} color={copied ? 'green' : undefined} leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />} onClick={copy}>
                    {copied ? 'Copiado' : 'Copiar listado'}
                  </Button>
                )}
              </CopyButton>
            </Group>
          </Group>
          <Table.ScrollContainer minWidth={620}>
            <Table verticalSpacing={4} fz="sm">
              <Table.Tbody>
                {g.acciones.map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td w={150}>
                      <Anchor component={Link} to={`/gestion/${a.titulacion}/accion/${a.id}`} ff="monospace" size="sm">{a.codigo}</Anchor>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={2}>{a.nombre}</Text>
                      <SituacionBadge accion={a} />
                    </Table.Td>
                    <Table.Td w={190} style={{ whiteSpace: 'nowrap' }}>{fechaCorta(a.fecha_inicio)} – {fechaCorta(a.fecha_fin)}</Table.Td>
                    <Table.Td w={120}><EstadoBadge estado={a.estado} /></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      ))}
    </Stack>
  )
}

// ---------------------------------------------------------------------------------------------
// Consulta con filtros
// ---------------------------------------------------------------------------------------------
type Columna = 'codigo' | 'titulacion' | 'nombre' | 'responsable' | 'fecha_inicio' | 'fecha_fin' | 'estado' | 'situacion'
type Agrupacion = 'ninguna' | 'titulacion' | 'responsable' | 'estado' | 'anyo'
const ORDEN_SITUACION: Record<Situacion, number> = { vencida: 0, vence_pronto: 1, sin_iniciar: 2, proxima: 3, en_plazo: 4, finalizada: 5 }
const SITUACIONES: { value: Situacion; label: string }[] = [
  { value: 'vencida', label: 'Vencida' },
  { value: 'vence_pronto', label: 'Vence pronto (60 días)' },
  { value: 'sin_iniciar', label: 'Debería haber empezado' },
  { value: 'proxima', label: 'Empieza pronto' },
  { value: 'en_plazo', label: 'En plazo' },
  { value: 'finalizada', label: 'Completada o cancelada' },
]

function Consulta({ acciones }: { acciones: Accion[] }) {
  const { t } = useTranslation()
  const { data: tits = [] } = useTitulaciones()
  const [f, setF] = useState<FiltrosConsulta>(FILTROS_VACIOS)
  const [orden, setOrden] = useState<{ col: Columna; asc: boolean }>({ col: 'fecha_fin', asc: true })
  const [agrupar, setAgrupar] = useState<Agrupacion>('ninguna')
  const set = <K extends keyof FiltrosConsulta>(k: K, v: FiltrosConsulta[K]) => setF((x) => ({ ...x, [k]: v }))
  const hoy = hoyISO()

  const anyos = [...new Set(acciones.map((a) => a.anyo))].sort((a, b) => b - a)
  const responsables = [...new Set(acciones.map((a) => a.responsable).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'es'))
  const resultado = useMemo(() => {
    const valor = (a: Accion): string | number => {
      if (orden.col === 'situacion') return ORDEN_SITUACION[situacion(a, hoy)]
      if (orden.col === 'estado') return ESTADOS.indexOf(a.estado)
      return (a[orden.col] ?? '') as string
    }
    return filtrarAcciones(acciones, f, hoy).sort((x, y) => {
      const c = typeof valor(x) === 'number' ? (valor(x) as number) - (valor(y) as number) : String(valor(x)).localeCompare(String(valor(y)), 'es')
      return (orden.asc ? c : -c) || x.codigo.localeCompare(y.codigo)
    })
  }, [acciones, f, orden, hoy])

  const claveGrupo = (a: Accion) =>
    agrupar === 'titulacion' ? `${a.titulacion} · ${tits.find((x) => x.codigo === a.titulacion)?.nombre ?? ''}`
    : agrupar === 'responsable' ? a.responsable ?? 'Sin responsable asignado'
    : agrupar === 'estado' ? t(`estado.${a.estado}`)
    : agrupar === 'anyo' ? `Curso ${etiquetaCurso(a.anyo)}`
    : ''
  const grupos = useMemo(() => {
    if (agrupar === 'ninguna') return [['', resultado] as const]
    const m = new Map<string, Accion[]>()
    for (const a of resultado) m.set(claveGrupo(a), [...(m.get(claveGrupo(a)) ?? []), a])
    return [...m.entries()].sort(([x], [y]) => x.localeCompare(y, 'es'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado, agrupar])

  const cab = (col: Columna, texto: string, w?: number) => (
    <Table.Th w={w}>
      <UnstyledButton onClick={() => setOrden((o) => ({ col, asc: o.col === col ? !o.asc : true }))}>
        <Group gap={2} wrap="nowrap">
          <Text size="sm" fw={600}>{texto}</Text>
          {orden.col === col ? (orden.asc ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />) : <IconArrowsSort size={14} opacity={0.3} />}
        </Group>
      </UnstyledButton>
    </Table.Th>
  )

  async function exportar() {
    const buf = await generarExcel(resultado, { titulacion: 'consulta', nombreTitulacion: 'Consulta de acciones', anyo: null, responsables })
    descargar(buf, `consulta-acciones-${hoy}.xlsx`)
  }

  return (
    <Stack>
      <Paper withBorder p="md">
        <Group gap={6} mb="sm"><IconFilter size={16} /><Text fw={600} size="sm">Filtros</Text></Group>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
          <MultiSelect label="Titulaciones" placeholder="Todas" searchable clearable value={f.titulaciones} onChange={(v) => set('titulaciones', v)}
            data={tits.map((x) => ({ value: x.codigo, label: `${x.codigo} · ${x.nombre}` }))} />
          <MultiSelect label="Curso de la acción" placeholder="Todos" clearable value={f.anyos.map(String)} onChange={(v) => set('anyos', v.map(Number))}
            data={anyos.map((x) => ({ value: String(x), label: etiquetaCurso(x) }))} />
          <MultiSelect label="Responsable" placeholder="Todos" searchable clearable value={f.responsables} onChange={(v) => set('responsables', v)} data={responsables} />
          <MultiSelect label="Situación del plazo" placeholder="Todas" clearable value={f.situaciones} onChange={(v) => set('situaciones', v as Situacion[])} data={SITUACIONES} />
          <DatePickerInput type="range" label="Activas entre" placeholder="Cualquier fecha" valueFormat="DD/MM/YYYY" clearable
            value={[f.desde, f.hasta]} onChange={([d, h]) => setF((x) => ({ ...x, desde: d, hasta: h }))} />
          <TextInput label="Texto" placeholder="Código, nombre, tareas, observaciones…" leftSection={<IconSearch size={16} />} value={f.texto} onChange={(e) => set('texto', e.currentTarget.value)} />
          <Stack gap={6} justify="flex-end">
            <Switch label="Solo acciones de mejora" checked={f.soloMejora} onChange={(e) => set('soloMejora', e.currentTarget.checked)} />
            <Switch label="Incluir las cerradas" checked={f.incluirCerradas} onChange={(e) => set('incluirCerradas', e.currentTarget.checked)} />
          </Stack>
          <Select label="Agrupar por" allowDeselect={false} value={agrupar} onChange={(v) => setAgrupar(v as Agrupacion)}
            data={[{ value: 'ninguna', label: 'Sin agrupar' }, { value: 'titulacion', label: 'Titulación' }, { value: 'responsable', label: 'Responsable' }, { value: 'estado', label: 'Estado' }, { value: 'anyo', label: 'Curso de la acción' }]} />
        </SimpleGrid>
        <Group mt="sm" gap={6}>
          <Text size="sm" fw={500}>Estado:</Text>
          <Chip.Group multiple value={f.estados} onChange={(v) => set('estados', v as EstadoAccion[])}>
            <Group gap={6}>{ESTADOS.map((e) => <Chip key={e} value={e} size="xs">{t(`estado.${e}`)}</Chip>)}</Group>
          </Chip.Group>
          <Button size="xs" variant="subtle" ml="auto" onClick={() => setF(FILTROS_VACIOS)}>Quitar filtros</Button>
        </Group>
      </Paper>

      <Group justify="space-between">
        <Text size="sm" fw={500}>{resultado.length === 1 ? '1 acción' : `${resultado.length} acciones`}</Text>
        <Button size="xs" variant="default" leftSection={<IconFileExport size={14} />} disabled={!resultado.length} onClick={exportar}>
          Exportar a Excel
        </Button>
      </Group>
      {resultado.length > 0 && (
        <Table.ScrollContainer minWidth={980}>
          <Table striped highlightOnHover verticalSpacing={4} fz="sm">
            <Table.Thead>
              <Table.Tr>
                {cab('codigo', 'Código', 150)}
                {cab('nombre', 'Acción')}
                {cab('responsable', 'Responsable', 170)}
                {cab('fecha_inicio', 'Inicio', 95)}
                {cab('fecha_fin', 'Fin', 95)}
                {cab('estado', 'Estado', 120)}
                {cab('situacion', 'Plazo', 150)}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {grupos.map(([g, lista]) => [
                g ? (
                  <Table.Tr key={'g' + g}>
                    <Table.Td colSpan={7} bg="var(--mantine-color-gray-1)"><Text fw={600} size="sm">{g} <Text span c="dimmed" size="xs">({lista.length})</Text></Text></Table.Td>
                  </Table.Tr>
                ) : null,
                ...lista.map((a) => (
                  <Table.Tr key={a.id}>
                    <Table.Td><Anchor component={Link} to={`/gestion/${a.titulacion}/accion/${a.id}`} ff="monospace" size="sm">{a.codigo}</Anchor></Table.Td>
                    <Table.Td><Text size="sm" lineClamp={2}>{a.nombre}</Text></Table.Td>
                    <Table.Td>{a.responsable ?? '—'}</Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(a.fecha_inicio)}</Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{fechaCorta(a.fecha_fin)}</Table.Td>
                    <Table.Td><EstadoBadge estado={a.estado} /></Table.Td>
                    <Table.Td><SituacionBadge accion={a} /></Table.Td>
                  </Table.Tr>
                )),
              ])}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Stack>
  )
}

// ---------------------------------------------------------------------------------------------
// Estadísticas
// ---------------------------------------------------------------------------------------------
/** Barra apilada horizontal: segmentos con 2px de separación, extremos redondeados y tooltip. */
function BarraEstados({ valores, total, etiqueta }: { valores: Record<EstadoAccion, number>; total: number; etiqueta: string }) {
  const { t } = useTranslation()
  const segs = ESTADOS_ORDEN.filter((e) => valores[e] > 0)
  return (
    <div style={{ display: 'flex', gap: 2, height: 12, width: '100%', minWidth: 120 }} role="img" aria-label={`${etiqueta}: ${segs.map((e) => `${t(`estado.${e}`)} ${valores[e]}`).join(', ')}`}>
      {segs.map((e, i) => (
        <Tooltip key={e} label={`${etiqueta} · ${t(`estado.${e}`)}: ${valores[e]} (${Math.round((valores[e] / total) * 100)} %)`} withArrow>
          <div style={{
            flex: valores[e], background: COLOR_ESTADO[e], minWidth: 4,
            borderTopLeftRadius: i === 0 ? 4 : 0, borderBottomLeftRadius: i === 0 ? 4 : 0,
            borderTopRightRadius: i === segs.length - 1 ? 4 : 0, borderBottomRightRadius: i === segs.length - 1 ? 4 : 0,
          }} />
        </Tooltip>
      ))}
    </div>
  )
}

function Leyenda() {
  const { t } = useTranslation()
  return (
    <Group gap="md">
      {ESTADOS_ORDEN.map((e) => (
        <Group key={e} gap={6}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: COLOR_ESTADO[e] }} />
          <Text size="xs">{t(`estado.${e}`)}</Text>
        </Group>
      ))}
    </Group>
  )
}

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <Paper withBorder p="md">
      <Title order={4}>{titulo}</Title>
      {ayuda && <Text size="sm" c="dimmed" mb="sm">{ayuda}</Text>}
      {children}
    </Paper>
  )
}

function Estadisticas({ acciones: todas }: { acciones: Accion[] }) {
  const { t } = useTranslation()
  const { data: tits = [] } = useTitulaciones()
  const [soloMejora, setSoloMejora] = useState(true)
  const [anyo, setAnyo] = useState(anyoPorDefecto())
  const [ambitoResp, setAmbitoResp] = useState<'centro' | 'titulaciones' | 'todos'>('centro')
  const [cursoResp, setCursoResp] = useState('todos')
  const acciones = soloMejora ? todas.filter((a) => a.es_mejora) : todas
  const orden = (c: string) => tits.findIndex((x) => x.codigo === c)
  const nombre = (c: string) => tits.find((x) => x.codigo === c)?.nombre ?? c

  const estado = [...estadoPlanPorTitulacion(acciones, anyo).entries()].sort(([a], [b]) => orden(a) - orden(b))
  const accionesResp = acciones.filter(
    (a) =>
      (ambitoResp === 'todos' || (a.titulacion === 'CEN') === (ambitoResp === 'centro')) &&
      (cursoResp === 'todos' || a.anyo === Number(cursoResp)),
  )
  const resp = accionesPorResponsable(accionesResp)
  const maxResp = Math.max(1, ...resp.map((r) => r.total))
  const deTitulaciones = accionesResp.filter((a) => a.titulacion !== 'CEN')
  const propias = deTitulaciones.filter((a) => a.responsable === 'Coordinación titulación').length
  const matriz = accionesPorTitulacionYCurso(acciones)
  const evol = evolucionPorCurso(acciones)
  const anyos = [...new Set(todas.map((a) => a.anyo))].sort((a, b) => b - a)

  const celdaRampa = (v: number) => {
    if (!v) return { bg: undefined, color: 'var(--mantine-color-dimmed)' }
    const i = Math.min(RAMPA.length - 1, Math.round(((v - 1) / Math.max(1, matriz.max - 1)) * (RAMPA.length - 1)))
    return { bg: RAMPA[i], color: i >= 6 ? '#ffffff' : '#0b0b0b' }
  }

  return (
    <Stack>
      <Group>
        <Switch label="Solo acciones de mejora" checked={soloMejora} onChange={(e) => setSoloMejora(e.currentTarget.checked)} />
      </Group>

      <Bloque titulo={`Estado del plan ${etiquetaCurso(anyo)} por titulación`} ayuda="Acciones del curso y de cursos anteriores que siguen abiertas (mismo criterio que el plan publicado).">
        <Group justify="space-between" mb="xs">
          <Select size="xs" w={150} allowDeselect={false} value={String(anyo)} onChange={(v) => v && setAnyo(Number(v))}
            data={anyos.map((x) => ({ value: String(x), label: `Plan ${etiquetaCurso(x)}` }))} />
          <Leyenda />
        </Group>
        <Table.ScrollContainer minWidth={760}>
          <Table verticalSpacing={4} fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Titulación</Table.Th>
                <Table.Th w="32%">Distribución</Table.Th>
                {ESTADOS_ORDEN.map((e) => <Table.Th key={e} ta="right">{t(`estado.${e}`)}</Table.Th>)}
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th ta="right">Vencidas</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {estado.map(([tit, r]) => (
                <Table.Tr key={tit}>
                  <Table.Td><Tooltip label={nombre(tit)}><Text size="sm" fw={500}>{tit}</Text></Tooltip></Table.Td>
                  <Table.Td><BarraEstados valores={r} total={r.total} etiqueta={tit} /></Table.Td>
                  {ESTADOS_ORDEN.map((e) => <Table.Td key={e} ta="right">{r[e] || '—'}</Table.Td>)}
                  <Table.Td ta="right" fw={600}>{r.total}</Table.Td>
                  <Table.Td ta="right">{r.vencidas ? <Badge color="red" size="sm">{r.vencidas}</Badge> : '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {!estado.length && <Text size="sm" c="dimmed">No hay acciones en el plan de este curso.</Text>}
      </Bloque>

      <Bloque titulo="Acciones por responsable" ayuda="Reparto de las acciones por rol responsable. En el plan del centro cada rol corresponde a una persona o servicio; en los de las titulaciones, el mismo rol lo ocupa una persona distinta en cada titulación. El curso es aquel para el que se propuso la acción.">
        <Group mb="sm" gap="sm" align="center">
          <SegmentedControl size="xs" value={ambitoResp} onChange={(v) => setAmbitoResp(v as typeof ambitoResp)}
          data={[{ value: 'centro', label: 'Plan del centro' }, { value: 'titulaciones', label: 'Titulaciones' }, { value: 'todos', label: 'Todos' }]} />
          <Select size="xs" w={170} allowDeselect={false} aria-label="Curso" value={cursoResp} onChange={(v) => v && setCursoResp(v)}
            data={[{ value: 'todos', label: 'Todos los cursos' }, ...anyos.map((x) => ({ value: String(x), label: `Curso ${etiquetaCurso(x)}` }))]} />
        </Group>
        {resp.length === 0 && <Text size="sm" c="dimmed">No hay acciones con estos criterios.</Text>}
        {ambitoResp === 'titulaciones' && deTitulaciones.length > 0 && (
          <Alert variant="light" color="blue" mb="sm">
            En los planes de las titulaciones, {propias} de {deTitulaciones.length} acciones ({Math.round((propias / deTitulaciones.length) * 100)} %) tienen como responsable a «Coordinación titulación».
          </Alert>
        )}
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing={4} fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Responsable</Table.Th>
                <Table.Th w="35%">Acciones</Table.Th>
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th ta="right">Abiertas</Table.Th>
                <Table.Th ta="right">Vencidas</Table.Th>
                {ambitoResp !== 'centro' && <Table.Th ta="right">Planes</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {resp.map((r) => (
                <Table.Tr key={r.responsable}>
                  <Table.Td>{r.responsable}</Table.Td>
                  <Table.Td>
                    <Tooltip label={`${r.responsable}: ${r.total} acciones`} withArrow>
                      <div style={{ height: 12, width: `${(r.total / maxResp) * 100}%`, minWidth: 4, background: '#2a78d6', borderRadius: '0 4px 4px 0' }} />
                    </Tooltip>
                  </Table.Td>
                  <Table.Td ta="right" fw={600}>{r.total}</Table.Td>
                  <Table.Td ta="right">{r.abiertas || '—'}</Table.Td>
                  <Table.Td ta="right">{r.vencidas ? <Badge color="red" size="sm">{r.vencidas}</Badge> : '—'}</Table.Td>
                  {ambitoResp !== 'centro' && <Table.Td ta="right">{r.planes}</Table.Td>}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Bloque>

      <Bloque titulo="Acciones por titulación y curso" ayuda="Número de acciones según el curso para el que se propusieron (más oscuro, más acciones).">
        <Table.ScrollContainer minWidth={520}>
          <Table withTableBorder withColumnBorders verticalSpacing={4} fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Titulación</Table.Th>
                {matriz.cursos.map((c) => <Table.Th key={c} ta="center">{c}</Table.Th>)}
                <Table.Th ta="right">Total</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {[...matriz.filas.entries()].sort(([a], [b]) => orden(a) - orden(b)).map(([tit, f]) => (
                <Table.Tr key={tit}>
                  <Table.Td><Tooltip label={nombre(tit)}><Text size="sm" fw={500}>{tit}</Text></Tooltip></Table.Td>
                  {matriz.anyos.map((a) => {
                    const v = f[a] ?? 0
                    const c = celdaRampa(v)
                    return <Table.Td key={a} ta="center" bg={c.bg} c={c.color}>{v || '·'}</Table.Td>
                  })}
                  <Table.Td ta="right" fw={600}>{Object.values(f).reduce((x, y) => x + y, 0)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Bloque>

      <Bloque titulo="Evolución por curso" ayuda="Acciones propuestas para cada curso y su estado actual.">
        <Leyenda />
        <Table.ScrollContainer minWidth={700} mt="xs">
          <Table verticalSpacing={4} fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Curso</Table.Th>
                <Table.Th w="35%">Estado actual</Table.Th>
                {ESTADOS_ORDEN.map((e) => <Table.Th key={e} ta="right">{t(`estado.${e}`)}</Table.Th>)}
                <Table.Th ta="right">Total</Table.Th>
                <Table.Th ta="right">% completadas</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {evol.map((r) => (
                <Table.Tr key={r.anyo}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{r.curso}</Table.Td>
                  <Table.Td><BarraEstados valores={r} total={r.total} etiqueta={r.curso} /></Table.Td>
                  {ESTADOS_ORDEN.map((e) => <Table.Td key={e} ta="right">{r[e] || '—'}</Table.Td>)}
                  <Table.Td ta="right" fw={600}>{r.total}</Table.Td>
                  <Table.Td ta="right">{Math.round((r.completada / r.total) * 100)} %</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Bloque>
    </Stack>
  )
}

/** Consultas (administración): pendientes por responsable, consulta con filtros y estadísticas. */
export function Consultas() {
  const { data: acciones = [], isLoading, error } = useTodasLasAcciones()
  const [params, setParams] = useSearchParams()
  const pestanya = params.get('tab') ?? 'pendientes'
  return (
    <Stack maw={1200}>
      <div>
        <Title order={2}>Consultas</Title>
        <Text size="sm" c="dimmed">Acciones de todos los planes.</Text>
      </div>
      {error && <Alert color="red">{(error as Error).message}</Alert>}
      {isLoading ? (
        <Skeleton h={400} />
      ) : (
        <Tabs value={pestanya} onChange={(v) => setParams(v && v !== 'pendientes' ? { tab: v } : {}, { replace: true })} keepMounted={false}>
          <Tabs.List mb="md">
            <Tabs.Tab value="pendientes" leftSection={<IconListCheck size={16} />}>Pendientes por responsable</Tabs.Tab>
            <Tabs.Tab value="consulta" leftSection={<IconFilter size={16} />}>Consulta</Tabs.Tab>
            <Tabs.Tab value="estadisticas" leftSection={<IconChartBar size={16} />}>Estadísticas</Tabs.Tab>
            <Tabs.Tab value="revision" leftSection={<IconClipboardCheck size={16} />}>Revisión del estado</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="pendientes"><PendientesPorResponsable acciones={acciones} /></Tabs.Panel>
          <Tabs.Panel value="consulta"><Consulta acciones={acciones} /></Tabs.Panel>
          <Tabs.Panel value="estadisticas"><Estadisticas acciones={acciones} /></Tabs.Panel>
          <Tabs.Panel value="revision"><RevisionEstado acciones={acciones} /></Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  )
}
