"""En-têtes HTTP sûrs (partagé par toutes les routes qui servent un fichier)."""

from urllib.parse import quote


def content_disposition(disposition, filename):
    """Content-Disposition sûr : repli ASCII + RFC 5987 pour l'UTF-8.

    Les en-têtes HTTP sont encodés en latin-1 : un nom de fichier contenant un
    caractère hors latin-1 — typiquement le tiret cadratin « — » (U+2014) très
    courant dans les noms de documents (« … VP — Théorie.pdf ») — faisait
    échouer l'encodage AU MOMENT D'ENVOYER LA RÉPONSE, donc un 502 côté client
    et un document « introuvable » alors qu'il existait bien.
    """
    name = filename or 'fichier'
    fallback = name.encode('ascii', 'ignore').decode().replace('"', '') or 'fichier'
    return f"{disposition}; filename=\"{fallback}\"; filename*=UTF-8''{quote(name)}"
