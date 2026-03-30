"""
Service de stockage Cloudflare R2
==================================

Abstraction pour le stockage de fichiers sur Cloudflare R2 (compatible S3).
Gère l'upload, le download, la suppression et la génération d'URLs signées.

Migration progressive:
- Les nouveaux fichiers sont stockés sur R2
- Les anciens fichiers restent en BLOB/disque
- La lecture tente R2 d'abord, puis BLOB, puis disque
"""

import os
import io
import logging
from flask import current_app

logger = logging.getLogger(__name__)

# Client S3 global (initialisé une seule fois)
_s3_client = None


def get_s3_client():
    """Retourne le client S3 configuré pour Cloudflare R2 (singleton)"""
    global _s3_client

    if _s3_client is not None:
        return _s3_client

    try:
        import boto3
        from botocore.config import Config

        account_id = current_app.config.get('R2_ACCOUNT_ID')
        access_key = current_app.config.get('R2_ACCESS_KEY_ID')
        secret_key = current_app.config.get('R2_SECRET_ACCESS_KEY')

        if not all([account_id, access_key, secret_key]):
            logger.warning("R2 non configuré: variables d'environnement manquantes")
            return None

        endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"

        _s3_client = boto3.client(
            's3',
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(
                signature_version='s3v4',
                retries={'max_attempts': 3, 'mode': 'adaptive'}
            ),
            region_name='auto'
        )

        logger.info("Client R2 initialisé avec succès")
        return _s3_client

    except ImportError:
        logger.warning("boto3 non installé - stockage R2 désactivé")
        return None
    except Exception as e:
        logger.error(f"Erreur initialisation R2: {e}")
        return None


def is_r2_enabled():
    """Vérifie si le stockage R2 est activé et configuré"""
    return get_s3_client() is not None


def get_bucket_name():
    """Retourne le nom du bucket R2"""
    return current_app.config.get('R2_BUCKET_NAME', 'profcalendar-files')


def _get_r2_key(user_id, filename, file_type='file'):
    """
    Génère la clé R2 pour un fichier.

    Structure: files/{user_id}/{filename}
               thumbnails/{user_id}/{filename}
    """
    if file_type == 'thumbnail':
        return f"thumbnails/{user_id}/{filename}"
    return f"files/{user_id}/{filename}"


def upload_file_to_r2(file_data, user_id, filename, mime_type=None):
    """
    Upload un fichier vers R2.

    Args:
        file_data: bytes ou objet file-like
        user_id: ID de l'utilisateur
        filename: nom du fichier (UUID.ext)
        mime_type: type MIME du fichier

    Returns:
        str: clé R2 du fichier, ou None si échec
    """
    client = get_s3_client()
    if not client:
        return None

    try:
        key = _get_r2_key(user_id, filename)
        bucket = get_bucket_name()

        extra_args = {}
        if mime_type:
            extra_args['ContentType'] = mime_type

        if isinstance(file_data, bytes):
            client.put_object(
                Bucket=bucket,
                Key=key,
                Body=file_data,
                **extra_args
            )
        else:
            # File-like object
            file_data.seek(0)
            client.upload_fileobj(
                file_data,
                bucket,
                key,
                ExtraArgs=extra_args if extra_args else None
            )

        logger.info(f"Fichier uploadé sur R2: {key} ({mime_type})")
        return key

    except Exception as e:
        logger.error(f"Erreur upload R2 pour {filename}: {e}")
        return None


def upload_thumbnail_to_r2(thumbnail_data, user_id, filename):
    """
    Upload une miniature vers R2.

    Args:
        thumbnail_data: bytes de l'image miniature
        user_id: ID de l'utilisateur
        filename: nom du fichier miniature

    Returns:
        str: clé R2 de la miniature, ou None si échec
    """
    client = get_s3_client()
    if not client:
        return None

    try:
        key = _get_r2_key(user_id, filename, file_type='thumbnail')
        bucket = get_bucket_name()

        client.put_object(
            Bucket=bucket,
            Key=key,
            Body=thumbnail_data,
            ContentType='image/jpeg'
        )

        logger.info(f"Miniature uploadée sur R2: {key}")
        return key

    except Exception as e:
        logger.error(f"Erreur upload miniature R2: {e}")
        return None


