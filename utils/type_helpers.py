"""
Utilitaires pour la gestion des types de données, notamment pour PostgreSQL
"""

from functools import wraps
from flask import jsonify, request

def safe_int_conversion(value, field_name="ID"):
    """
    Convertit une valeur en entier de manière sécurisée.
    
    Args:
        value: La valeur à convertir (peut être None, int, str)
        field_name: Le nom du champ pour les messages d'erreur
        
    Returns:
        tuple: (success: bool, result: int|None, error_message: str|None)
    """
    if value is None:
        return True, None, None
    
    if isinstance(value, int):
        return True, value, None
    
    try:
        return True, int(value), None
    except (ValueError, TypeError):
        return False, None, f"{field_name} invalide: '{value}'"

def safe_int_list_conversion(values, field_name="IDs"):
    """
    Convertit une liste de valeurs en entiers de manière sécurisée.
    
    Args:
        values: La liste de valeurs à convertir
        field_name: Le nom du champ pour les messages d'erreur
        
    Returns:
        tuple: (success: bool, result: list[int]|None, error_message: str|None)
    """
    if not values:
        return True, [], None
    
    try:
        converted = [int(v) for v in values]
        return True, converted, None
    except (ValueError, TypeError):
        return False, None, f"{field_name} invalides: {values}"

def validate_and_convert_ids(data, id_fields):
    """
    Valide et convertit plusieurs champs ID dans un dictionnaire de données.
    
    Args:
        data: Dictionnaire contenant les données
        id_fields: Dict des champs à convertir {field_name: display_name}
        
    Returns:
        tuple: (success: bool, converted_data: dict, error_message: str|None)
    """
    converted_data = data.copy()
    
    for field_name, display_name in id_fields.items():
        if field_name in data:
            success, result, error = safe_int_conversion(data[field_name], display_name)
            if not success:
                return False, None, error
            converted_data[field_name] = result
    
    return True, converted_data, None

def validate_ids(*id_fields):
    """
    Décorateur pour valider et convertir automatiquement les IDs dans les routes Flask.
    
    Args:
        *id_fields: Noms des champs à convertir en entiers
        
    Usage:
        @validate_ids('classroom_id', 'student_id')
        def ma_route():
            data = request.get_json()
            # classroom_id et student_id sont maintenant des entiers
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            if request.is_json:
                data = request.get_json()
                if data:
                    for field in id_fields:
                        if field in data and data[field] is not None:
                            try:
                                data[field] = int(data[field])
                            except (ValueError, TypeError):
                                return jsonify({
                                    'success': False, 
                                    'message': f'{field} invalide: {data[field]}'
                                }), 400
            return func(*args, **kwargs)
        return wrapper
    return decorator