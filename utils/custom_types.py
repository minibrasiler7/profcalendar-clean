"""
Types SQLAlchemy personnalisés pour le chiffrement transparent des données.
Les TypeDecorator permettent de chiffrer/déchiffrer automatiquement lors des opérations ORM.
"""
from datetime import date, datetime
from sqlalchemy import TypeDecorator, Text, String
from utils.encryption import encryption_engine


class EncryptedString(TypeDecorator):
    """
    Type SQLAlchemy qui chiffre/déchiffre automatiquement les chaînes courtes.
    Stocké comme Text en base (le chiffrement augmente la taille des données).
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """Chiffre avant l'écriture en base."""
        if value is None:
            return None
        return encryption_engine.encrypt(str(value))

    def process_result_value(self, value, dialect):
        """Déchiffre après la lecture depuis la base."""
        if value is None:
            return None
        return encryption_engine.decrypt(value)


class EncryptedText(TypeDecorator):
    """
    Type SQLAlchemy qui chiffre/déchiffre automatiquement les textes longs.
    Identique à EncryptedString mais sémantiquement distinct.
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """Chiffre avant l'écriture en base."""
        if value is None:
            return None
        return encryption_engine.encrypt(str(value))

    def process_result_value(self, value, dialect):
        """Déchiffre après la lecture depuis la base."""
        if value is None:
            return None
        return encryption_engine.decrypt(value)


class EncryptedDate(TypeDecorator):
    """
    Type SQLAlchemy qui chiffre/déchiffre automatiquement les dates.
    Stocké comme Text en base (la date est convertie en string ISO avant chiffrement).
    """
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        """Convertit la date en string ISO puis chiffre."""
        if value is None:
            return None
        if isinstance(value, (date, datetime)):
            value = value.isoformat()
        return encryption_engine.encrypt(str(value))

    def process_result_value(self, value, dialect):
        """Déchiffre puis convertit la string ISO en date."""
        if value is None:
            return None
        decrypted = encryption_engine.decrypt(value)
        if decrypted is None:
            return None
        try:
            return date.fromisoformat(decrypted)
        except (ValueError, TypeError):
            # Données legacy non chiffrées ou format inattendu
            try:
                return datetime.strptime(decrypted, '%Y-%m-%d').date()
            except (ValueError, TypeError):
                return None
