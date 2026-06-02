"""Conversion automatique de documents bureautiques en PDF via CloudConvert.

Le lecteur du site ne sait afficher que des PDF (et des images). Les fichiers
Word (.doc/.docx) et Pages (.pages) uploadés sont donc convertis en PDF à la
volée, au moment de l'upload, avant d'être stockés.

Pourquoi une conversion *inline* (dans la requête) est acceptable ici :
    En production l'app tourne sous gunicorn avec un worker eventlet
    (sockets monkey-patchés). Un appel réseau bloquant cède donc la main aux
    autres requêtes : attendre CloudConvert ne gèle pas le site. On borne
    quand même chaque appel par un timeout et la durée totale par un deadline,
    pour rester sous le `--timeout 120` de gunicorn.

Configuration :
    Variable d'environnement ``CLOUDCONVERT_API_KEY`` (scopes ``task.read`` et
    ``task.write``). Si elle est absente, la conversion est désactivée et tout
    upload d'un Word/Pages renvoie une erreur claire (les PDF/images ne sont
    pas affectés).

Flux CloudConvert (API v2) :
    1. POST /v2/jobs  → job avec 3 tâches : import/upload → convert → export/url
    2. POST form.url  → envoi du fichier (multipart) sur le formulaire fourni
    3. GET  /v2/jobs/{id} en boucle → attendre status 'finished' (ou 'error')
    4. GET  result.files[0].url → télécharger le PDF
"""

import os
import time

import requests
from flask import current_app

# Formats sources convertis automatiquement en PDF.
CONVERTIBLE_EXTENSIONS = {"doc", "docx", "pages"}

_API_BASE = "https://api.cloudconvert.com/v2"


class ConversionError(Exception):
    """Échec (ou indisponibilité) de la conversion d'un document en PDF."""


def _extension(filename):
    if filename and "." in filename:
        return filename.rsplit(".", 1)[1].lower()
    return ""


def is_conversion_enabled():
    """True si une clé API CloudConvert est configurée."""
    return bool(os.environ.get("CLOUDCONVERT_API_KEY"))


def is_convertible_filename(filename):
    """True si le fichier est un format bureautique à convertir en PDF."""
    return _extension(filename) in CONVERTIBLE_EXTENSIONS


def convert_if_needed(file_bytes, original_filename):
    """Convertit le fichier en PDF s'il s'agit d'un Word/Pages.

    Args:
        file_bytes: contenu binaire du fichier uploadé.
        original_filename: nom d'origine (sert à déterminer le format source).

    Returns:
        Un tuple ``(pdf_bytes, pdf_filename)`` si une conversion a eu lieu,
        sinon ``None`` (le fichier n'est pas un format à convertir).

    Raises:
        ConversionError: si la conversion est nécessaire mais échoue ou n'est
            pas configurée. L'appelant doit alors refuser l'upload.
    """
    if not is_convertible_filename(original_filename):
        return None

    if not is_conversion_enabled():
        raise ConversionError(
            "La conversion automatique en PDF n'est pas configurée sur le serveur. "
            "Convertis le document en PDF avant de l'importer."
        )

    pdf_bytes = _cloudconvert_to_pdf(file_bytes, original_filename)
    base = original_filename.rsplit(".", 1)[0] if "." in original_filename else original_filename
    return pdf_bytes, f"{base}.pdf"


def _find_task(job, name):
    for task in job.get("tasks", []) or []:
        if task.get("name") == name:
            return task
    return None


def _cloudconvert_to_pdf(file_bytes, filename, overall_timeout=100, poll_interval=2):
    """Convertit ``file_bytes`` en PDF via CloudConvert. Renvoie les octets du PDF."""
    api_key = os.environ.get("CLOUDCONVERT_API_KEY")
    headers = {"Authorization": f"Bearer {api_key}"}
    deadline = time.monotonic() + overall_timeout

    # 1) Créer le job (import/upload -> convert -> export/url)
    payload = {
        "tasks": {
            "import-file": {"operation": "import/upload"},
            "convert-file": {
                "operation": "convert",
                "input": "import-file",
                "output_format": "pdf",
            },
            "export-file": {"operation": "export/url", "input": "convert-file"},
        }
    }
    try:
        resp = requests.post(f"{_API_BASE}/jobs", json=payload, headers=headers, timeout=30)
    except requests.RequestException as exc:
        raise ConversionError(f"CloudConvert injoignable : {exc}")
    if resp.status_code == 401:
        raise ConversionError("Clé API CloudConvert invalide.")
    if resp.status_code not in (200, 201):
        raise ConversionError(
            f"Création du job de conversion échouée (HTTP {resp.status_code})."
        )

    job = (resp.json() or {}).get("data", {})
    job_id = job.get("id")
    if not job_id:
        raise ConversionError("Réponse CloudConvert inattendue (job sans identifiant).")

    # 2) Envoyer le fichier sur le formulaire d'upload fourni
    upload_task = _find_task(job, "import-file")
    form = ((upload_task or {}).get("result") or {}).get("form")
    if not form or not form.get("url"):
        raise ConversionError("Formulaire d'upload CloudConvert introuvable.")
    try:
        up = requests.post(
            form["url"],
            data=form.get("parameters", {}),
            files={"file": (filename, file_bytes)},
            timeout=60,
        )
    except requests.RequestException as exc:
        raise ConversionError(f"Échec de l'envoi du fichier à CloudConvert : {exc}")
    if up.status_code not in (200, 201, 204):
        raise ConversionError(f"Envoi du fichier refusé par CloudConvert (HTTP {up.status_code}).")

    # 3) Attendre la fin du job
    while True:
        if time.monotonic() > deadline:
            raise ConversionError("Délai de conversion dépassé. Réessaie plus tard.")
        time.sleep(poll_interval)
        try:
            jr = requests.get(f"{_API_BASE}/jobs/{job_id}", headers=headers, timeout=30)
        except requests.RequestException as exc:
            raise ConversionError(f"CloudConvert injoignable pendant la conversion : {exc}")
        if jr.status_code != 200:
            raise ConversionError(f"Statut du job illisible (HTTP {jr.status_code}).")
        job = (jr.json() or {}).get("data", {})
        status = job.get("status")
        if status == "finished":
            break
        if status == "error":
            raise ConversionError("La conversion a échoué côté CloudConvert (format non pris en charge ?).")

    # 4) Télécharger le PDF résultant
    export_task = _find_task(job, "export-file")
    files = ((export_task or {}).get("result") or {}).get("files") or []
    if not files or not files[0].get("url"):
        raise ConversionError("PDF converti introuvable dans la réponse CloudConvert.")
    try:
        dl = requests.get(files[0]["url"], timeout=60)
    except requests.RequestException as exc:
        raise ConversionError(f"Téléchargement du PDF converti échoué : {exc}")
    if dl.status_code != 200 or not dl.content:
        raise ConversionError(f"Téléchargement du PDF converti échoué (HTTP {dl.status_code}).")

    return dl.content
