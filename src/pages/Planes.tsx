import { Alert, Badge, Card, Group, SimpleGrid, Skeleton, Stack, Text, Title, Tooltip } from '@mantine/core'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { situacion, type Situacion } from '../lib/seguimiento'
import type { Titulacion } from '../lib/tipos'
import { useAccionesAbiertas } from '../lib/useCatalogos'
import { useTitulaciones } from '../lib/useTitulaciones'

type Contador = Record<Situacion | 'en_proceso', number>

function TarjetaPlan({ tit, c }: { tit: Titulacion; c: Contador | undefined }) {
  return (
    <Card withBorder component={Link} to={`/gestion/${tit.codigo}`}>
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
}

/**
 * Planes que gestiona el usuario (la administración, todos), con un resumen de su estado. Desde
 * cada plan se consulta por curso, se añaden acciones y se preparan los informes.
 */
export function Planes() {
  const { t } = useTranslation()
  const { titulaciones, esAdmin } = useAuth()
  const { data, isLoading } = useTitulaciones()
  const { data: abiertas = [] } = useAccionesAbiertas()
  const mias = (data ?? []).filter((tit) => tit.activa && (esAdmin || titulaciones.includes(tit.codigo)))

  const contadores = useMemo(() => {
    const m = new Map<string, Contador>()
    for (const a of abiertas) {
      const c = m.get(a.titulacion) ?? { vencida: 0, vence_pronto: 0, sin_iniciar: 0, proxima: 0, en_plazo: 0, futura: 0, finalizada: 0, en_proceso: 0 }
      c[situacion(a)]++
      if (a.estado === 'en_proceso') c.en_proceso++
      m.set(a.titulacion, c)
    }
    return m
  }, [abiertas])

  const rejilla = (lista: Titulacion[]) => (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
      {lista.map((tit) => <TarjetaPlan key={tit.codigo} tit={tit} c={contadores.get(tit.codigo)} />)}
    </SimpleGrid>
  )
  // Muchos planes (administración): agrupados como en el índice público
  const grupos: [string, Titulacion[]][] = [
    [t('publico.centro'), mias.filter((x) => x.tipo === 'centro')],
    [t('publico.grados'), mias.filter((x) => x.tipo === 'grado')],
    [t('publico.masteres'), mias.filter((x) => x.tipo === 'master')],
  ]

  return (
    <Stack>
      <div>
        <Title order={2}>{t('nav.planes')}</Title>
        <Text size="sm" c="dimmed">
          {esAdmin ? t('inicio.todas') + ' ' : ''}
          Entra en un plan para consultarlo por curso, añadir acciones, importar o exportar y preparar los informes.
        </Text>
      </div>
      {isLoading ? (
        <Skeleton h={200} />
      ) : mias.length === 0 ? (
        <Alert color="yellow">{t('inicio.sinTitulaciones')}</Alert>
      ) : mias.length > 6 ? (
        grupos.filter(([, l]) => l.length).map(([titulo, l]) => (
          <Stack key={titulo} gap="xs">
            <Title order={4} fw={500}>{titulo}</Title>
            {rejilla(l)}
          </Stack>
        ))
      ) : (
        rejilla(mias)
      )}
    </Stack>
  )
}
