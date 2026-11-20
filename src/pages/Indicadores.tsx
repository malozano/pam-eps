import {
  ActionIcon, Alert, Badge, Button, Group, Modal, MultiSelect, Paper, Select, Skeleton, Stack, Switch, Text, Textarea,
  TextInput, Title, Tooltip,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { IconPencil, IconPlus, IconSearch } from '@tabler/icons-react'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { normalizar } from '../lib/importacion'
import type { IndicadorCatalogo, Procedimiento } from '../lib/indicadores'
import { supabase } from '../lib/supabase'
import { useCatalogoIndicadores } from '../lib/useCatalogos'

/** Catálogo de indicadores: consulta y búsqueda para todos; mantenimiento para administración. */
export function Indicadores() {
  const { esAdmin } = useAuth()
  const { data: cat, isLoading } = useCatalogoIndicadores()
  const [q, setQ] = useState('')
  const [verInactivos, setVerInactivos] = useState(false)
  const [editando, setEditando] = useState<IndicadorCatalogo | 'nuevo' | null>(null)

  const grupos = useMemo(() => {
    if (!cat) return []
    const palabras = normalizar(q).split(' ').filter(Boolean)
    const pasa = (i: IndicadorCatalogo) =>
      (verInactivos || i.activo) &&
      palabras.every((p) => normalizar(`${i.codigo} ${i.nombre} ${i.definicion ?? ''} ${i.procedimientos.join(' ')}`).includes(p))
    return cat.procedimientos
      .map((p) => ({ p, items: cat.indicadores.filter((i) => i.procedimiento === p.codigo && pasa(i)) }))
      .filter((g) => g.items.length > 0)
  }, [cat, q, verInactivos])
  const total = grupos.reduce((n, g) => n + g.items.length, 0)

  return (
    <Stack maw={1000}>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Indicadores</Title>
          <Text c="dimmed" size="sm">
            Indicadores con código del Sistema de Calidad, por procedimiento. Para indicadores sin código, escribe el texto
            en la acción o usa «Si / No».
          </Text>
        </div>
        {esAdmin && (
          <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nuevo')}>
            Nuevo indicador
          </Button>
        )}
      </Group>
      <Group align="flex-end">
        <TextInput
          label="Buscar"
          placeholder="Código, nombre o definición (p. ej. «abandono», «UAS», «tasa de respuesta»)"
          leftSection={<IconSearch size={16} />}
          value={q}
          onChange={(e) => setQ(e.currentTarget.value)}
          style={{ flex: 1 }}
          maw={520}
        />
        {esAdmin && (
          <Switch pb={8} label="Mostrar inactivos" checked={verInactivos} onChange={(e) => setVerInactivos(e.currentTarget.checked)} />
        )}
      </Group>
      {isLoading ? (
        <Skeleton h={400} />
      ) : total === 0 ? (
        <Alert color="gray">Ningún indicador coincide con la búsqueda.</Alert>
      ) : (
        <>
          <Text size="sm" c="dimmed">{total} indicadores</Text>
          {grupos.map(({ p, items }) => (
            <Stack key={p.codigo} gap="xs">
              <Title order={4}>
                {p.codigo} · {p.nombre}
              </Title>
              {items.map((i) => (
                <Paper key={i.codigo} withBorder p="sm" opacity={i.activo ? 1 : 0.5}>
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap={2}>
                      <Group gap="xs">
                        <Text ff="monospace" fw={700}>{i.codigo}</Text>
                        <Text fw={500}>{i.nombre}</Text>
                        {!i.activo && <Badge size="xs" color="gray">Inactivo</Badge>}
                      </Group>
                      {i.definicion && <Text size="sm" c="dimmed">{i.definicion}</Text>}
                      {i.procedimientos.length > 1 && (
                        <Text size="xs" c="dimmed">También en: {i.procedimientos.filter((x) => x !== i.procedimiento).join(', ')}</Text>
                      )}
                    </Stack>
                    {esAdmin && (
                      <Tooltip label="Editar">
                        <ActionIcon variant="subtle" onClick={() => setEditando(i)} aria-label={`Editar ${i.codigo}`}>
                          <IconPencil size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Paper>
              ))}
            </Stack>
          ))}
        </>
      )}
      {esAdmin && cat && (
        <Modal
          opened={editando !== null}
          onClose={() => setEditando(null)}
          title={editando === 'nuevo' ? 'Nuevo indicador' : editando ? `Editar ${editando.codigo}` : ''}
          size="lg"
        >
          {editando !== null && (
            <FormIndicador
              indicador={editando === 'nuevo' ? null : editando}
              procedimientos={cat.procedimientos}
              existentes={cat.indicadores.map((i) => i.codigo)}
              onClose={() => setEditando(null)}
            />
          )}
        </Modal>
      )}
    </Stack>
  )
}

function FormIndicador(props: {
  indicador: IndicadorCatalogo | null
  procedimientos: Procedimiento[]
  existentes: string[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [guardando, setGuardando] = useState(false)
  const i = props.indicador
  const form = useForm({
    initialValues: {
      codigo: i?.codigo ?? '',
      nombre: i?.nombre ?? '',
      definicion: i?.definicion ?? '',
      procedimiento: i?.procedimiento ?? '',
      procedimientos: i?.procedimientos ?? [],
      activo: i?.activo ?? true,
    },
    validate: {
      codigo: (v) =>
        !/^[A-Z0-9]+$/.test(v)
          ? 'Solo mayúsculas y números (p. ej. UATR06)'
          : !i && props.existentes.includes(v)
            ? 'Ya existe un indicador con ese código'
            : null,
      nombre: (v) => (v.trim() ? null : 'Obligatorio'),
      procedimiento: (v) => (v ? null : 'Obligatorio'),
    },
  })
  const opciones = props.procedimientos.map((p) => ({ value: p.codigo, label: `${p.codigo} · ${p.nombre}` }))

  return (
    <form
      onSubmit={form.onSubmit(async (v) => {
        setGuardando(true)
        const datos = {
          codigo: v.codigo,
          nombre: v.nombre.trim(),
          definicion: v.definicion.trim() || null,
          procedimiento: v.procedimiento,
          procedimientos: Array.from(new Set([v.procedimiento, ...v.procedimientos])),
          activo: v.activo,
        }
        const { error } = i
          ? await supabase.from('catalogo_indicadores').update(datos).eq('codigo', i.codigo)
          : await supabase.from('catalogo_indicadores').insert({ ...datos, orden: 1000 })
        setGuardando(false)
        if (error) {
          notifications.show({ color: 'red', title: 'No se ha guardado', message: error.message })
          return
        }
        await qc.invalidateQueries({ queryKey: ['catalogo_indicadores'] })
        notifications.show({ color: 'green', message: `Indicador ${v.codigo} guardado` })
        props.onClose()
      })}
    >
      <Stack>
        <TextInput
          label="Código"
          required
          disabled={!!i}
          description={i ? 'El código no se puede cambiar: las acciones lo usan como referencia' : undefined}
          {...form.getInputProps('codigo')}
          onChange={(e) => form.setFieldValue('codigo', e.currentTarget.value.toUpperCase().trim())}
        />
        <TextInput label="Indicador" required {...form.getInputProps('nombre')} />
        <Textarea label="Definición / forma de cálculo" autosize minRows={2} {...form.getInputProps('definicion')} />
        <Select label="Grupo (procedimiento)" required searchable data={opciones} {...form.getInputProps('procedimiento')} />
        <MultiSelect
          label="Otros procedimientos en los que aparece"
          data={opciones.filter((o) => o.value !== form.values.procedimiento)}
          searchable
          {...form.getInputProps('procedimientos')}
        />
        <Switch
          label="Activo"
          description="Los inactivos no se ofrecen al elegir indicadores, pero se siguen mostrando en las acciones que los usan"
          {...form.getInputProps('activo', { type: 'checkbox' })}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onClose}>Cancelar</Button>
          <Button type="submit" loading={guardando}>Guardar</Button>
        </Group>
      </Stack>
    </form>
  )
}
