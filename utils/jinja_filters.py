from datetime import datetime
import locale

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

def register_filters(app):
    """Enregistre les filtres Jinja2 personnalisés"""
    app.jinja_env.filters['format_date_full'] = format_date_full
    app.jinja_env.filters['format_date'] = format_date