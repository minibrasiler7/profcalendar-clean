from datetime import datetime
import locale
import re

def format_date_full(date_obj):
    """Formate une date en français complet (ex: lundi 23 août 2025)"""
    if not date_obj:
        return ''
    
    # Noms des jours en français
    jours = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
    
    # Noms des mois en français
    mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
            'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    
    if isinstance(date_obj, str):
        try:
            date_obj = datetime.strptime(date_obj, '%Y-%m-%d').date()
        except:
            return date_obj
    
    # Obtenir le jour de la semaine (0=lundi)
    jour_semaine = jours[date_obj.weekday()]
    
    # Obtenir le mois
    nom_mois = mois[date_obj.month - 1]
    
    return f"{jour_semaine} {date_obj.day} {nom_mois} {date_obj.year}"

def format_date(date_obj):
    """Formate une date courte (ex: 23 août 2025)"""
    if not date_obj:
        return ''
    
    # Noms des mois en français
    mois = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
            'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
    
    if isinstance(date_obj, str):
        try:
            date_obj = datetime.strptime(date_obj, '%Y-%m-%d').date()
        except:
            return date_obj
    
    # Obtenir le mois
    nom_mois = mois[date_obj.month - 1]
    
    return f"{date_obj.day} {nom_mois} {date_obj.year}"

def render_planning_with_checkboxes(planning):
    """Transforme le texte de planification en HTML avec checkboxes interactives"""
    if not planning or not planning.description:
        return ''
    
    # Récupérer les états des checkboxes
    states = planning.get_checklist_states()
    
    # Pattern pour détecter les checkboxes
    checkbox_pattern = r'^(\s*)\[([ x])\]\s*(.*)$'
    lines = planning.description.split('\n')
    result_lines = []
    checkbox_index = 0
    
    for line in lines:
        match = re.match(checkbox_pattern, line, re.IGNORECASE)
        if match:
            indent = match.group(1)
            content = match.group(3)
            is_checked = states.get(str(checkbox_index), False)
            
            # Créer le HTML de la checkbox
            checked_attr = 'checked' if is_checked else ''
            checkbox_html = f'''<div style="margin-left: {len(indent) * 20}px;">
                <input type="checkbox" class="planning-checkbox" id="checkbox_{checkbox_index}" 
                       data-index="{checkbox_index}" {checked_attr}
                       onchange="updateCheckboxState({checkbox_index}, this.checked)">
                <label for="checkbox_{checkbox_index}" class="planning-checkbox-label">{content}</label>
            </div>'''
            
            result_lines.append(checkbox_html)
            checkbox_index += 1
        else:
            # Ligne normale, échapper le HTML et conserver les retours à la ligne
            escaped_line = line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            if escaped_line.strip():
                result_lines.append(f'<div>{escaped_line}</div>')
            else:
                result_lines.append('<br>')
    
    return '\n'.join(result_lines)

def register_filters(app):
    """Enregistre les filtres Jinja2 personnalisés"""
    app.jinja_env.filters['format_date_full'] = format_date_full
    app.jinja_env.filters['format_date'] = format_date
    app.jinja_env.filters['render_planning_with_checkboxes'] = render_planning_with_checkboxes
    print(f"✅ Filtres Jinja2 enregistrés: {list(app.jinja_env.filters.keys())}")
    print(f"✅ render_planning_with_checkboxes présent: {'render_planning_with_checkboxes' in app.jinja_env.filters}")