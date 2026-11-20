import { Alert, Badge, Card, SimpleGrid, Skeleton, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useTitulaciones } from '../lib/useTitulaciones'

export function Inicio() {
  const { t } = useTranslation()
  const { perfil, titulaciones, esAdmin } = useAuth()
  const { data, isLoading } = useTitulaciones()
  const mias = (data ?? []).filter((tit) => tit.activa && (esAdmin || titulaciones.includes(tit.codigo)))

  return (
    <Stack>
      <Title order={2}>{t('inicio.bienvenida', { nombre: perfil?.nombre || perfil?.email })}</Title>
      <Title order={4} fw={500}>
        {t('inicio.misPlanes')}
      </Title>
      {esAdmin && <Text c="dimmed">{t('inicio.todas')}</Text>}
      {isLoading ? (
        <Skeleton h={100} />
      ) : mias.length === 0 ? (
        <Alert color="yellow">{t('inicio.sinTitulaciones')}</Alert>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {mias.map((tit) => (
            <Card key={tit.codigo} withBorder component={Link} to={`/gestion/${tit.codigo}`}>
              <Badge variant="light" mb={4}>{tit.codigo}</Badge>
              <Text fw={500}>{tit.nombre}</Text>
            </Card>
          ))}
        </SimpleGrid>
      )}
    </Stack>
  )
}
