import {
  Alert, Badge, Card, Group, SegmentedControl, SimpleGrid, Skeleton, Stack, Text, Title, Tooltip,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ListaAcciones } from '../components/ListaAcciones'
import { AvisoRevisionesAdmin, AvisoRevisionInicio } from '../components/Revision'
import { SeguimientosPorRevisar } from '../components/SeguimientosPorRevisar'
import { SugerenciaNotificaciones } from '../components/SugerenciaNotificaciones'
import { compararPorUrgencia, ESTADOS_ABIERTOS, situacion, type Situacion } from '../lib/seguimiento'
import { supabase } from '../lib/supabase'
import type { Accion } from '../lib/tipos'
import { useTitulaciones } from '../lib/useTitulaciones'
import { MisAcciones } from './MisAcciones'

type AccionResumen = Pick<
  Accion,
  'id' | 'codigo' | 'titulacion' | 'nombre' | 'estado' | 'fecha_inicio' | 'fecha_fin' | 'es_mejora'
>


/** Acciones abiertas de todos los planes que el usuario puede gestionar (RLS filtra el resto). */
function useAccionesAbiertas() {
  return useQuery({
    queryKey: ['acciones', 'abiertas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acciones')
        .select('id, codigo, titulacion, nombre, estado, fecha_inicio, fecha_fin, es_mejora')
        .in('estado', ESTADOS_ABIERTOS)
      if (error) throw error
      return data as AccionResumen[]
    },
  })
}

/** Inicio: las cuentas de coordinación transversal ven sus acciones; el resto, sus planes. */
export function Inicio() {
  const { esTransversal } = useAuth()
  return esTransversal ? <MisAcciones /> : <InicioGestion />
}

function InicioGestion() {
  const { t } = useTranslation()
  const { perfil, titulaciones, esAdmin } = useAuth()
  const { data, isLoading } = useTitulaciones()
  const { data: abiertas = [], isLoading: cargandoAcciones } = useAccionesAbiertas()
  const [alcance, setAlcance] = useState<'centro' | 'todos'>('centro')
  const mias = (data ?? []).filter((tit) => tit.activa && (esAdmin || titulaciones.includes(tit.codigo)))

  const conSituacion = useMemo(
    () => abiertas.map((a) => ({ ...a, situacion: situacion(a) })),
    [abiertas],
  )
  const contadores = useMemo(() => {
    const m = new Map<string, Record<Situacion | 'en_proceso', number>>()
    for (const a of conSituacion) {
      const c = m.get(a.titulacion) ?? { vencida: 0, vence_pronto: 0, sin_iniciar: 0, proxima: 0, en_plazo: 0, finalizada: 0, en_proceso: 0 }
      c[a.situacion]++
      if (a.estado === 'en_proceso') c.en_proceso++
      m.set(a.titulacion, c)
    }
    return m
  }, [conSituacion])

  // El administrador ve por defecto solo las alertas del plan del centro
  const atencion = conSituacion
    .filter((a) => a.situacion !== 'en_plazo' && (!esAdmin || alcance === 'todos' || a.titulacion === 'CEN'))
    .sort((a, b) => compararPorUrgencia(a, b))

  return (
    <Stack>
      <Title order={2}>{t('inicio.bienvenida', { nombre: perfil?.nombre || perfil?.email })}</Title>
      <SugerenciaNotificaciones />
      {esAdmin ? <AvisoRevisionesAdmin /> : <AvisoRevisionInicio />}
      {esAdmin && <SeguimientosPorRevisar />}

      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={4} fw={500}>
            Requieren atención
          </Title>
          {esAdmin && (
            <SegmentedControl
              size="xs"
              value={alcance}
              onChange={(v) => setAlcance(v as 'centro' | 'todos')}
              data={[
                { value: 'centro', label: 'Plan del centro' },
                { value: 'todos', label: 'Todos los planes' },
              ]}
            />
          )}
        </Group>
        {cargandoAcciones ? (
          <Skeleton h={80} />
        ) : atencion.length === 0 ? (
          <Alert color="green" variant="light">
            No hay acciones vencidas, que venzan en los próximos 60 días, sin iniciar ni próximas a empezar.
          </Alert>
        ) : (
          <ListaAcciones acciones={atencion} minWidth={700} />
        )}
      </Stack>

      <Title order={4} fw={500} mt="md">
        {t('inicio.misPlanes')}
      </Title>
      {esAdmin && <Text c="dimmed">{t('inicio.todas')}</Text>}
      {isLoading ? (
        <Skeleton h={100} />
      ) : mias.length === 0 ? (
        <Alert color="yellow">{t('inicio.sinTitulaciones')}</Alert>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {mias.map((tit) => {
            const c = contadores.get(tit.codigo)
            return (
              <Card key={tit.codigo} withBorder component={Link} to={`/gestion/${tit.codigo}`}>
                <Group justify="space-between" mb={4} wrap="nowrap">
                  <Badge variant="light">{tit.codigo}</Badge>
                  <Group gap={4} wrap="nowrap">
                    {!!c?.vencida && (
                      <Tooltip label="Vencidas sin completar">
                        <Badge color="red" variant="filled" size="sm">{c.vencida}</Badge>
                      </Tooltip>
                    )}
                    {!!c?.vence_pronto && (
                      <Tooltip label="Vencen en los próximos 60 días">
                        <Badge color="orange" variant="filled" size="sm">{c.vence_pronto}</Badge>
                      </Tooltip>
                    )}
                    {!!c?.sin_iniciar && (
                      <Tooltip label="Deberían haber empezado">
                        <Badge color="grape" variant="filled" size="sm">{c.sin_iniciar}</Badge>
                      </Tooltip>
                    )}
                    {!!c?.en_proceso && (
                      <Tooltip label="En proceso">
                        <Badge color="blue" variant="light" size="sm">{c.en_proceso}</Badge>
                      </Tooltip>
                    )}
                  </Group>
                </Group>
                <Text fw={500}>{tit.nombre}</Text>
              </Card>
            )
          })}
        </SimpleGrid>
      )}
    </Stack>
  )
}
