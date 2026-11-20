import {
  ActionIcon, Badge, Button, Group, Modal, MultiSelect, PasswordInput, Select, Stack, Switch, Table, Text,
  TextInput, Title, Tooltip,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { IconKey, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../auth/AuthProvider'
import { supabase } from '../../lib/supabase'
import type { PerfilConTitulaciones, RolUsuario } from '../../lib/tipos'
import { useTitulaciones } from '../../lib/useTitulaciones'

async function llamarFuncion(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body })
  if (error) {
    // el cuerpo de la respuesta contiene el mensaje de error de la función
    const ctx = (error as { context?: Response }).context
    const detalle = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(detalle?.error ?? error.message)
  }
  return data
}

function generarPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint32Array(14))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

interface DatosUsuario {
  email: string
  nombre: string
  rol: RolUsuario
  titulaciones: string[]
  activo: boolean
  password: string
}

export function Usuarios() {
  const { t } = useTranslation()
  const { perfil: yo } = useAuth()
  const qc = useQueryClient()
  const { data: titulaciones = [] } = useTitulaciones()
  const [editando, setEditando] = useState<PerfilConTitulaciones | 'nuevo' | null>(null)
  const [passwordDe, setPasswordDe] = useState<PerfilConTitulaciones | null>(null)

  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['usuarios'],
    queryFn: async () => {
      const { data, error } = await supabase.from('perfiles').select('*, perfil_titulacion(titulacion)').order('email')
      if (error) throw error
      return data as PerfilConTitulaciones[]
    },
  })

  const error = (e: Error) => notifications.show({ color: 'red', title: t('comun.error'), message: e.message })
  const refrescar = () => qc.invalidateQueries({ queryKey: ['usuarios'] })

  const guardar = useMutation({
    mutationFn: async (v: DatosUsuario) => {
      if (editando === 'nuevo') {
        await llamarFuncion({ accion: 'crear', ...v })
        return
      }
      const id = (editando as PerfilConTitulaciones).id
      const { error: e1 } = await supabase
        .from('perfiles')
        .update({ nombre: v.nombre || null, rol: v.rol, activo: v.activo })
        .eq('id', id)
      if (e1) throw e1
      const { error: e2 } = await supabase.from('perfil_titulacion').delete().eq('perfil_id', id)
      if (e2) throw e2
      if (v.titulaciones.length) {
        const { error: e3 } = await supabase
          .from('perfil_titulacion')
          .insert(v.titulaciones.map((tit) => ({ perfil_id: id, titulacion: tit })))
        if (e3) throw e3
      }
    },
    onSuccess: () => {
      notifications.show({ color: 'green', message: t('comun.guardado') })
      setEditando(null)
      refrescar()
    },
    onError: error,
  })

  const borrar = (u: PerfilConTitulaciones) =>
    modals.openConfirmModal({
      title: 'Borrar usuario',
      children: (
        <Text size="sm">
          Se borrará la cuenta <b>{u.email}</b>. Esta operación no se puede deshacer. Las acciones que haya creado se
          conservan. Si solo quieres impedir el acceso, desactiva el usuario.
        </Text>
      ),
      labels: { confirm: t('comun.borrar'), cancel: t('comun.cancelar') },
      confirmProps: { color: 'red' },
      onConfirm: () =>
        llamarFuncion({ accion: 'borrar', id: u.id })
          .then(() => {
            notifications.show({ color: 'green', message: 'Usuario borrado' })
            refrescar()
          })
          .catch(error),
    })

  const opcionesTitulaciones = titulaciones.map((x) => ({ value: x.codigo, label: `${x.codigo} · ${x.nombre}` }))

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>{t('nav.usuarios')}</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditando('nuevo')}>
          Nuevo usuario
        </Button>
      </Group>
      <Table.ScrollContainer minWidth={640}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Usuario</Table.Th>
              <Table.Th>Rol</Table.Th>
              <Table.Th>Titulaciones</Table.Th>
              <Table.Th>Activo</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr>
                <Table.Td colSpan={5}>{t('comun.cargando')}</Table.Td>
              </Table.Tr>
            )}
            {usuarios.map((u) => (
              <Table.Tr key={u.id} opacity={u.activo ? 1 : 0.5}>
                <Table.Td>
                  <Text size="sm" fw={500}>{u.nombre || '—'}</Text>
                  <Text size="xs" c="dimmed">{u.email}</Text>
                </Table.Td>
                <Table.Td>
                  <Badge color={u.rol === 'admin' ? 'grape' : 'blue'} variant="light">{t(`rol.${u.rol}`)}</Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap={4}>
                    {u.rol === 'admin' ? (
                      <Text size="xs" c="dimmed">Todas</Text>
                    ) : (
                      u.perfil_titulacion.map((pt) => <Badge key={pt.titulacion} variant="outline" size="sm">{pt.titulacion}</Badge>)
                    )}
                  </Group>
                </Table.Td>
                <Table.Td>{u.activo ? t('comun.si') : t('comun.no')}</Table.Td>
                <Table.Td>
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Tooltip label={t('comun.editar')}>
                      <ActionIcon variant="subtle" onClick={() => setEditando(u)} aria-label={t('comun.editar')}>
                        <IconPencil size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Cambiar contraseña">
                      <ActionIcon variant="subtle" onClick={() => setPasswordDe(u)} aria-label="Cambiar contraseña">
                        <IconKey size={16} />
                      </ActionIcon>
                    </Tooltip>
                    {u.id !== yo?.id && (
                      <Tooltip label={t('comun.borrar')}>
                        <ActionIcon variant="subtle" color="red" onClick={() => borrar(u)} aria-label={t('comun.borrar')}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Modal
        opened={editando !== null}
        onClose={() => setEditando(null)}
        title={editando === 'nuevo' ? 'Nuevo usuario' : editando ? 'Editar usuario' : ''}
        size="lg"
      >
        {editando !== null && (
          <FormUsuario
            key={editando === 'nuevo' ? 'nuevo' : editando.id}
            usuario={editando === 'nuevo' ? null : editando}
            esYo={editando !== 'nuevo' && editando.id === yo?.id}
            opcionesTitulaciones={opcionesTitulaciones}
            enviando={guardar.isPending}
            onGuardar={(v) => guardar.mutate(v)}
            onCancelar={() => setEditando(null)}
          />
        )}
      </Modal>

      <Modal opened={passwordDe !== null} onClose={() => setPasswordDe(null)} title={`Nueva contraseña · ${passwordDe?.email ?? ''}`}>
        {passwordDe && (
          <FormPassword
            onGuardar={(password) =>
              llamarFuncion({ accion: 'password', id: passwordDe.id, password })
                .then(() => {
                  notifications.show({ color: 'green', message: 'Contraseña cambiada. Comunícala al usuario.' })
                  setPasswordDe(null)
                })
                .catch(error)
            }
          />
        )}
      </Modal>
    </Stack>
  )
}

function FormUsuario(props: {
  usuario: PerfilConTitulaciones | null
  esYo: boolean
  opcionesTitulaciones: { value: string; label: string }[]
  enviando: boolean
  onGuardar: (v: DatosUsuario) => void
  onCancelar: () => void
}) {
  const { t } = useTranslation()
  const u = props.usuario
  const form = useForm<DatosUsuario>({
    initialValues: {
      email: u?.email ?? '',
      nombre: u?.nombre ?? '',
      rol: u?.rol ?? 'coordinador',
      titulaciones: u?.perfil_titulacion.map((p) => p.titulacion) ?? [],
      activo: u?.activo ?? true,
      password: u ? '' : generarPassword(),
    },
    validate: {
      email: (v) => (/^\S+@\S+\.\S+$/.test(v) ? null : 'Email no válido'),
      password: (v) => (u || v.length >= 10 ? null : 'Mínimo 10 caracteres'),
    },
  })
  return (
    <form onSubmit={form.onSubmit(props.onGuardar)}>
      <Stack>
        <TextInput label="Email" required disabled={!!u} {...form.getInputProps('email')} />
        <TextInput label="Nombre" placeholder="Nombre y apellidos" {...form.getInputProps('nombre')} />
        <Select
          label="Rol"
          data={[
            { value: 'coordinador', label: t('rol.coordinador') },
            { value: 'admin', label: `${t('rol.admin')} (acceso a todos los planes)` },
          ]}
          allowDeselect={false}
          disabled={props.esYo}
          {...form.getInputProps('rol')}
        />
        {form.values.rol === 'coordinador' && (
          <MultiSelect
            label="Titulaciones que gestiona"
            data={props.opcionesTitulaciones}
            searchable
            {...form.getInputProps('titulaciones')}
          />
        )}
        {!u && (
          <PasswordInput
            label="Contraseña inicial"
            description="Comunícala al usuario; podrá cambiarla desde «Mi cuenta»."
            visible
            {...form.getInputProps('password')}
          />
        )}
        {u && !props.esYo && <Switch label="Usuario activo" {...form.getInputProps('activo', { type: 'checkbox' })} />}
        <Group justify="flex-end">
          <Button variant="default" onClick={props.onCancelar}>{t('comun.cancelar')}</Button>
          <Button type="submit" loading={props.enviando}>{t('comun.guardar')}</Button>
        </Group>
      </Stack>
    </form>
  )
}

function FormPassword({ onGuardar }: { onGuardar: (password: string) => void }) {
  const form = useForm({
    initialValues: { password: generarPassword() },
    validate: { password: (v) => (v.length >= 10 ? null : 'Mínimo 10 caracteres') },
  })
  return (
    <form onSubmit={form.onSubmit((v) => onGuardar(v.password))}>
      <Stack>
        <PasswordInput label="Contraseña" visible {...form.getInputProps('password')} />
        <Button type="submit">Cambiar contraseña</Button>
      </Stack>
    </form>
  )
}
