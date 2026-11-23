import { Alert, Badge, Button, Group, Select, Stack, Table, Text, TextInput } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconPlus } from '@tabler/icons-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { estaAbierta } from '../../lib/seguimiento'
import { supabase } from '../../lib/supabase'
import type { Perfil } from '../../lib/tipos'
import { useAccionesTitulacion } from '../../lib/useCatalogos'

export interface ResponsableCentro {
  nombre: string
  gestor: string | null
  activo: boolean
}

export function useResponsablesCentro() {
  return useQuery({
    queryKey: ['responsables_centro'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('responsables')
        .select('nombre, gestor, activo')
        .eq('para_centro', true)
        .order('nombre')
      if (error) throw error
      return (data as ResponsableCentro[]).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    },
  })
}

/** Asigna a una cuenta exactamente estas responsabilidades del plan del centro (quita las demás). */
export async function asignarResponsabilidades(perfilId: string, nombres: string[]) {
  const { error: e1 } = await supabase.from('responsables').update({ gestor: null }).eq('gestor', perfilId)
  if (e1) throw e1
  if (nombres.length) {
    const { error: e2 } = await supabase.from('responsables').update({ gestor: perfilId }).in('nombre', nombres)
    if (e2) throw e2
  }
}

/**
 * Directorio de responsabilidades del plan del centro: qué cuenta de coordinación transversal
 * gestiona cada una. Las que no tienen cuenta las gestiona la administración.
 */
export function ResponsablesCentro({ usuarios }: { usuarios: Perfil[] }) {
  const qc = useQueryClient()
  const { data: responsables = [], isLoading } = useResponsablesCentro()
  const { data: acciones = [] } = useAccionesTitulacion('CEN')
  const [nuevo, setNuevo] = useState('')
  const transversales = usuarios.filter((u) => u.rol === 'transversal')
  const nombreDe = (id: string) => {
    const u = usuarios.find((x) => x.id === id)
    return u ? u.nombre || u.email : 'Cuenta desconocida'
  }

  const abiertas = useMemo(() => {
    const m = new Map<string, number>()
    for (const a of acciones) if (a.responsable && estaAbierta(a.estado)) m.set(a.responsable, (m.get(a.responsable) ?? 0) + 1)
    return m
  }, [acciones])
  // Responsables escritos en acciones del CEN que no están en el directorio (no se pueden asignar)
  const desconocidos = [...abiertas.entries()].filter(([r]) => !responsables.some((x) => x.nombre === r))
  const sinResponsable = acciones.filter((a) => !a.responsable && estaAbierta(a.estado)).length

  const refrescar = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['responsables_centro'] }), qc.invalidateQueries({ queryKey: ['responsables'] })])
  const fallo = (e: Error) => notifications.show({ color: 'red', title: 'No se ha guardado', message: e.message })

  async function asignar(nombre: string, gestor: string | null) {
    const { error } = await supabase.from('responsables').update({ gestor }).eq('nombre', nombre)
    if (error) return fallo(error)
    await refrescar()
    notifications.show({ color: 'green', message: gestor ? `${nombre}: asignada a ${nombreDe(gestor)}` : `${nombre}: la gestiona la administración` })
  }

  async function anyadir() {
    const nombre = nuevo.trim()
    if (!nombre) return
    const existente = (await supabase.from('responsables').select('nombre').eq('nombre', nombre).maybeSingle()).data
    const { error } = existente
      ? await supabase.from('responsables').update({ para_centro: true, activo: true }).eq('nombre', nombre)
      : await supabase.from('responsables').insert({ nombre, para_centro: true, para_titulaciones: false })
    if (error) return fallo(error)
    setNuevo('')
    await refrescar()
  }

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        Cada responsabilidad del plan del centro puede tener una cuenta de coordinación transversal (normalmente con el
        correo institucional del cargo). Esa cuenta ve sus acciones y registra su seguimiento; tú recibes un aviso de cada
        cambio. Una cuenta puede tener varias responsabilidades (por ejemplo, «Coordinación EPS» y «Dirección
        departamentos»). Las que no tienen cuenta las gestiona la administración. Los planes de las titulaciones no
        cambian: todo lo gestiona su coordinación.
      </Text>
      {transversales.length === 0 && (
        <Alert color="blue" variant="light">
          Todavía no hay cuentas de coordinación transversal. Créalas en la pestaña «Cuentas» con el rol «Coordinación
          transversal».
        </Alert>
      )}
      {desconocidos.length > 0 && (
        <Alert color="yellow" title="Responsables que no están en el directorio">
          Estas acciones abiertas del plan del centro tienen un responsable que no está en la lista, así que no se pueden
          asignar a ninguna cuenta y las gestiona la administración. Corrige el responsable de esas acciones o añádelo
          abajo: {desconocidos.map(([r, n]) => `«${r}» (${n})`).join(', ')}.
        </Alert>
      )}
      <Table.ScrollContainer minWidth={620}>
        <Table striped verticalSpacing={6}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Responsabilidad</Table.Th>
              <Table.Th w={320}>Cuenta que la gestiona</Table.Th>
              <Table.Th ta="right">Acciones abiertas</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading && (
              <Table.Tr><Table.Td colSpan={3}>Cargando…</Table.Td></Table.Tr>
            )}
            {responsables.map((r) => (
              <Table.Tr key={r.nombre} opacity={r.activo ? 1 : 0.5}>
                <Table.Td>
                  <Text size="sm">{r.nombre}</Text>
                  {!r.activo && <Badge size="xs" color="gray" variant="outline">Inactiva</Badge>}
                </Table.Td>
                <Table.Td>
                  <Select
                    size="xs"
                    aria-label={`Cuenta de ${r.nombre}`}
                    placeholder="Administración (sin cuenta asignada)"
                    clearable
                    value={r.gestor}
                    onChange={(v) => asignar(r.nombre, v)}
                    data={[
                      ...transversales.map((u) => ({ value: u.id, label: `${u.nombre || u.email}${u.activo ? '' : ' (desactivada)'}` })),
                      // una cuenta asignada que ya no es transversal se muestra para poder quitarla
                      ...(r.gestor && !transversales.some((u) => u.id === r.gestor) ? [{ value: r.gestor, label: `${nombreDe(r.gestor)} (no es transversal)` }] : []),
                    ]}
                  />
                </Table.Td>
                <Table.Td ta="right">{abiertas.get(r.nombre) ?? '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {sinResponsable > 0 && (
        <Text size="xs" c="dimmed">
          Hay {sinResponsable === 1 ? '1 acción abierta' : `${sinResponsable} acciones abiertas`} del plan del centro sin
          responsable: las gestiona la administración.
        </Text>
      )}
      <Group align="flex-end">
        <TextInput label="Nueva responsabilidad del plan del centro" placeholder="p. ej. Coordinación de deportes" w={360}
          value={nuevo} onChange={(e) => setNuevo(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && anyadir()} />
        <Button variant="default" leftSection={<IconPlus size={16} />} onClick={anyadir} disabled={!nuevo.trim()}>
          Añadir
        </Button>
      </Group>
    </Stack>
  )
}
