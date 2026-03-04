"""
Service de génération PDF pour l'archivage de fin d'année.
Génère un rapport PDF consolidé avec les données élèves d'une classe.
"""
import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT


def _safe_str(value):
    """Convertit une valeur en string de manière sûre (gère le chiffrement)."""
    if value is None:
        return ''
    try:
        return str(value)
    except Exception:
        return '[données non lisibles]'


def generate_class_report_pdf(classroom, students_data, school_year_label, teacher_name):
    """
    Génère un PDF de rapport pour une classe entière.

    Args:
        classroom: objet Classroom
        students_data: liste de dicts avec les données par élève
            [{
                'student': Student,
                'absences_count': int,
                'late_count': int,
                'late_minutes_total': int,
                'grades': [{'title': str, 'points': float, 'max': float, 'date': date}],
                'average': float or None,
                'sanctions': [{'name': str, 'count': int}],
                'remarks': [{'content': str, 'date': datetime}],
            }]
        school_year_label: str (ex: "2025-2026")
        teacher_name: str

    Returns:
        bytes: contenu PDF
    """
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=2 * cm,
        leftMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )

    styles = getSampleStyleSheet()

    # Styles personnalisés
    styles.add(ParagraphStyle(
        'ReportTitle',
        parent=styles['Title'],
        fontSize=18,
        spaceAfter=6 * mm,
        textColor=colors.HexColor('#1F2937'),
    ))
    styles.add(ParagraphStyle(
        'ReportSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        spaceAfter=4 * mm,
        textColor=colors.HexColor('#6B7280'),
    ))
    styles.add(ParagraphStyle(
        'StudentName',
        parent=styles['Heading2'],
        fontSize=14,
        spaceBefore=6 * mm,
        spaceAfter=3 * mm,
        textColor=colors.HexColor('#4F46E5'),
    ))
    styles.add(ParagraphStyle(
        'SectionHeader',
        parent=styles['Heading3'],
        fontSize=11,
        spaceBefore=4 * mm,
        spaceAfter=2 * mm,
        textColor=colors.HexColor('#1F2937'),
    ))
    styles.add(ParagraphStyle(
        'CellText',
        parent=styles['Normal'],
        fontSize=9,
        leading=12,
    ))
    styles.add(ParagraphStyle(
        'SmallText',
        parent=styles['Normal'],
        fontSize=8,
        textColor=colors.HexColor('#6B7280'),
    ))

    elements = []

    # --- Page de garde ---
    elements.append(Spacer(1, 4 * cm))
    elements.append(Paragraph('Rapport de classe', styles['ReportTitle']))
    elements.append(Paragraph(
        f'{_safe_str(classroom.name)} — {_safe_str(classroom.subject or "")}',
        styles['ReportSubtitle']
    ))
    elements.append(Spacer(1, 1 * cm))
    elements.append(Paragraph(f'Année scolaire : {school_year_label}', styles['Normal']))
    elements.append(Paragraph(f'Enseignant : {teacher_name}', styles['Normal']))
    elements.append(Paragraph(
        f'Généré le : {datetime.now().strftime("%d/%m/%Y à %H:%M")}',
        styles['Normal']
    ))
    elements.append(Paragraph(
        f'Nombre d\'élèves : {len(students_data)}',
        styles['Normal']
    ))
    elements.append(Spacer(1, 2 * cm))

    # --- Tableau récapitulatif ---
    if students_data:
        elements.append(Paragraph('Récapitulatif', styles['SectionHeader']))

        summary_data = [['Élève', 'Absences', 'Retards', 'Moyenne']]
        for sd in students_data:
            s = sd['student']
            name = f'{_safe_str(s.first_name)} {_safe_str(s.last_name)}'
            avg = f'{sd["average"]:.1f}' if sd.get('average') is not None else '—'
            summary_data.append([
                name,
                str(sd.get('absences_count', 0)),
                str(sd.get('late_count', 0)),
                avg,
            ])

        summary_table = Table(summary_data, colWidths=[8 * cm, 3 * cm, 3 * cm, 3 * cm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4F46E5')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ]))
        elements.append(summary_table)

    # --- Fiches individuelles ---
    for sd in students_data:
        elements.append(PageBreak())
        s = sd['student']
        full_name = f'{_safe_str(s.first_name)} {_safe_str(s.last_name)}'

        elements.append(Paragraph(full_name, styles['StudentName']))
        elements.append(HRFlowable(
            width='100%', thickness=1,
            color=colors.HexColor('#E5E7EB'), spaceAfter=3 * mm
        ))

        # Présences
        elements.append(Paragraph('Présences', styles['SectionHeader']))
        abs_count = sd.get('absences_count', 0)
        late_count = sd.get('late_count', 0)
        late_min = sd.get('late_minutes_total', 0)
        elements.append(Paragraph(
            f'Absences : <b>{abs_count}</b> &nbsp;|&nbsp; '
            f'Retards : <b>{late_count}</b> &nbsp;|&nbsp; '
            f'Minutes de retard cumulées : <b>{late_min}</b>',
            styles['CellText']
        ))

        # Notes / Évaluations
        grades = sd.get('grades', [])
        if grades:
            elements.append(Paragraph('Notes', styles['SectionHeader']))
            grade_data = [['Évaluation', 'Note', 'Date']]
            for g in grades:
                date_str = g['date'].strftime('%d/%m/%Y') if g.get('date') else ''
                points_str = f'{g["points"]}/{g["max"]}' if g.get('max') else str(g.get('points', ''))
                grade_data.append([
                    _safe_str(g.get('title', '')),
                    points_str,
                    date_str,
                ])

            avg = sd.get('average')
            if avg is not None:
                grade_data.append(['Moyenne', f'{avg:.1f}', ''])

            grade_table = Table(grade_data, colWidths=[9 * cm, 4 * cm, 4 * cm])
            grade_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F3F4F6')),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            # Ligne de moyenne en gras
            if avg is not None:
                grade_table.setStyle(TableStyle([
                    ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
                    ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#EEF2FF')),
                ]))
            elements.append(grade_table)

        # Sanctions
        sanctions = sd.get('sanctions', [])
        if sanctions:
            elements.append(Paragraph('Sanctions', styles['SectionHeader']))
            for sanc in sanctions:
                elements.append(Paragraph(
                    f'• {_safe_str(sanc["name"])} : <b>{sanc["count"]}</b> coche(s)',
                    styles['CellText']
                ))

        # Remarques
        remarks = sd.get('remarks', [])
        if remarks:
            elements.append(Paragraph('Remarques', styles['SectionHeader']))
            for rem in remarks:
                date_str = ''
                if rem.get('date'):
                    date_str = rem['date'].strftime('%d/%m/%Y') + ' — '
                elements.append(Paragraph(
                    f'{date_str}{_safe_str(rem["content"])}',
                    styles['CellText']
                ))
                elements.append(Spacer(1, 1 * mm))

    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
