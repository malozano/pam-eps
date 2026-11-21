"""
Prepara la plantilla Word del informe de seguimiento semestral (CEN19) para generarla automáticamente.

- Deja un único bloque de semestre (se rellena el que corresponda: el informe se genera por semestre).
- Titulación y semestre/curso como campos; nombre del coordinador/a y fecha quedan en blanco.
- «Análisis de indicadores»: la instrucción se sustituye por {@tasas} (tablas generadas con formato).
- «Estado de las acciones»: tabla resumen (código, responsable, fecha, origen, estado) y listas con
  viñetas por estado: en proceso / completadas / pendientes / canceladas.
- «Acciones propuestas»: tabla con las acciones ya introducidas para el curso siguiente (si las hay) y
  una fila libre para añadir más a mano.
- Se eliminan las instrucciones [RELLENAR AUTOMÁTICAMENTE …].

Uso:  python3 scripts/preparar_plantilla_informe.py <plantilla.docx> public/plantillas/informe-seguimiento.docx
"""
import copy
import sys

import docx
from docx.table import Table
from docx.text.paragraph import Paragraph

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def poner_texto(p: Paragraph, texto: str, negrita: bool | None = None) -> None:
    runs = p.runs
    if not runs:
        r = p.add_run(texto)
    else:
        runs[0].text = texto
        for x in runs[1:]:
            x._r.getparent().remove(x._r)
        r = p.runs[0]
    if negrita is not None:
        r.font.bold = negrita


def eliminar(p: Paragraph) -> None:
    p._p.getparent().remove(p._p)


def parrafo_despues(p: Paragraph, texto: str = '', negrita: bool = False) -> Paragraph:
    """Inserta un párrafo con el mismo formato de párrafo que p, justo después."""
    nuevo = copy.deepcopy(p._p)
    for r in nuevo.findall(W + 'r'):
        nuevo.remove(r)
    ppr = nuevo.find(W + 'pPr')
    if ppr is not None and ppr.find(W + 'numPr') is not None:  # sin viñeta
        ppr.remove(ppr.find(W + 'numPr'))
    p._p.addnext(nuevo)
    q = Paragraph(nuevo, p._parent)
    if texto:
        q.add_run(texto).font.bold = negrita
    return q


def parrafo_antes(p: Paragraph, texto: str) -> Paragraph:
    nuevo = copy.deepcopy(p._p)
    for r in nuevo.findall(W + 'r'):
        nuevo.remove(r)
    ppr = nuevo.find(W + 'pPr')
    if ppr is not None and ppr.find(W + 'numPr') is not None:
        ppr.remove(ppr.find(W + 'numPr'))
    p._p.addprevious(nuevo)
    q = Paragraph(nuevo, p._parent)
    q.add_run(texto)
    return q


def ajustar_tabla(tabla: Table, proporciones: list[float]) -> None:
    """Reparte el ancho total de la tabla según las proporciones y pone los datos en 9 pt a la izquierda."""
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt
    cols = tabla._tbl.tblGrid.findall(W + 'gridCol')
    total = sum(int(c.get(W + 'w')) for c in cols)
    anchos = [int(total * x) for x in proporciones]
    anchos[-1] = total - sum(anchos[:-1])
    for c, w in zip(cols, anchos):
        c.set(W + 'w', str(w))
    for fila in tabla.rows:
        for celda, w in zip(fila.cells, anchos):
            celda.width = w * 635  # twips -> EMU
    for fila in tabla.rows[1:]:
        for celda in fila.cells:
            for p in celda.paragraphs:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    r.font.size = Pt(9)


def fila_bucle(tabla: Table, campos: list[str], bucle: str, fila_libre: bool = False) -> None:
    """Cabecera + una fila que se repite por cada elemento (+ opcionalmente una fila vacía para añadir a mano)."""
    filas = tabla.rows
    for f in filas[3 if fila_libre else 2:]:
        f._tr.getparent().remove(f._tr)
    for i, (c, campo) in enumerate(zip(tabla.rows[1].cells, campos)):
        texto = '{' + campo + '}'
        if i == 0:
            texto = '{#' + bucle + '}' + texto
        if i == len(campos) - 1:
            texto += '{/' + bucle + '}'
        poner_texto(c.paragraphs[0], texto)


