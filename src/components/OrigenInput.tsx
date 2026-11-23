import { Group, Input, Select, Text, Textarea } from '@mantine/core'
import { etiquetaCurso } from '../lib/cursos'
import { analizarOrigen, componerOrigen, cursoPropuesto, INFORMES, type TipoInforme } from '../lib/origen'

interface Props {
  value: string
  onChange: (v: string) => void
  /** Curso de la acción (para proponer el curso del informe) */
  anyo: number
  /** Plan del centro: el informe anual de centro va primero */
  esCentro: boolean
  error?: React.ReactNode
}

/**
 * Origen de la acción: informe en el que se planteó (uno de los cuatro habituales y su curso) y
 * motivo o problema detectado. Se guarda todo junto en un único texto.
 */
export function OrigenInput({ value, onChange, anyo, esCentro, error }: Props) {
  const o = analizarOrigen(value)
  const informes = esCentro ? INFORMES : [...INFORMES.slice(1), INFORMES[0]]
  const cursos = [anyo - 2, anyo - 1, anyo].map((x) => ({ value: String(x), label: etiquetaCurso(x) }))
  if (o.anyo && !cursos.some((c) => c.value === String(o.anyo))) cursos.unshift({ value: String(o.anyo), label: etiquetaCurso(o.anyo) })

  return (
    <Input.Wrapper
      label="Origen o problema"
      description="Informe en el que se planteó la acción por primera vez y, si quieres, el motivo o problema detectado"
      error={error}
    >
      <Group gap="xs" mt={4} align="flex-start" wrap="wrap">
        <Select
          aria-label="Informe de origen"
          placeholder="Sin informe (solo el motivo)"
          clearable
          style={{ flex: '1 1 300px' }}
          data={informes.map((i) => ({ value: i.tipo, label: i.corto }))}
          value={o.tipo}
          onChange={(t) =>
            onChange(componerOrigen({ tipo: t as TipoInforme | null, anyo: t ? (o.anyo ?? cursoPropuesto(t as TipoInforme, anyo)) : null, motivo: o.motivo }))
          }
        />
        {o.tipo && (
          <Select
            aria-label="Curso del informe"
            w={130}
            allowDeselect={false}
            data={cursos}
            value={String(o.anyo)}
            onChange={(v) => v && onChange(componerOrigen({ ...o, anyo: Number(v) }))}
          />
        )}
      </Group>
      <Textarea
        aria-label="Motivo o problema detectado"
        placeholder="Motivo o problema detectado (p. ej., alta tasa de no presentados en el TFM)"
        autosize
        minRows={1}
        mt="xs"
        value={o.motivo}
        onChange={(e) => onChange(componerOrigen({ ...o, motivo: e.currentTarget.value }))}
      />
      {value && (
        <Text size="xs" c="dimmed" mt={4}>
          Se guardará como: «{value.trim()}»
        </Text>
      )}
    </Input.Wrapper>
  )
}
