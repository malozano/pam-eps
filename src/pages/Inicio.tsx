import {
  Alert, Group, SegmentedControl, Skeleton, Stack, Text, Title,
} from '@mantine/core'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { ListaAcciones } from '../components/ListaAcciones'
import { AvisoRevisionesAdmin, AvisoRevisionInicio } from '../components/Revision'
import { SeguimientosPorRevisar } from '../components/SeguimientosPorRevisar'
import { SugerenciaNotificaciones } from '../components/SugerenciaNotificaciones'
import { compararPorUrgencia, situacion } from '../lib/seguimiento'
import { useAccionesAbiertas } from '../lib/useCatalogos'
import { MisAcciones } from './MisAcciones'

/** Inicio: las cuentas de coordinación transversal ven sus acciones; el resto, sus planes. */
export function Inicio() {
  const { esTransversal } = useAuth()
  return esTransversal ? <MisAcciones /> : <InicioGestion />
}

function InicioGestion() {
  const { t } = useTranslation()
  const { perfil, titulaciones, esAdmin } = useAuth()
  const { data: abiertas = [], isLoading: cargandoAcciones } = useAccionesAbiertas()
  const [alcance, setAlcance] = useState<'centro' | 'todos'>('centro')

  const conSituacion = useMemo(
    () => abiertas.map((a) => ({ ...a, situacion: situacion(a) })),
    [abiertas],
  )
  // El administrador ve por defecto solo las alertas del plan del centro
  const atencion = conSituacion
    .filter((a) => a.situacion !== 'futura' && (!esAdmin || alcance === 'todos' || a.titulacion === 'CEN'))
    .sort((a, b) => compararPorUrgencia(a, b))

  return (
    <Stack>
      <Title order={2}>{t('inicio.bienvenida', { nombre: perfil?.nombre || perfil?.email })}</Title>
      <SugerenciaNotificaciones />
      {!esAdmin && titulaciones.length === 0 && <Alert color="yellow">{t('inicio.sinTitulaciones')}</Alert>}
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
        <Text size="xs" c="dimmed" mt={-6}>
          Acciones abiertas, de más a menos urgentes: vencidas, que vencen en los próximos 60 días, que deberían haber
          empezado, que empiezan en los próximos 30 días y en plazo. Solo se omiten las que empiezan más adelante.
        </Text>
        {cargandoAcciones ? (
          <Skeleton h={80} />
        ) : atencion.length === 0 ? (
          <Alert color="green" variant="light">
            No hay acciones abiertas (salvo, si las hay, las que empiezan dentro de más de un mes).
          </Alert>
        ) : (
          <ListaAcciones acciones={atencion} minWidth={700} />
        )}
      </Stack>

    </Stack>
  )
}
