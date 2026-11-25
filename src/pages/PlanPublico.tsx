import {
  ActionIcon, Alert, Anchor, Badge, Box, Button, Container, Group, Paper, Select, SimpleGrid, Skeleton, Stack, Text, Title,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconArrowLeft, IconDownload } from '@tabler/icons-react'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { EstadoBadge } from '../components/EstadoBadge'
import { estaInstalada } from '../components/Pwa'
import { ListaIndicadores } from '../components/ListaIndicadores'
import { TextoConEnlaces } from '../components/TextoConEnlaces'
import { cambiarIdioma, IDIOMAS } from '../i18n'
import { anyoPorDefecto, etiquetaCurso } from '../lib/cursos'
import { descargar, generarExcel, nombreFichero } from '../lib/exportacion'
import { fechaCorta } from '../lib/formato'
import { estaPublicado, usePublicacion } from '../lib/publicacion'
import { supabase } from '../lib/supabase'
import type { EstadoAccion, Titulacion } from '../lib/tipos'
import { ultimaRutaApp } from '../lib/memoriaVista'
import { useResponsables } from '../lib/useCatalogos'
import { useTitulaciones } from '../lib/useTitulaciones'

export interface FilaPlanPublico {
  codigo: string
  anyo: number
  numero: number
  nombre: string
  tareas: string | null
  responsable: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  indicadores: string[]
  origen: string | null
  estado: EstadoAccion
  presupuesto: number | null
  observaciones: string | null
}

/** Cursos que se pueden consultar: desde 2021-22 hasta el siguiente al actual. */
function cursosConsultables(): number[] {
  const r: number[] = []
  for (let a = anyoPorDefecto() + 1; a >= 2021; a--) r.push(a)
  return r
}

/**
 * Botón para volver a la aplicación de gestión: solo con sesión iniciada o en la aplicación
 * instalada (quien llega desde la web de la EPS no ve ningún acceso a la gestión).
 */
function VolverALaAplicacion() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const navigate = useNavigate()
  const movil = useMediaQuery('(max-width: 36em)')
  if (!session && !estaInstalada()) return null
  // Vuelve a la última página de gestión visitada (o al inicio)
  const volver = () => navigate(session ? (ultimaRutaApp() ?? '/') : '/')
  if (movil)
    return (
      <ActionIcon variant="light" size="lg" onClick={volver} aria-label={t('publico.volverApp')} title={t('publico.volverApp')}>
        <IconArrowLeft size={18} />
      </ActionIcon>
    )
  return (
    <Button size="xs" variant="light" leftSection={<IconArrowLeft size={14} />} onClick={volver}>
      {t('publico.volverApp')}
    </Button>
  )
}

function CabeceraPublica({ children }: { children?: ReactNode }) {
  const { t, i18n } = useTranslation()
  return (
    <Box component="header" py="sm" px="md" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
      <Container size="lg" px={0}>
        <Group justify="space-between" wrap="nowrap">
          <Anchor component={Link} to="/plan" c="inherit" underline="never" style={{ minWidth: 0 }}>
            <Text size="xs" c="dimmed">{t('app.centro')}</Text>
            <Text fw={700} lh={1.2}>{t('publico.planes')}</Text>
          </Anchor>
          <Group gap="xs" wrap="nowrap">
            <VolverALaAplicacion />
            {children}
            <Select
              size="xs"
              w={110}
              data={IDIOMAS.map((i) => ({ ...i }))}
              value={i18n.resolvedLanguage}
              onChange={(v) => v && cambiarIdioma(v)}
              allowDeselect={false}
              aria-label="Idioma / Idioma"
            />
          </Group>
        </Group>
      </Container>
    </Box>
  )
}

