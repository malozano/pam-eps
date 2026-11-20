import { AppShell, Burger, Group, Menu, NavLink, Select, Text, UnstyledButton } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import {
  IconChartBar, IconChevronDown, IconDeviceMobile, IconExternalLink, IconHome, IconLogout, IconUser, IconUsers, IconWorld,
} from '@tabler/icons-react'
import { useEffect, useLayoutEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { cambiarIdioma, IDIOMAS } from '../i18n'
import { guardarRutaApp } from '../lib/memoriaVista'
import { estaInstalada, InstalarApp } from './Pwa'

export function Layout() {
  const [abierto, { toggle, close }] = useDisclosure()
  const [instalarAbierto, { open: abrirInstalar, close: cerrarInstalar }] = useDisclosure()
  const { t, i18n } = useTranslation()
  const { perfil, esAdmin, salir } = useAuth()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  // Cada página nueva empieza arriba (el listado del plan restaura después su posición)
  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  // Se recuerda la última página de gestión para poder volver desde los planes públicos
  useEffect(() => {
    guardarRutaApp(pathname + search)
  }, [pathname, search])

  const enlace = (to: string, label: string, icon: React.ReactNode) => (
    <NavLink component={Link} to={to} label={label} leftSection={icon} active={pathname === to} onClick={close} />
  )

  return (
    <AppShell header={{ height: 56 }} navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !abierto } }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Burger opened={abierto} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Menú" />
            <Text fw={700} truncate>
              {t('app.titulo')} · EPS
            </Text>
          </Group>
          <Group gap="xs" wrap="nowrap">
            <Select
              size="xs"
              w={110}
              data={IDIOMAS.map((i) => ({ ...i }))}
              value={i18n.resolvedLanguage}
              onChange={(v) => v && cambiarIdioma(v)}
              allowDeselect={false}
              visibleFrom="xs"
              aria-label="Idioma"
            />
            <Menu position="bottom-end">
              <Menu.Target>
                <UnstyledButton>
                  <Group gap={4} wrap="nowrap">
                    <IconUser size={18} />
                    <Text size="sm" visibleFrom="sm">
                      {perfil?.nombre || perfil?.email}
                    </Text>
                    <IconChevronDown size={14} />
                  </Group>
                </UnstyledButton>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item leftSection={<IconUser size={16} />} onClick={() => navigate('/perfil')}>
                  {t('nav.perfil')}
                </Menu.Item>
                {!estaInstalada() && (
                  <Menu.Item leftSection={<IconDeviceMobile size={16} />} onClick={abrirInstalar}>
                    {t('nav.instalar')}
                  </Menu.Item>
                )}
                <Menu.Item leftSection={<IconLogout size={16} />} onClick={() => salir().then(() => navigate('/login'))}>
                  {t('nav.salir')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar p="xs">
        {enlace('/', t('nav.inicio'), <IconHome size={18} />)}
        {enlace('/indicadores', t('nav.indicadores'), <IconChartBar size={18} />)}
        {esAdmin && enlace('/admin/usuarios', t('nav.usuarios'), <IconUsers size={18} />)}
        <NavLink
          component="a"
          href={`${import.meta.env.BASE_URL}plan`}
          // en la aplicación instalada se abre en la misma ventana (con botón para volver)
          target={estaInstalada() ? undefined : '_blank'}
          rel="noopener"
          label={t('nav.publicos')}
          leftSection={<IconWorld size={18} />}
          rightSection={estaInstalada() ? undefined : <IconExternalLink size={14} />}
        />
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <InstalarApp opened={instalarAbierto} onClose={cerrarInstalar} />
    </AppShell>
  )
}
