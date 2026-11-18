"""Fiche d'objectifs d'un thème, en PDF (à imprimer pour la classe).

Outil personnel (cf. utils/owner_features.py). La fiche reprend ce que l'élève doit
savoir faire, puis les notions retenues avec leurs exercices et deux cases
d'auto-évaluation. Noir et blanc, une page A4 dans la plupart des cas.
"""
from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Flowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = colors.HexColor('#111827')
MUTED = colors.HexColor('#4B5563')
RULE = colors.HexColor('#9CA3AF')
SOFT = colors.HexColor('#F3F4F6')

# Helvetica (police intégrée) n'a pas ces signes : équivalents lisibles.
GLYPHS = {'ℤ': '<b>Z</b>', 'ℚ': '<b>Q</b>', 'ℕ': '<b>N</b>', 'ℝ': '<b>R</b>', 'ᵇ': '<super>b</super>',
          'ⁿ': '<super>n</super>', '→': '-&gt;', '≤': '&lt;=', '≥': '&gt;=', '≠': '=/=', '√': 'racine de ',
          ' ': ' ', ' ': ' ', '−': '–'}


def _t(text):
    out = escape(text or '')
    for glyph, repl in GLYPHS.items():
        out = out.replace(glyph, repl)
    return out


class _Box(Flowable):
    """Case à cocher dessinée (aucune police intégrée n'a le signe)."""

    def __init__(self, size=3.6 * mm):
        super().__init__()
        self.size = size
        self.width = self.height = size

    def draw(self):
        self.canv.setStrokeColor(INK)
        self.canv.setLineWidth(0.8)
        self.canv.rect(0, 0, self.size, self.size, stroke=1, fill=0)


def build_objectives_pdf(theme, class_label, notions, date_label='', heading='Objectifs',
                         show_objectives=True, show_exercises=True, upcoming=None):
    """PDF de la fiche. `notions` et `upcoming` : listes {n, title, exercises}."""
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                            topMargin=16 * mm, bottomMargin=16 * mm,
                            title=f'{heading} — {theme.label}', author='ProfCalendar')
    kicker = ParagraphStyle('kicker', fontName='Helvetica-Bold', fontSize=9, textColor=MUTED, leading=11, spaceAfter=2)
    h1 = ParagraphStyle('h1', fontName='Helvetica-Bold', fontSize=20, textColor=INK, leading=24, spaceAfter=2)
    meta = ParagraphStyle('meta', fontName='Helvetica', fontSize=10, textColor=MUTED, leading=13, spaceAfter=8)
    h2 = ParagraphStyle('h2', fontName='Helvetica-Bold', fontSize=11, textColor=INK, leading=14, spaceBefore=10, spaceAfter=5)
    body = ParagraphStyle('body', fontName='Helvetica', fontSize=10, textColor=INK, leading=13.5, alignment=TA_LEFT)
    sub = ParagraphStyle('sub', parent=body, leftIndent=14, bulletIndent=5)
    top = ParagraphStyle('top', parent=body, leftIndent=11, bulletIndent=0, spaceBefore=2)
    cell = ParagraphStyle('cell', parent=body, fontSize=10, leading=13)
    small = ParagraphStyle('small', parent=body, fontSize=8.5, leading=11, textColor=MUTED)
    head = ParagraphStyle('head', parent=small, fontName='Helvetica-Bold', textColor=INK)

    story = [Paragraph(_t(heading.upper()), kicker), Paragraph(_t(theme.label), h1)]
    line = ' · '.join(x for x in [class_label, theme.level or '', date_label] if x)
    story.append(Paragraph(_t(line), meta))

    if show_objectives and theme.objectives:
        story.append(Paragraph('Ce que je dois savoir faire', h2))
        for objective in theme.objectives:
            if objective.startswith('– '):
                story.append(Paragraph(_t(objective[2:]), sub, bulletText='–'))
            else:
                story.append(Paragraph(_t(objective), top, bulletText='•'))

    def notion_table(rows, with_boxes):
        widths = [9 * mm, 78 * mm, 49 * mm, 19 * mm, 19 * mm] if with_boxes else [9 * mm, 96 * mm, 69 * mm]
        if not show_exercises:
            widths = [9 * mm, 127 * mm, 19 * mm, 19 * mm] if with_boxes else [9 * mm, 165 * mm]
        header = [Paragraph('N°', head), Paragraph('Notion', head)]
        if show_exercises:
            header.append(Paragraph('Exercices pour réviser', head))
        if with_boxes:
            header += [Paragraph('Je sais faire', head), Paragraph('À revoir', head)]
        data = [header]
        for notion in rows:
            row = [Paragraph(str(notion.get('n') or ''), cell), Paragraph(_t(notion.get('title') or ''), cell)]
            if show_exercises:
                row.append(Paragraph(_t(', '.join(notion.get('exercises') or []) or '—'), small))
            if with_boxes:
                row += [_Box(), _Box()]
            data.append(row)
        table = Table(data, colWidths=widths, repeatRows=1)
        style = [
            ('BACKGROUND', (0, 0), (-1, 0), SOFT),
            ('LINEBELOW', (0, 0), (-1, 0), 0.8, INK),
            ('LINEBELOW', (0, 1), (-1, -1), 0.4, RULE),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
            ('LEFTPADDING', (0, 0), (-1, -1), 4), ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ]
        if with_boxes:
            style += [('ALIGN', (-2, 1), (-1, -1), 'CENTER')]
        table.setStyle(TableStyle(style))
        return table

    if notions:
        story.append(Paragraph('Les notions à connaître', h2))
        story.append(notion_table(notions, with_boxes=True))
    if upcoming:
        story.append(KeepTogether([Paragraph('Ce que nous verrons ensuite', h2), notion_table(upcoming, with_boxes=False)]))
    if theme.revision:
        story.append(Spacer(1, 6))
        story.append(Paragraph('<b>Pour réviser :</b> ' + _t(theme.revision), body))
    if not notions and not upcoming and not (show_objectives and theme.objectives):
        story.append(Paragraph('Aucune notion sélectionnée.', body))

    doc.build(story)
    return buf.getvalue()
