"""
Moteur de chiffrement pour ProfCalendar.
Utilise Fernet (AES-128-CBC) pour le chiffrement symétrique des données sensibles.
"""
import os
import hashlib
import logging
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)


class EncryptionEngine:
    """Singleton pour gérer le chiffrement/déchiffrement des données."""

    _instance = None
    _fernet = None
    _key = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def init_app(self, app=None):
        """Initialise le moteur avec la clé depuis les variables d'environnement."""
        key = None
        if app:
            key = app.config.get('ENCRYPTION_KEY')
        if not key:
            key = os.environ.get('ENCRYPTION_KEY')

        if not key:
            logger.warning(
                "ENCRYPTION_KEY non définie. Le chiffrement est désactivé. "
                "Générez une clé avec: python scripts/generate_encryption_key.py"
            )
            self._fernet = None
            self._key = None
            return

        try:
            # La clé Fernet doit être en bytes
            if isinstance(key, str):
                key = key.encode('utf-8')
            self._fernet = Fernet(key)
            self._key = key
            logger.info("Moteur de chiffrement initialisé avec succès.")
        except Exception as e:
            logger.error(f"Erreur d'initialisation du chiffrement: {e}")
            self._fernet = None
            self._key = None

    @property
    def is_enabled(self):
        """Vérifie si le chiffrement est activé."""
        return self._fernet is not None

    def encrypt(self, plaintext):
        """
        Chiffre une chaîne de texte.
        Retourne le texte chiffré encodé en UTF-8, ou le texte original si le chiffrement est désactivé.
        """
        if plaintext is None:
            return None

        if not self.is_enabled:
            return plaintext

        try:
            if isinstance(plaintext, str):
                plaintext = plaintext.encode('utf-8')
            encrypted = self._fernet.encrypt(plaintext)
            return encrypted.decode('utf-8')
        except Exception as e:
            logger.error(f"Erreur de chiffrement: {e}")
            return plaintext if isinstance(plaintext, str) else plaintext.decode('utf-8')

    def decrypt(self, ciphertext):
        """
        Déchiffre une chaîne de texte chiffrée.
        Retourne le texte en clair, ou le texte original si le chiffrement est désactivé.
        """
        if ciphertext is None:
            return None

        if not self.is_enabled:
            return ciphertext

        try:
            if isinstance(ciphertext, str):
                ciphertext = ciphertext.encode('utf-8')
            decrypted = self._fernet.decrypt(ciphertext)
            return decrypted.decode('utf-8')
        except Exception as e:
            # Si le déchiffrement échoue, c'est peut-être du texte non chiffré (données legacy)
            logger.debug(f"Déchiffrement échoué (données non chiffrées ?): {e}")
            return ciphertext if isinstance(ciphertext, str) else ciphertext.decode('utf-8')

    @staticmethod
    def hash_email(email):
        """
        Génère un hash SHA-256 d'une adresse email pour la recherche.
        Le hash est déterministe : même email → même hash.
        """
        if email is None:
            return None
        normalized = email.strip().lower()
        return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


# Instance globale
encryption_engine = EncryptionEngine()


def generate_key():
    """Génère une nouvelle clé Fernet."""
    return Fernet.generate_key().decode('utf-8')
