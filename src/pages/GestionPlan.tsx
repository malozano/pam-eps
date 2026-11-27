import {
  ActionIcon, Alert, Anchor, Badge, Button, Chip, Group, Menu, Select, Skeleton, Stack, Switch, Text,
  TextInput, Title, Tooltip,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconChevronDown, IconExternalLink, IconFileExport, IconFileTypeDocx, IconFileImport, IconFileSpreadsheet, IconPencil, IconPlus,
  IconReportAnalytics, IconSearch,
} from '@tabler/icons-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { estaInstalada } from '../components/Pwa'
import { ListaAcciones } from '../components/ListaAcciones'
import { ProgresoRevision } from '../components/Revision'
import { anyoPorDefecto, etiquetaCurso } from '../lib/cursos'
import { normalizar } from '../lib/importacion'
import { filtrosGuardados, guardarFiltros, guardarScroll, scrollGuardado } from '../lib/memoriaVista'
import { ambitoDe, usePorRevisar } from '../lib/revision'
import { enPlanDelCurso } from '../lib/seguimiento'
import { ESTADOS, type EstadoAccion } from '../lib/tipos'
import { descargar, generarExcel, nombreFichero } from '../lib/exportacion'
import { fechasFinalizacion } from '../lib/historial'
import { cargarPlantillaWord, datosPlanWord, generarWord, nombreFicheroWord } from '../lib/word'
import { useAccionesTitulacion, useResponsables } from '../lib/useCatalogos'
import { useTitulaciones } from '../lib/useTitulaciones'

/**
 * Plan de una titulación. Los filtros se guardan en la URL (?curso=2026&estado=…&q=…&cerradas=1)
 * para poder compartir o recargar la vista, y se recuerdan durante la sesión (junto con la
 * posición de desplazamiento) para volver al listado tal como se dejó.
 */
