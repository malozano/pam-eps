import { Anchor, Center, Stack, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

export function NoEncontrada() {
  const { t } = useTranslation()
  return (
    <Center h="60vh">
      <Stack align="center">
        <Title order={3}>{t('noEncontrada')}</Title>
        <Anchor component={Link} to="/">
          {t('nav.inicio')}
        </Anchor>
      </Stack>
    </Center>
  )
}
