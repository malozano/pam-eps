import { Alert, Button, Group, List, Modal, Stack, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconDeviceMobile, IconRefresh } from '@tabler/icons-react'
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Registra el service worker y avisa cuando hay una versión nueva publicada. */
export function AvisoActualizacion() {
  const {
    needRefresh: [hayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      // Comprobar si hay versión nueva cada hora mientras la aplicación está abierta
      if (registro) setInterval(() => registro.update().catch(() => {}), 60 * 60 * 1000)
    },
  })
  useEffect(() => {
    if (!hayVersionNueva) return
    notifications.show({
      id: 'version-nueva',
      title: 'Hay una versión nueva de la aplicación',
      message: (
        <Group justify="space-between" mt={4}>
          <Text size="sm">Guarda lo que estés haciendo y actualiza.</Text>
          <Button size="xs" leftSection={<IconRefresh size={14} />} onClick={() => updateServiceWorker(true)}>
            Actualizar
          </Button>
        </Group>
      ),
      autoClose: false,
    })
  }, [hayVersionNueva, updateServiceWorker])
  return null
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let eventoInstalacion: BeforeInstallPromptEvent | null = null
if (typeof window !== 'undefined')
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    eventoInstalacion = e as BeforeInstallPromptEvent
  })

export function estaInstalada(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

function plataforma(): 'ios' | 'android' | 'escritorio' {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'escritorio'
}

/** Instrucciones para instalar la aplicación (con instalación directa donde el navegador la permite). */
export function InstalarApp({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const [puedeInstalar, setPuedeInstalar] = useState(!!eventoInstalacion)
  useEffect(() => {
    const h = () => setPuedeInstalar(true)
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  const p = plataforma()

  async function instalar() {
    if (!eventoInstalacion) return
    await eventoInstalacion.prompt()
    const { outcome } = await eventoInstalacion.userChoice
    eventoInstalacion = null
    setPuedeInstalar(false)
    if (outcome === 'accepted') onClose()
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Instalar la aplicación">
      <Stack>
        {estaInstalada() ? (
          <Alert color="green">Ya estás usando la aplicación instalada.</Alert>
        ) : (
          <>
            <Text size="sm">
              La aplicación se puede instalar en el móvil o en el ordenador: aparece con su icono y se abre a pantalla
              completa, sin la barra del navegador.
            </Text>
            {puedeInstalar && (
              <Button leftSection={<IconDeviceMobile size={16} />} onClick={instalar}>
                Instalar ahora
              </Button>
            )}
            {p === 'ios' && (
              <List type="ordered" size="sm" spacing={4}>
                <List.Item>Abre esta página en <b>Safari</b>.</List.Item>
                <List.Item>Pulsa el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</List.Item>
                <List.Item>Elige <b>«Añadir a pantalla de inicio»</b> y confirma con «Añadir».</List.Item>
              </List>
            )}
            {p === 'android' && !puedeInstalar && (
              <List type="ordered" size="sm" spacing={4}>
                <List.Item>Abre esta página en <b>Chrome</b>.</List.Item>
                <List.Item>Pulsa el menú <b>⋮</b> (arriba a la derecha).</List.Item>
                <List.Item>Elige <b>«Instalar aplicación»</b> o «Añadir a pantalla de inicio».</List.Item>
              </List>
            )}
            {p === 'escritorio' && !puedeInstalar && (
              <Text size="sm">
                En Chrome o Edge, pulsa el icono de instalar de la barra de direcciones (o menú ⋮ → «Instalar»).
              </Text>
            )}
          </>
        )}
      </Stack>
    </Modal>
  )
}