export function GestionPlan() {
  const { codigo = '' } = useParams()
  const { t } = useTranslation()
  const { esAdmin, titulaciones } = useAuth()
  const { data: tits } = useTitulaciones()
  const { data: acciones = [], isLoading, error } = useAccionesTitulacion(codigo)
  const tipoPlan = tits?.find((x) => x.codigo === codigo)?.tipo
  const { data: responsables = [] } = useResponsables(
    tipoPlan === undefined ? undefined : tipoPlan === 'centro' ? 'centro' : 'titulacion',
  )
  const [params, setParams] = useSearchParams()

  // Los filtros viven en el estado de la página (respuesta inmediata) y se copian a la URL.
  // Si se llega sin filtros en la URL (enlace «← Plan», menú…), se recuperan los últimos usados.
  const [filtros, setFiltros] = useState(() => {
    const p = params.toString() ? params : new URLSearchParams(filtrosGuardados(codigo) ?? '')
    return {
      curso: p.get('curso') ?? String(anyoPorDefecto()), // 'todos' o año
      estados: (p.get('estado')?.split(',').filter(Boolean) ?? []) as EstadoAccion[],
      q: p.get('q') ?? '',
      cerradas: p.get('cerradas') === '1',
      revision: p.get('revision') === '1',
    }
  })
  const { curso, estados, q, cerradas: verCerradas, revision: soloPorRevisar } = filtros
  const rev = usePorRevisar(codigo, ambitoDe(codigo))
  const verPorRevisar = soloPorRevisar && !!rev.revision
  const setVerCerradas = (v: boolean) => actualizar('cerradas', v)
  useEffect(() => {
    const p = new URLSearchParams()
    if (curso !== String(anyoPorDefecto())) p.set('curso', curso)
    if (estados.length) p.set('estado', estados.join(','))
    if (q) p.set('q', q)
    if (verCerradas && curso === 'todos') p.set('cerradas', '1')
    if (soloPorRevisar) p.set('revision', '1')
    guardarFiltros(codigo, p.toString())
    if (p.toString() !== params.toString()) setParams(p, { replace: true })
  }, [codigo, curso, estados, q, verCerradas, soloPorRevisar, params, setParams])

  // Posición de desplazamiento: se guarda al salir del listado (antes de que la página nueva la
  // modifique) y se restaura al volver, cuando ya hay datos
  // (solo una vez restaurada: evita guardar 0 si la página se desmonta mientras carga)
  const listo = useRef(false)
  useLayoutEffect(
    () => () => {
      if (listo.current) guardarScroll(codigo, window.scrollY)
    },
    [codigo],
  )
  useEffect(() => {
    if (isLoading || listo.current) return
    const y = scrollGuardado(codigo)
    requestAnimationFrame(() => {
      if (y > 0) window.scrollTo(0, y)
      listo.current = true
    })
  }, [isLoading, codigo])
  const actualizar = <K extends keyof typeof filtros>(clave: K, valor: (typeof filtros)[K]) =>
    setFiltros((f) => ({ ...f, [clave]: valor }))

  const anyos = useMemo(() => {
    const s = new Set(acciones.map((a) => a.anyo))
    s.add(anyoPorDefecto())
    s.add(anyoPorDefecto() + 1)
    return Array.from(s).sort((a, b) => b - a)
  }, [acciones])

  const filtradas = useMemo(() => {
    const nq = normalizar(q)
    return acciones.filter(
      (a) =>
        // «Solo por revisar» muestra todas las pendientes de la revisión, sea cual sea su curso
        (verPorRevisar
          ? rev.porRevisar.has(a.id)
          : curso === 'todos' ? verCerradas || !a.cerrada : enPlanDelCurso(a, Number(curso))) &&
        (estados.length === 0 || estados.includes(a.estado)) &&
        (!nq || normalizar(`${a.codigo} ${a.nombre} ${a.tareas ?? ''} ${a.responsable ?? ''}`).includes(nq)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acciones, curso, estados, q, verCerradas, verPorRevisar, rev.porRevisar.size, rev.revisadas])

  if (!esAdmin && !titulaciones.includes(codigo)) return <Navigate to="/" replace />
  const tit = tits?.find((x) => x.codigo === codigo)
  const urlPublica = `${window.location.origin}${import.meta.env.BASE_URL}plan/${codigo}${curso !== 'todos' ? `/${curso}` : ''}`

  async function exportar() {
    try {
      const anyo = curso === 'todos' ? null : Number(curso)
      const buf = await generarExcel(filtradas, {
        titulacion: codigo, nombreTitulacion: tit?.nombre ?? codigo, anyo, responsables,
      })
      descargar(buf, nombreFichero(codigo, anyo))
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se ha podido exportar', message: String(e) })
    }
  }
  // Plan en Word con la plantilla oficial (para publicar): curso seleccionado o, con «Todas», el actual
  const anyoWord = curso === 'todos' ? anyoPorDefecto() : Number(curso)
  async function exportarWord() {
    if (!tit) return
    try {
      // Fecha en que cada acción se completó o canceló (para reconstruir el plan del curso anterior)
      const finalizadas = await fechasFinalizacion(acciones.map((a) => a.id))
      const blob = await generarWord(await cargarPlantillaWord(), datosPlanWord(acciones, tit, anyoWord, finalizadas))
      descargar(blob, nombreFicheroWord(codigo, anyoWord))
    } catch (e) {
      notifications.show({ color: 'red', title: 'No se ha podido generar el Word', message: e instanceof Error ? e.message : String(e) })
    }
  }

  const ocultasCerradas = curso === 'todos' && !verCerradas ? acciones.filter((a) => a.cerrada).length : 0

  return (
    <Stack>
      <Anchor component={Link} to="/planes" size="sm">
        ← {t('nav.planes')}
      </Anchor>
      <Group justify="space-between" align="flex-end">
        <div>
          <Badge variant="light">{codigo}</Badge>
          <Title order={2}>{tit?.nombre ?? codigo}</Title>
        </div>
        <Group gap="xs">
          <Menu position="bottom-end">
            <Menu.Target>
              <Button variant="default" leftSection={<IconFileSpreadsheet size={16} />} rightSection={<IconChevronDown size={14} />}>
                Excel y publicación
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconFileExport size={16} />} onClick={exportar} disabled={!filtradas.length}>
                Exportar a Excel ({filtradas.length} {filtradas.length === 1 ? 'acción' : 'acciones'} mostradas)
              </Menu.Item>
              <Menu.Item leftSection={<IconFileTypeDocx size={16} />} onClick={exportarWord} disabled={!tit}>
                Plan en Word para publicar ({etiquetaCurso(anyoWord)})
              </Menu.Item>
              <Menu.Item leftSection={<IconFileImport size={16} />} component={Link} to={`/gestion/${codigo}/importar`}>
                Importar desde Excel
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item leftSection={<IconExternalLink size={16} />} component="a" href={urlPublica} target={estaInstalada() ? undefined : '_blank'} rel="noopener">
                Ver plan publicado{curso !== 'todos' ? ` ${etiquetaCurso(Number(curso))}` : ''}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <Button component={Link} to={`/gestion/${codigo}/informe`} variant="default" leftSection={<IconReportAnalytics size={16} />}>
            Informe de seguimiento
          </Button>
          <Button component={Link} to={`/gestion/${codigo}/nueva`} leftSection={<IconPlus size={16} />}>
            Nueva acción
          </Button>
        </Group>
      </Group>

      {rev.revision && rev.filas.length > 0 && (
        <ProgresoRevision revision={rev.revision} total={rev.filas.length} revisadas={rev.revisadas}>
          <Switch
            label="Solo por revisar"
            checked={soloPorRevisar}
            onChange={(e) => actualizar('revision', e.currentTarget.checked)}
          />
        </ProgresoRevision>
      )}

      <Group align="flex-end" gap="md">
        <Select
          label="Curso"
          w={220}
          disabled={verPorRevisar}
          allowDeselect={false}
          value={curso}
          onChange={(v) => v && actualizar('curso', v)}
          data={[
            ...anyos.map((a) => ({ value: String(a), label: `Plan ${etiquetaCurso(a)}` })),
            { value: 'todos', label: 'Todas las acciones' },
          ]}
        />
        <TextInput
          label="Buscar"
          placeholder="Código, texto o responsable"
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={(e) => actualizar('q', e.currentTarget.value)}
          w={260}
        />
        <Chip.Group multiple value={estados} onChange={(v) => actualizar('estados', v as EstadoAccion[])}>
          <Group gap={6} pb={4}>
            {ESTADOS.map((e) => (
              <Chip key={e} value={e} size="sm">
                {t(`estado.${e}`)}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        {curso === 'todos' && (
          <Switch
            pb={8}
            label="Mostrar cerradas"
            checked={verCerradas}
            onChange={(e) => setVerCerradas(e.currentTarget.checked)}
          />
        )}
      </Group>
      {curso !== 'todos' && !verPorRevisar && (
        <Text size="sm" c="dimmed">
          Acciones del curso {etiquetaCurso(Number(curso))} y de cursos anteriores que siguen pendientes o en proceso.
        </Text>
      )}

      {error && <Alert color="red">{(error as Error).message}</Alert>}
      {isLoading ? (
        <Skeleton h={200} />
      ) : acciones.length === 0 ? (
        <Alert color="blue">
          Este plan todavía no tiene acciones. Crea una con «Nueva acción» o importa el Excel actual.
        </Alert>
      ) : filtradas.length === 0 ? (
        verPorRevisar ? (
          <Alert color="green">No queda ninguna acción por revisar en este plan.</Alert>
        ) : (
          <Alert color="gray">Ninguna acción cumple los filtros.</Alert>
        )
      ) : (
        <ListaAcciones
          acciones={filtradas}
          verResponsable
          verIndicadores
          avisosDatos
          cursoReferencia={curso !== 'todos' ? Number(curso) : undefined}
          minWidth={980}
          extra={(a) => (
            <Tooltip label="Editar">
              <ActionIcon variant="subtle" component={Link} to={`/gestion/${codigo}/accion/${a.id}/editar`} aria-label={`Editar ${a.codigo}`}>
                <IconPencil size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        />
      )}
      {filtradas.length > 0 && (
        <Text size="sm" c="dimmed">
          {filtradas.length} {filtradas.length === 1 ? 'acción' : 'acciones'}
          {ocultasCerradas > 0 && ` · ${ocultasCerradas} cerradas ocultas`}
        </Text>
      )}
    </Stack>
  )
}
