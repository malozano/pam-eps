import { Center, Loader } from '@mantine/core'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthProvider'

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { cargando, session, esAdmin } = useAuth()
  const location = useLocation()
  if (cargando)
    return (
      <Center h="60vh">
        <Loader />
      </Center>
    )
  if (!session) return <Navigate to="/login" replace state={{ desde: location.pathname }} />
  if (admin && !esAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}