def main(origen: str, destino: str) -> None:
    d = docx.Document(origen)
    t_cab, t_sem1, t_sem2 = d.tables[0], d.tables[1], d.tables[2]

    # Cabecera: titulación (el nombre del coordinador/a se deja en blanco)
    poner_texto(t_cab.rows[0].cells[1].paragraphs[0], '{titulacion}')

    # Un solo bloque de semestre: se conserva el primero y se elimina el segundo
    t_sem2._tbl.getparent().remove(t_sem2._tbl)
    poner_texto(t_sem1.rows[0].cells[0].paragraphs[0], '{semestre}')

    celda = t_sem1.rows[1].cells[0]
    ps = celda.paragraphs
    buscar = lambda inicio: next(p for p in ps if p.text.strip().startswith(inicio))

    # Indicadores: instrucción -> tablas generadas
    poner_texto(buscar('[RELLENAR AUTOMÁTICAMENTE: Poner una tabla'), '{@tasas}', negrita=False)

    # Estado de las acciones (estructura de la plantilla: tabla resumen + listas con viñetas por estado)
    eliminar(buscar('[RELLENAR AUTOMÁTICAMENTE con las acciones'))
    tablas_celda = [Table(e, celda) for e in celda._tc.iterchildren() if e.tag == W + 'tbl']
    tabla_resumen = tablas_celda[0]
    fila_bucle(tabla_resumen, ['codigo', 'responsable', 'fecha', 'origen', 'estado'], 'resumen')
    ajustar_tabla(tabla_resumen, [0.19, 0.2, 0.13, 0.33, 0.15])
    ps = celda.paragraphs
    titulo_proceso = buscar('Las acciones actualmente en proceso son')
    i = next(n for n, p in enumerate(ps) if p._p is titulo_proceso._p)
    vineta = next(p for p in ps[i + 1:] if p._p.find(W + 'pPr/' + W + 'numPr') is not None)
    # {#grupos} {titulo} {#acciones} • {codigo}. {nombre}.{detalle} {/acciones} {/grupos}
    abrir = parrafo_antes(titulo_proceso, '{#grupos}')
    poner_texto(titulo_proceso, '{titulo}')
    parrafo_antes(vineta, '{#acciones}')
    poner_texto(vineta, '{codigo}. {nombre}.', negrita=True)
    vineta.add_run('{detalle}').font.bold = False
    cierre_acc = parrafo_despues(vineta, '{/acciones}')
    vacio = parrafo_despues(cierre_acc)
    cierre = parrafo_despues(vacio, '{/grupos}')
    parrafo_despues(cierre, '{^grupos}No hay acciones de mejora en el plan de este curso.{/grupos}')
    del abrir
    # se quita el resto (grupo «completadas» de ejemplo y párrafos vacíos sobrantes)
    ps = celda.paragraphs
    k = next(n for n, p in enumerate(ps) if p._p is cierre._p)
    for p in ps[k + 2:]:
        eliminar(p)

    # Acciones propuestas: instrucción fuera; la tabla se rellena con las del curso siguiente
    celda7 = t_sem1.rows[7].cells[0]
    eliminar(next(p for p in celda7.paragraphs if p.text.strip().startswith('[RELLENAR AUTOMÁTICAMENTE')))
    tabla_prop = Table(next(e for e in celda7._tc.iterchildren() if e.tag == W + 'tbl'), celda7)
    fila_bucle(tabla_prop, ['codigo', 'nombre', 'responsable', 'fechas'], 'propuestas', fila_libre=True)
    ajustar_tabla(tabla_prop, [0.19, 0.46, 0.2, 0.15])

    # Fecha: se deja para el cierre del informe
    for p in d.paragraphs:
        if p.text.strip().startswith('Fecha:'):
            poner_texto(p, '              Fecha: ')

    d.core_properties.title = 'Informe de seguimiento semestral (CEN19)'
    d.save(destino)
    print('Plantilla preparada:', destino)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
