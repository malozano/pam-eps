"""
Prepara la plantilla Word oficial del plan de acciones de mejora para generarla automáticamente.

Toma la plantilla de la UA («Plantilla_PlanAccionesMejora-Título», V03 junio 2026) y sustituye los
textos de ejemplo por marcas de docxtemplater ({titulo}, bucles {#plan}…{/plan}, etc.), conservando
todo el formato (logo, estilos, anchos de columna, pie de página). Elimina las instrucciones dirigidas
a quien rellena la plantilla.

Uso:  python3 scripts/preparar_plantilla_word.py <plantilla.docx> public/plantillas/plan-mejora.docx
Si la UA publica una versión nueva de la plantilla, basta con volver a ejecutarlo sobre ella.
"""
import sys

import docx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt
from docx.table import Table
from docx.text.paragraph import Paragraph

# Anchos de columna (cm) adaptados al contenido real; se mantiene el ancho total de cada tabla
# de la plantilla. Para conservar los anchos originales, dejar estas listas vacías.
ANCHOS_PLAN = [3.0, 4.5, 6.5, 2.8, 2.0, 2.4, 5.3]               # total 26.5
ANCHOS_ANTERIOR = [3.3, 3.8, 4.6, 2.6, 2.2, 2.1, 3.3, 5.07]     # total 26.97
LETRA_DATOS = Pt(8)
LETRA_CABECERA = Pt(8.5)


def poner_texto(p: Paragraph, texto: str) -> None:
    """Pone el texto en el primer run (conserva su formato) y vacía el resto."""
    runs = p.runs
    if not runs:
        p.add_run(texto)
        return
    runs[0].text = texto
    for r in runs[1:]:
        r._r.getparent().remove(r._r)


def como_aviso(p: Paragraph) -> None:
    """Texto de aviso (sin acciones): cursiva normal, sin la negrita/subrayado de las instrucciones."""
    for r in p.runs:
        r.font.bold = False
        r.font.underline = False
        r.font.italic = True


def eliminar(p: Paragraph) -> None:
    p._p.getparent().remove(p._p)


def fijar_anchos(tabla: Table, anchos: list[float]) -> None:
    if not anchos:
        return
    cols = tabla._tbl.tblGrid.findall(qn('w:gridCol'))
    assert len(cols) == len(anchos)
    for col, cm in zip(cols, anchos):
        col.set(qn('w:w'), str(int(Cm(cm).twips)))
    for fila in tabla.rows:
        for celda, cm in zip(fila.cells, anchos):
            celda.width = Cm(cm)


def no_partir_fila(fila) -> None:
    """Evita que una fila (una acción) se parta entre dos páginas."""
    trPr = fila._tr.get_or_add_trPr()
    if trPr.find(qn('w:cantSplit')) is None:
        trPr.append(trPr.makeelement(qn('w:cantSplit'), {}))


def fila_bucle(tabla: Table, campos: list[str], bucle: str) -> None:
    """Deja la cabecera y una única fila con los campos; la fila se repite para cada acción."""
    for fila in tabla.rows[2:]:
        fila._tr.getparent().remove(fila._tr)
    # Cabecera: alineada a la izquierda y algo más pequeña para que no se partan las palabras
    for celda in tabla.rows[0].cells:
        for p in celda.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for r in p.runs:
                r.font.size = LETRA_CABECERA
    no_partir_fila(tabla.rows[1])
    celdas = tabla.rows[1].cells
    assert len(celdas) == len(campos), (len(celdas), campos)
    for i, (celda, campo) in enumerate(zip(celdas, campos)):
        texto = '{' + campo + '}'
        if i == 0:
            texto = '{#' + bucle + '}' + texto
        if i == len(campos) - 1:
            texto = texto + '{/' + bucle + '}'
        p = celda.paragraphs[0]
        poner_texto(p, texto)
        # Datos en Arial 8, alineados a la izquierda (en la plantilla las celdas vacías eran justificadas)
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        r = p.runs[0]
        r.font.name = 'Arial'
        r.font.size = LETRA_DATOS
        r.font.bold = False


def main(origen: str, destino: str) -> None:
    d = docx.Document(origen)

    # Cabecera: nombre del centro
    for p in d.sections[0].header.paragraphs:
        if '[Nombre Facultad/Escuela]' in p.text:
            poner_texto(p, '{centro}')

    cuerpo = list(d.element.body.iterchildren())
    parrafos = [Paragraph(e, d) for e in cuerpo if e.tag.endswith('}p')]
    tablas = [Table(e, d) for e in cuerpo if e.tag.endswith('}tbl')]
    assert len(tablas) == 2, 'Se esperaban dos tablas'

    def buscar(inicio: str) -> Paragraph:
        for p in parrafos:
            if p.text.strip().startswith(inicio):
                return p
        raise SystemExit(f'No se encuentra el párrafo «{inicio}…» en la plantilla')

    poner_texto(buscar('Plan de mejora de la titulación'), '{titulo}')
    fijar_anchos(tablas[0], ANCHOS_PLAN)
    fijar_anchos(tablas[1], ANCHOS_ANTERIOR)
    fila_bucle(tablas[0], ['codigo', 'nombre', 'tareas', 'responsable', 'plazo', 'indicador', 'observaciones'], 'plan')
    aviso = buscar('Se han de incluir tantas filas como acciones de mejora haya')
    poner_texto(aviso, '{^plan}No hay acciones de mejora en el plan para este curso.{/plan}')
    como_aviso(aviso)

    poner_texto(buscar('Estado de las acciones de mejora del curso académico anterior'),
                'Estado de las acciones de mejora del curso académico anterior {cursoAnterior}')
    poner_texto(buscar('El Plan de mejora del curso anterior está disponible'),
                '{#hayAnterior}El Plan de mejora del curso anterior está disponible en la web del título en el apartado '
                'Calidad/Seguimiento: informes internos/Planes de mejora y también en ASTUA en el registro '
                'UA06-Plan de mejora{/hayAnterior}')
    eliminar(buscar('Ej:'))
    eliminar(buscar('Se copia la tabla del plan anterior'))
    fila_bucle(tablas[1], ['codigo', 'nombre', 'tareas', 'responsable', 'plazo', 'indicador', 'estado', 'evidencias'],
               'anterior')
    aviso = buscar('Se han de incluir tantas filas como acciones de mejora tuviera el plan')
    poner_texto(aviso, '{^anterior}En el curso {cursoAnterior} no hay acciones de mejora.{/anterior}')
    como_aviso(aviso)

    d.core_properties.title = 'Plan de acciones de mejora'
    d.save(destino)
    print('Plantilla preparada:', destino)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
