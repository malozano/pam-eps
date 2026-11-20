import { Badge, Button, Group, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { useForm } from '@mantine/form'
import { notifications } from '@mantine/notifications'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'

export function Perfil() {
  const { t } = useTranslation()
  const { perfil, titulaciones, esAdmin } = useAuth()
  const form = useForm({
    initialValues: { password: '', repetir: '' },
    validate: {
      password: (v) => (v.length >= 10 ? null : 'Mínimo 10 caracteres'),
      repetir: (v, vals) => (v === vals.password ? null : 'Las contraseñas no coinciden'),
    },
  })
  return (
    <Stack maw={480}>
      <Title order={2}>{t('nav.perfil')}</Title>
      <Paper withBorder p="md">
        <Text fw={500}>{perfil?.nombre}</Text>
        <Text size="sm" c="dimmed">
          {perfil?.email}
        </Text>
        <Group gap={4} mt="xs">
          <Badge>{t(`rol.${perfil?.rol ?? 'coordinador'}`)}</Badge>
          {!esAdmin && titulaciones.map((c) => <Badge key={c} variant="light">{c}</Badge>)}
        </Group>
      </Paper>
      <Paper withBorder p="md">
        <form
          onSubmit={form.onSubmit(async (v) => {
            const { error } = await supabase.auth.updateUser({ password: v.password })
            if (error) notifications.show({ color: 'red', title: t('comun.error'), message: error.message })
            else {
              notifications.show({ color: 'green', message: 'Contraseña actualizada' })
              form.reset()
            }
          })}
        >
          <Stack>
            <Title order={4}>Cambiar contraseña</Title>
            <PasswordInput label="Nueva contraseña" autoComplete="new-password" {...form.getInputProps('password')} />
            <PasswordInput label="Repetir contraseña" autoComplete="new-password" {...form.getInputProps('repetir')} />
            <Button type="submit" w="fit-content">
              {t('comun.guardar')}
            </Button>
          </Stack>
        </form>
      </Paper>
    </Stack>
  )
}
