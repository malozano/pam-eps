import { Anchor, Text, type TextProps } from '@mantine/core'
import { trocearEnlaces } from '../lib/informe'

/** Texto multilínea en el que las URL se muestran como enlaces. */
export function TextoConEnlaces({ texto, ...props }: { texto: string } & TextProps) {
  return (
    <Text style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} {...props}>
      {trocearEnlaces(texto).map((p, i) =>
        p.url ? (
          <Anchor key={i} href={p.url} target="_blank" rel="noopener noreferrer" inherit>
            {p.texto}
          </Anchor>
        ) : (
          <span key={i}>{p.texto}</span>
        ),
      )}
    </Text>
  )
}