def download_file_from_r2(user_id, filename, file_type='file'):
    """
    Télécharge un fichier depuis R2.

    Args:
        user_id: ID de l'utilisateur
        filename: nom du fichier
        file_type: 'file' ou 'thumbnail'

    Returns:
        bytes: contenu du fichier, ou None si introuvable
    """
    client = get_s3_client()
    if not client:
        return None

    try:
        key = _get_r2_key(user_id, filename, file_type)
        bucket = get_bucket_name()

        response = client.get_object(Bucket=bucket, Key=key)
        data = response['Body'].read()

        logger.debug(f"Fichier téléchargé depuis R2: {key} ({len(data)} bytes)")
        return data

    except client.exceptions.NoSuchKey:
        logger.debug(f"Fichier non trouvé sur R2: {_get_r2_key(user_id, filename, file_type)}")
        return None
    except Exception as e:
        logger.error(f"Erreur download R2 pour {filename}: {e}")
        return None


def delete_file_from_r2(user_id, filename, file_type='file'):
    """
    Supprime un fichier de R2.

    Args:
        user_id: ID de l'utilisateur
        filename: nom du fichier
        file_type: 'file' ou 'thumbnail'

    Returns:
        bool: True si supprimé, False si erreur
    """
    client = get_s3_client()
    if not client:
        return False

    try:
        key = _get_r2_key(user_id, filename, file_type)
        bucket = get_bucket_name()

        client.delete_object(Bucket=bucket, Key=key)
        logger.info(f"Fichier supprimé de R2: {key}")
        return True

    except Exception as e:
        logger.error(f"Erreur suppression R2 pour {filename}: {e}")
        return False


def generate_presigned_url(user_id, filename, file_type='file', expires_in=3600):
    """
    Génère une URL signée pour accéder directement au fichier.
    Utile pour le streaming de gros fichiers sans passer par Flask.

    Args:
        user_id: ID de l'utilisateur
        filename: nom du fichier
        file_type: 'file' ou 'thumbnail'
        expires_in: durée de validité en secondes (défaut: 1h)

    Returns:
        str: URL signée, ou None si erreur
    """
    client = get_s3_client()
    if not client:
        return None

    try:
        key = _get_r2_key(user_id, filename, file_type)
        bucket = get_bucket_name()

        url = client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket, 'Key': key},
            ExpiresIn=expires_in
        )

        return url

    except Exception as e:
        logger.error(f"Erreur génération URL signée R2: {e}")
        return None


def get_user_storage_r2(user_id):
    """
    Calcule l'espace utilisé par un utilisateur sur R2.

    Note: Cette fonction peut être lente pour un grand nombre de fichiers.
    Préférer le calcul via la base de données (file_size dans UserFile).

    Returns:
        int: taille totale en octets
    """
    client = get_s3_client()
    if not client:
        return 0

    try:
        bucket = get_bucket_name()
        prefix = f"files/{user_id}/"

        total_size = 0
        paginator = client.get_paginator('list_objects_v2')

        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get('Contents', []):
                total_size += obj['Size']

        return total_size

    except Exception as e:
        logger.error(f"Erreur calcul stockage R2 pour user {user_id}: {e}")
        return 0


def file_exists_on_r2(user_id, filename, file_type='file'):
    """
    Vérifie si un fichier existe sur R2.

    Returns:
        bool: True si le fichier existe
    """
    client = get_s3_client()
    if not client:
        return False

    try:
        key = _get_r2_key(user_id, filename, file_type)
        bucket = get_bucket_name()

        client.head_object(Bucket=bucket, Key=key)
        return True

    except:
        return False
