import '@mantine/core/styles.css'
import '@mantine/dates/styles.css'
import '@mantine/notifications/styles.css'
import 'dayjs/locale/es'
import './i18n'

import { Alert, Center, createTheme, MantineProvider } from '@mantine/core'
import { DatesProvider } from '@mantine/dates'
import { ModalsProvider } from '@mantine/modals'
import { Notifications } from '@mantine/notifications'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth/AuthProvider'
import i18n from './i18n'
import { configuracionCompleta } from './lib/supabase'

const theme = createTheme({ primaryColor: 'indigo', defaultRadius: 'md' })
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      {configuracionCompleta ? (
        <QueryClientProvider client={queryClient}>
          <DatesProvider settings={{ locale: 'es', firstDayOfWeek: 1 }}>
            <ModalsProvider>
              <Notifications position="top-right" />
              <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
                <AuthProvider>
                  <App />
                </AuthProvider>
              </BrowserRouter>
            </ModalsProvider>
          </DatesProvider>
        </QueryClientProvider>
      ) : (
        <Center h="100vh" p="md">
          <Alert color="red" title={i18n.t('config.falta')} maw={520}>
            {i18n.t('config.detalle')}
          </Alert>
        </Center>
      )}
    </MantineProvider>
  </StrictMode>,
)
