import {
  Alert, Anchor, Badge, Button, Collapse, Group, NumberInput, Paper, Select, SimpleGrid, Skeleton,
  Stack, Switch, Text, Textarea, Title, UnstyledButton,
} from '@mantine/core'
import { DatePickerInput } from '@mantine/dates'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconCalendar, IconChevronDown, IconChevronRight, IconTrash } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { EstadoBadge } from '../components/EstadoBadge'
import { IndicadoresInput } from '../components/IndicadoresInput'
import { OrigenInput } from '../components/OrigenInput'
import { anyoPorDefecto, anyosSeleccionables, etiquetaCurso } from '../lib/cursos'
import { supabase } from '../lib/supabase'
import type { Accion } from '../lib/tipos'
import { useAccionesTitulacion, useResponsables } from '../lib/useCatalogos'
import { useTitulaciones } from '../lib/useTitulaciones'

interface Valores {
  anyo: string
  nombre: string
  tareas: string
  responsable: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  indicadores: string[]
  origen: string
  es_mejora: boolean
  presupuesto: number | string
  observaciones: string
}

const nulo = (s: string) => (s.trim() === '' ? null : s.trim())

/** Alta (ruta /gestion/:codigo/nueva) y edición (/gestion/:codigo/accion/:id) de una acción. */
export function EditarAccion() {
  const { codigo = '', id } = useParams()
  const esNueva = !id
  const { esAdmin, titulaciones: mias } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: titulaciones = [] } = useTitulaciones()
  const tit = titulaciones.find((t) => t.codigo === codigo)
  const { data: responsables = [] } = useResponsables(
    tit ? (tit.tipo === 'centro' ? 'centro' : 'titulacion') : undefined,
  )
  const { data: acciones = [], isLoading } = useAccionesTitulacion(codigo)
  const accion: Accion | undefined = id ? acciones.find((a) => a.id === id) : undefined
  const [masOpciones, setMasOpciones] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const form = useForm<Valores>({
    initialValues: {
      anyo: String(anyoPorDefecto()),
      nombre: '',
      tareas: '',
      responsable: null,
      fecha_inicio: null,
      fecha_fin: null,
      indicadores: [],
      origen: '',
      es_mejora: true,
      presupuesto: '',
      observaciones: '',
    },
    validate: {
      nombre: (v) => (v.trim() ? null : 'Indica el nombre de la acción'),
      responsable: (v) => (v ? null : 'Selecciona la persona responsable'),
      fecha_inicio: (v) => (v ? null : 'Indica la fecha de inicio'),
      fecha_fin: (v, vals) =>
        !v ? 'Indica la fecha de fin' : vals.fecha_inicio && v < vals.fecha_inicio ? 'Debe ser posterior al inicio' : null,
      presupuesto: (v) => (v === '' || Number(v) >= 0 ? null : 'Importe no válido'),
    },
  })

  // Cargar la acción al editar
  const cargada = accion?.id
  useEffect(() => {
    if (!accion) return
    const v: Valores = {
      anyo: String(accion.anyo),
      nombre: accion.nombre,
      tareas: accion.tareas ?? '',
      responsable: accion.responsable,
      fecha_inicio: accion.fecha_inicio,
      fecha_fin: accion.fecha_fin,
      indicadores: accion.indicadores,
      origen: accion.origen ?? '',
      es_mejora: accion.es_mejora,
      presupuesto: accion.presupuesto ?? '',
      observaciones: accion.observaciones ?? '',
    }
    form.setValues(v)
    form.resetDirty(v)
    if (!accion.es_mejora || accion.presupuesto !== null || accion.observaciones) setMasOpciones(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargada])

  // Avisar al cerrar la pestaña con cambios sin guardar
  const sucio = form.isDirty()
  useEffect(() => {
    if (!sucio) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [sucio])

  const indicadoresUsados = useMemo(() => acciones.flatMap((a) => a.indicadores), [acciones])
  const opcionesResponsable = useMemo(() => {
    const actual = form.values.responsable
    return actual && !responsables.includes(actual) ? [...responsables, actual] : responsables
  }, [responsables, form.values.responsable])

  if (!esAdmin && !mias.includes(codigo)) return <Navigate to="/" replace />
  if (!esNueva && isLoading) return <Skeleton h={400} />
  if (!esNueva && !accion)
    return (
      <Alert color="red" title="Acción no encontrada">
        <Anchor component={Link} to={`/gestion/${codigo}`}>Volver al plan</Anchor>
      </Alert>
    )

  const volver = `/gestion/${codigo}`
  const cancelar = esNueva ? volver : `/gestion/${codigo}/accion/${id}`

  async function guardar(v: Valores) {
    setGuardando(true)
    const datos = {
      nombre: v.nombre.trim(),
      tareas: nulo(v.tareas),
      responsable: v.responsable,
      fecha_inicio: v.fecha_inicio,
      fecha_fin: v.fecha_fin,
      indicadores: v.indicadores.map((x) => x.trim()).filter(Boolean),
      origen: nulo(v.origen),
      es_mejora: v.es_mejora,
      presupuesto: v.presupuesto === '' ? null : Number(v.presupuesto),
      observaciones: nulo(v.observaciones),
    }
    const res = esNueva
      ? await supabase
          .from('acciones')
          .insert({ ...datos, titulacion: codigo, anyo: Number(v.anyo) })
          .select('id, codigo')
          .single()
      : await supabase.from('acciones').update(datos).eq('id', id!).select('id, codigo').single()
    setGuardando(false)
    if (res.error) {
      notifications.show({ color: 'red', title: 'No se ha guardado', message: res.error.message, autoClose: false })
      return
    }
    form.resetDirty()
    await qc.invalidateQueries({ queryKey: ['acciones'] })
    notifications.show({
      color: 'green',
      title: esNueva ? 'Acción creada' : 'Cambios guardados',
      message: esNueva ? `Se le ha asignado el código ${res.data.codigo}` : res.data.codigo,
    })
    navigate(`/gestion/${codigo}/accion/${res.data.id}`)
  }

  function borrar() {
    if (!accion) return
    modals.openConfirmModal({
      title: `Borrar ${accion.codigo}`,
      children: (
        <Stack gap="xs">
          <Text size="sm">«{accion.nombre}»</Text>
          <Text size="sm">
            Se borrarán la acción y todo su historial. <b>Esta operación no se puede deshacer</b> y la acción no se
            podrá recuperar.
          </Text>
          <Text size="sm" c="dimmed">
            Si la acción no se va a realizar, quizá prefieras marcarla como cancelada para que quede constancia.
          </Text>
        </Stack>
      ),
      labels: { confirm: 'Borrar definitivamente', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        const { data, error } = await supabase.from('acciones').delete().eq('id', accion.id).select('id')
        if (error || !data?.length) {
          notifications.show({ color: 'red', title: 'No se ha borrado', message: error?.message ?? 'Sin permisos' })
          return
        }
        form.resetDirty()
        await qc.invalidateQueries({ queryKey: ['acciones'] })
        notifications.show({ color: 'green', message: `${accion.codigo} borrada` })
        navigate(volver)
      },
    })
  }

  return (
    <Stack maw={900}>
      <Anchor component={Link} to={cancelar} size="sm">
        ← {esNueva ? (tit ? `Plan ${tit.codigo}` : 'Volver al plan') : `Ficha de ${accion?.codigo ?? 'la acción'}`}
      </Anchor>
      <div>
        <Title order={2}>{esNueva ? 'Nueva acción' : 'Editar acción'}</Title>
        <Text c="dimmed">{tit ? `${tit.codigo} · ${tit.nombre}` : codigo}</Text>
      </div>

      <form onSubmit={form.onSubmit(guardar)} noValidate>
        <Stack>
          <Paper withBorder p="md">
            {esNueva ? (
              <Group align="flex-end" gap="md">
                <Select
                  label="Curso"
                  description="Curso para el que se propone la acción"
                  data={anyosSeleccionables().map((a) => ({ value: String(a), label: etiquetaCurso(a) }))}
                  allowDeselect={false}
                  w={200}
                  {...form.getInputProps('anyo')}
                />
                <Text size="sm" c="dimmed" pb={6}>
                  Código: <b>AM-{codigo}-{form.values.anyo}-nn</b> (el número se asigna al guardar)
                </Text>
              </Group>
            ) : (
              accion && (
                <Group gap="md">
                  <Text ff="monospace" fw={600}>{accion.codigo}</Text>
                  <Badge variant="light">Curso {etiquetaCurso(accion.anyo)}</Badge>
                  <EstadoBadge estado={accion.estado} />
                  {accion.cerrada && <Badge variant="outline" color="gray">Cerrada</Badge>}
                </Group>
              )
            )}
          </Paper>

          <Paper withBorder p="md">
            <Stack>
              <Textarea
                label="Acción"
                description="Indica de forma breve el propósito. Ej.: «Mejorar la difusión de la encuesta docente»"
                required
                autosize
                minRows={1}
                maxRows={4}
                {...form.getInputProps('nombre')}
              />
              <Textarea
                label="Tareas"
                description="Tareas concretas que se realizarán. Ej.: «(1) Envío de email recordatorio… (2) Colocación de carteles…»"
                autosize
                minRows={3}
                maxRows={12}
                {...form.getInputProps('tareas')}
              />
              <SimpleGrid cols={{ base: 1, sm: 3 }}>
                <Select
                  label="Responsable"
                  required
                  searchable
                  data={opcionesResponsable}
                  {...form.getInputProps('responsable')}
                />
                <DatePickerInput
                  label="Fecha de inicio"
                  required
                  valueFormat="DD/MM/YYYY"
                  leftSection={<IconCalendar size={16} />}
                  {...form.getInputProps('fecha_inicio')}
                />
                <DatePickerInput
                  label="Fecha de fin"
                  required
                  valueFormat="DD/MM/YYYY"
                  minDate={form.values.fecha_inicio ?? undefined}
                  leftSection={<IconCalendar size={16} />}
                  {...form.getInputProps('fecha_fin')}
                />
              </SimpleGrid>
              <IndicadoresInput
                label="Indicadores"
                description="Indicadores que se pretende mejorar. Busca por código o texto (p. ej. «UATR01», «abandono»); «Si / No» si basta con saber si se ha conseguido. Para uno sin código, escríbelo y pulsa Intro."
                placeholder={form.values.indicadores.length ? '' : 'Buscar o escribir…'}
                usados={indicadoresUsados}
                {...form.getInputProps('indicadores')}
              />
              <OrigenInput
                anyo={Number(form.values.anyo)}
                esCentro={codigo === 'CEN'}
                value={form.values.origen}
                onChange={(v) => form.setFieldValue('origen', v)}
                error={form.errors.origen}
              />
            </Stack>
          </Paper>

          <Paper withBorder p="md">
            <UnstyledButton onClick={() => setMasOpciones((x) => !x)} w="100%">
              <Group gap="xs">
                {masOpciones ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                <Text fw={500}>Más opciones</Text>
                <Text size="sm" c="dimmed">acción de mejora, presupuesto, observaciones</Text>
              </Group>
            </UnstyledButton>
            <Collapse expanded={masOpciones}>
              <Stack mt="md">
                <Switch
                  label="Es acción de mejora"
                  description="Desmárcalo para otras acciones realizadas. Solo las acciones de mejora aparecen en el plan publicado y en los informes de seguimiento."
                  {...form.getInputProps('es_mejora', { type: 'checkbox' })}
                />
                <NumberInput
                  label="Presupuesto estimado (€)"
                  min={0}
                  decimalScale={2}
                  thousandSeparator="."
                  decimalSeparator=","
                  w={240}
                  {...form.getInputProps('presupuesto')}
                />
                <Textarea
                  label="Observaciones"
                  description="Lo realizado en la acción o su relación con otras acciones"
                  autosize
                  minRows={2}
                  maxRows={10}
                  {...form.getInputProps('observaciones')}
                />
              </Stack>
            </Collapse>
          </Paper>

          <Group justify="space-between">
            <div>
              {!esNueva && (
                <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={borrar}>
                  Borrar acción
                </Button>
              )}
            </div>
            <Group>
              <Button variant="default" component={Link} to={cancelar}>
                Cancelar
              </Button>
              <Button type="submit" loading={guardando}>
                {esNueva ? 'Crear acción' : 'Guardar cambios'}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Stack>
  )
}
