"""Détection de la plateforme d'où vient la requête HTTP.

Permet de distinguer l'accès via le site web classique et via les apps iOS
natives ProfCalendar (Teacher, Élèves, Parents). Les apps injectent le
marqueur ``ProfCalendarApp-iOS/x.x`` dans leur User-Agent WKWebView.

Ceci est principalement utile pour se conformer aux règles Apple 3.1.1
(paiements digitaux via In-App Purchase obligatoire) : lorsque la requête
vient d'une app iOS native, on doit masquer les flux de souscription Stripe
et rediriger l'utilisateur vers le site web.
"""

from flask import request


IOS_APP_UA_MARKER = "ProfCalendarApp-iOS"


def is_ios_native_app() -> bool:
    """Retourne True si la requête en cours provient d'une app iOS native.

    On regarde en priorité le User-Agent custom injecté par la WKWebView
    Swift. Les navigateurs web normaux n'ont pas ce marqueur, donc cela
    n'affecte pas l'expérience web classique.
    """
    ua = request.headers.get("User-Agent", "")
    return IOS_APP_UA_MARKER in ua


def is_ipad_web_ua() -> bool:
    """Détection serveur grossière (User-Agent uniquement) d'un iPad sur
    le web.

    Sur iPadOS ≥ 13, Safari se présente avec le UA « Macintosh » donc on
    ne peut pas détecter de façon fiable depuis le serveur. La détection
    fine se fait côté JS dans base.html en combinant userAgent et
    navigator.maxTouchPoints > 1 — c'est ce JS qui décide d'afficher
    la bannière. Cette fonction sert seulement à rendre la bannière
    cachée par défaut côté SSR pour éviter le flash sur desktop.
    """
    if is_ios_native_app():
        return False
    ua = request.headers.get("User-Agent", "") or ""
    return "iPad" in ua


def platform_context() -> dict:
    """Retourne un petit dict utilisable dans les templates Jinja."""
    return {
        "is_ios_native_app": is_ios_native_app(),
        "is_ipad_web_ua": is_ipad_web_ua(),
    }