/** Índice público de planes: /plan */
export function IndicePlanes() {
  const { t } = useTranslation()
  const { data: titulaciones = [], isLoading } = useTitulaciones()
  const { data: publicacion, isLoading: cargandoPub } = usePublicacion()
  // solo los planes que la administración ha decidido publicar
  const activas = titulaciones.filter((x) => x.activa && estaPublicado(publicacion, x.tipo))
  const grupo = (titulo: string, lista: Titulacion[]) =>
    lista.length > 0 && (
      <Stack gap="xs">
        <Title order={4}>{titulo}</Title>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
          {lista.map((x) => (
            <Paper key={x.codigo} withBorder p="sm" component={Link} to={`/plan/${x.codigo}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              <Group gap="xs" wrap="nowrap">
                <Badge variant="light" style={{ flexShrink: 0 }}>{x.codigo}</Badge>
                <Text size="sm">{x.nombre}</Text>
              </Group>
            </Paper>
          ))}
        </SimpleGrid>
      </Stack>
    )
  return (
    <>
      <CabeceraPublica />
      <Container size="lg" py="lg">
        <Stack>
          <Text c="dimmed">{t('publico.planesIntro')}</Text>
          {isLoading || cargandoPub ? (
            <Skeleton h={300} />
          ) : activas.length === 0 ? (
            <Alert color="gray">{t('publico.noHayPublicados')}</Alert>
          ) : (
            <>
              {grupo(t('publico.centro'), activas.filter((x) => x.tipo === 'centro'))}
              {grupo(t('publico.grados'), activas.filter((x) => x.tipo === 'grado'))}
              {grupo(t('publico.masteres'), activas.filter((x) => x.tipo === 'master'))}
            </>
          )}
        </Stack>
      </Container>
    </>
  )
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{etiqueta}</Text>
      <Text size="sm" component="div">{children}</Text>
    </div>
  )
}

function TarjetaAccion({ a }: { a: FilaPlanPublico }) {
  const { t } = useTranslation()
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text size="sm" ff="monospace" c="dimmed">{a.codigo}</Text>
          <EstadoBadge estado={a.estado} />
        </Group>
        <Text fw={600}>{a.nombre}</Text>
        {a.tareas && (
          <Dato etiqueta={t('publico.tareas')}>
            <TextoConEnlaces texto={a.tareas} size="sm" />
          </Dato>
        )}
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm">
          <Dato etiqueta={t('publico.responsable')}>{a.responsable ?? '—'}</Dato>
          <Dato etiqueta={t('publico.fechas')}>
            {fechaCorta(a.fecha_inicio)} – {fechaCorta(a.fecha_fin)}
          </Dato>
          <Dato etiqueta={t('publico.indicador')}>
            <ListaIndicadores indicadores={a.indicadores} />
          </Dato>
          <Dato etiqueta={t('publico.origen')}>{a.origen ?? '—'}</Dato>
          {a.presupuesto !== null && (
            <Dato etiqueta={t('publico.presupuesto')}>
              {Number(a.presupuesto).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}
            </Dato>
          )}
        </SimpleGrid>
        {a.observaciones && (
          <Dato etiqueta={t('publico.observaciones')}>
            <TextoConEnlaces texto={a.observaciones} size="sm" />
          </Dato>
        )}
      </Stack>
    </Paper>
  )
}

/** Plan publicado de una titulación y curso: /plan/:codigo/:anyo (sin iniciar sesión). */
export function PlanPublico() {
  const { codigo = '', anyo: anyoParam } = useParams()
  const anyo = Number(anyoParam) || anyoPorDefecto()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const [exportando, setExportando] = useState(false)
  const { data: titulaciones = [], isLoading: cargandoTit } = useTitulaciones()
  const tit = titulaciones.find((x) => x.codigo === codigo.toUpperCase())
  const { data: publicacion, isLoading: cargandoPub } = usePublicacion()
  const publicado = !!tit && estaPublicado(publicacion, tit.tipo)
  const { data: responsables = [] } = useResponsables(tit ? (tit.tipo === 'centro' ? 'centro' : 'titulacion') : undefined)
  const { data: filas = [], isLoading, error } = useQuery({
    queryKey: ['plan_publico', tit?.codigo, anyo],
    enabled: publicado,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('plan_publico', { p_titulacion: tit!.codigo, p_anyo: anyo })
      if (error) throw error
      return data as FilaPlanPublico[]
    },
  })

  const curso = etiquetaCurso(anyo)
  const propuestas = filas.filter((a) => a.anyo === anyo)
  const anteriores = filas.filter((a) => a.anyo < anyo)
  const cuenta = (e: EstadoAccion) => filas.filter((a) => a.estado === e).length

  async function exportar() {
    if (!tit) return
    setExportando(true)
    try {
      const buf = await generarExcel(filas, {
        titulacion: tit.codigo, nombreTitulacion: tit.nombre, anyo, responsables, publico: true,
      })
      descargar(buf, nombreFichero(tit.codigo, anyo, true))
    } finally {
      setExportando(false)
    }
  }

  return (
    <>
      <CabeceraPublica />
      <Container size="lg" py="lg">
        {cargandoTit || cargandoPub ? (
          <Skeleton h={300} />
        ) : !tit || !tit.activa ? (
          <Alert color="red">
            {t('publico.noExiste')} <Anchor component={Link} to="/plan">{t('publico.todosLosPlanes')}</Anchor>
          </Alert>
        ) : !publicado ? (
          <Alert color="gray">
            {t('publico.noPublicado')} <Anchor component={Link} to="/plan">{t('publico.todosLosPlanes')}</Anchor>
          </Alert>
        ) : (
          <Stack>
            <div>
              <Group gap="xs">
                <Badge variant="light">{tit.codigo}</Badge>
                <Text size="sm" c="dimmed">{t('publico.titulo')}</Text>
              </Group>
              <Title order={1} fz={{ base: 24, sm: 30 }}>{tit.nombre}</Title>
            </div>
            <Group justify="space-between" align="flex-end">
              <Select
                label={t('publico.curso')}
                w={160}
                allowDeselect={false}
                value={String(anyo)}
                data={cursosConsultables().map((a) => ({ value: String(a), label: etiquetaCurso(a) }))}
                onChange={(v) => v && navigate(`/plan/${tit.codigo}/${v}`)}
              />
              <Button variant="default" leftSection={<IconDownload size={16} />} onClick={exportar} loading={exportando} disabled={!filas.length}>
                {t('publico.exportar')}
              </Button>
            </Group>
            <Text size="sm" c="dimmed">
              {t('publico.nota')}
              {i18n.resolvedLanguage !== 'es' && ` ${t('publico.contenidoCastellano')}`}
            </Text>
            {error && <Alert color="red">{(error as Error).message}</Alert>}
            {isLoading ? (
              <Skeleton h={300} />
            ) : filas.length === 0 ? (
              <Alert color="gray">{t('publico.ninguna', { curso })}</Alert>
            ) : (
              <>
                <Group gap="xs">
                  <Text size="sm" fw={500}>{t('publico.resumen', { total: filas.length })}:</Text>
                  {(['pendiente', 'en_proceso', 'completada', 'cancelada'] as EstadoAccion[])
                    .filter((e) => cuenta(e) > 0)
                    .map((e) => (
                      <Badge key={e} variant="outline" color="gray">
                        {t(`estado.${e}`)}: {cuenta(e)}
                      </Badge>
                    ))}
                </Group>
                {propuestas.length > 0 && (
                  <Stack gap="sm">
                    <Title order={3} fz="lg">{t('publico.propuestas', { curso })}</Title>
                    {propuestas.map((a) => <TarjetaAccion key={a.codigo} a={a} />)}
                  </Stack>
                )}
                {anteriores.length > 0 && (
                  <Stack gap="sm" mt="md">
                    <Title order={3} fz="lg">{t('publico.anteriores')}</Title>
                    {anteriores.map((a) => <TarjetaAccion key={a.codigo} a={a} />)}
                  </Stack>
                )}
              </>
            )}
          </Stack>
        )}
      </Container>
    </>
  )
}
