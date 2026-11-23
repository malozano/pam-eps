import { Alert, Button, Group, Modal, SegmentedControl, SimpleGrid, Stack, Text, Textarea } from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { useAuth } from '../auth/AuthProvider'
import { notifications } from '@mantine/notifications'
import { IconCalendar } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { fechaCorta } from '../lib/formato'
import { supabase } from '../lib/supabase'
import type { Accion, EstadoAccion } from '../lib/tipos'

const AYUDA: Record<EstadoAccion, { obs: string; ayuda: string; obligatorio: boolean }> = {
  pendiente: {
    obs: 'Situación de la acción',
    ayuda: 'Si la acción ha sufrido retraso, indica el motivo y la fecha estimada en la que comenzará.',
    obligatorio: false,
  },
  en_proceso: {
    obs: 'Lo realizado hasta el momento y previsión de trabajo futuro',
    ayuda: 'Indica lo que se ha hecho, lo que queda por hacer y, si cambia, la nueva fecha de finalización.',
    obligatorio: false,
  },
  completada: {
    obs: 'Lo que se ha realizado',
    ayuda: 'Describe lo que se ha hecho y los resultados. Añade las evidencias (actas, enlaces, documentos…).',
    obligatorio: true,
  },
  cancelada: {
    obs: 'Motivo de la cancelación',
    ayuda: 'Explica por qué se cancela la acción.',
    obligatorio: true,
  },
}

/** Estado propuesto por defecto al abrir el diálogo: el siguiente paso natural. */
function siguiente(e: EstadoAccion): EstadoAccion {
  return e === 'pendiente' ? 'en_proceso' : e === 'en_proceso' ? 'completada' : e
}

interface Props {
  accion: Accion
  opened: boolean
  onClose: () => void
}

export function SeguimientoModal({ accion, opened, onClose }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title={`Registrar seguimiento · ${accion.codigo}`} size="lg">
      {/* se monta de nuevo cada vez que se abre para partir de los datos actuales */}
      {opened && <Formulario accion={accion} onClose={onClose} />}
    </Modal>
  )
}

interface Valores {
  estado: EstadoAccion
  observaciones: string
  evidencias: string
  fecha_inicio: string | null
  fecha_fin: string | null
}

function Formulario({ accion, onClose }: { accion: Accion; onClose: () => void }) {
  const { esTransversal } = useAuth()
  const qc = useQueryClient()
  const [enviando, setEnviando] = useState(false)
  const form = useForm<Valores>({
    initialValues: {
      estado: siguiente(accion.estado),
      observaciones: accion.observaciones ?? '',
      evidencias: '',
      fecha_inicio: null,
      fecha_fin: null,
    },
    validate: {
      observaciones: (v, vals) =>
        AYUDA[vals.estado].obligatorio && !v.trim() ? 'Este campo es obligatorio para este estado' : null,
      fecha_fin: (v, vals) => {
        const ini = vals.fecha_inicio ?? accion.fecha_inicio
        return v && ini && v < ini ? 'No puede ser anterior a la fecha de inicio' : null
      },
      fecha_inicio: (v, vals) => {
        const fin = vals.fecha_fin ?? accion.fecha_fin
        return v && fin && v > fin ? 'No puede ser posterior a la fecha de fin; cambia también la fecha de fin' : null
      },
    },
  })
  const e = form.values.estado
  const ayuda = AYUDA[e]

  async function guardar(v: Valores) {
    setEnviando(true)
    const { error } = await supabase.rpc('registrar_seguimiento', {
      p_accion: accion.id,
      p_estado: v.estado,
      p_observaciones: v.observaciones,
      p_evidencias: v.evidencias,
      // solo se envían las fechas de los campos visibles para el estado elegido
      p_fecha_inicio: v.estado === 'pendiente' ? v.fecha_inicio : null,
      p_fecha_fin: v.estado === 'pendiente' || v.estado === 'en_proceso' ? v.fecha_fin : null,
    })
    setEnviando(false)
    if (error) {
      notifications.show({ color: 'red', title: 'No se ha guardado', message: error.message, autoClose: false })
      return
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['acciones'] }),
      qc.invalidateQueries({ queryKey: ['historial', accion.id] }),
    ])
    notifications.show({
      color: 'green',
      message: esTransversal ? 'Seguimiento registrado. La coordinación de calidad recibirá un aviso.' : 'Seguimiento registrado',
    })
    onClose()
  }

  return (
    <form onSubmit={form.onSubmit(guardar)} noValidate>
      <Stack>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Nuevo estado
          </Text>
          <SegmentedControl
            fullWidth
            data={[
              { value: 'pendiente', label: 'Pendiente' },
              { value: 'en_proceso', label: 'En proceso' },
              { value: 'completada', label: 'Completada' },
              { value: 'cancelada', label: 'Cancelada' },
            ]}
            {...form.getInputProps('estado')}
          />
          {e === accion.estado && (
            <Text size="xs" c="dimmed" mt={4}>
              El estado no cambia: se registrará una nota de seguimiento.
            </Text>
          )}
        </div>
        <Alert variant="light" color={e === 'cancelada' ? 'red' : e === 'completada' ? 'green' : 'blue'}>
          {ayuda.ayuda}
        </Alert>
        <Textarea
          label={ayuda.obs}
          description="Sustituye a las observaciones actuales de la acción (las anteriores quedan en el historial)"
          required={ayuda.obligatorio}
          autosize
          minRows={3}
          maxRows={12}
          data-autofocus
          {...form.getInputProps('observaciones')}
        />
        <Textarea
          label="Evidencias"
          description="Enlaces o referencias a documentos, una por línea (opcional)"
          placeholder="https://…"
          autosize
          minRows={2}
          maxRows={6}
          {...form.getInputProps('evidencias')}
        />
        {(e === 'pendiente' || e === 'en_proceso') && (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {e === 'pendiente' && (
              <DatePickerInput
                label="Nueva fecha de inicio prevista"
                description={`Actual: ${fechaCorta(accion.fecha_inicio)}`}
                valueFormat="DD/MM/YYYY"
                clearable
                leftSection={<IconCalendar size={16} />}
                {...form.getInputProps('fecha_inicio')}
              />
            )}
            <DatePickerInput
              label="Nueva fecha de fin prevista"
              description={`Actual: ${fechaCorta(accion.fecha_fin)}`}
              valueFormat="DD/MM/YYYY"
              clearable
              leftSection={<IconCalendar size={16} />}
              {...form.getInputProps('fecha_fin')}
            />
          </SimpleGrid>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={enviando}>
            Registrar
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
