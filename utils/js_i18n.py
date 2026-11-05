"""Traductions des textes affichés par les fichiers static/js.

Dans un fichier JS, un texte affiché s'écrit `pcT('Texte français', {n: 3})`
(jetons `{n}` remplacés côté navigateur). Au démarrage, on relève tous les
msgids `pcT('…')` des fichiers static/js/*.js ; base.html reçoit ensuite, pour
la langue de la page, le dictionnaire {msgid: traduction} (vide en français,
puisque le msgid EST le texte français). Les traductions viennent du catalogue
habituel (scripts/build_translations.py).

Le dictionnaire est servi à part (/i18n/<langue>.js, versionné et mis en
cache un an par le navigateur) : en ligne, il alourdissait chaque page de
~150 Ko dans les autres langues.

Règles pour les msgids JS : une chaîne littérale simple (pas de concaténation
ni de gabarit `...`), pas de `%` (utiliser un jeton `{pct}`).
"""
import glob
import hashlib
import json
import os
import re

_PAT = re.compile(r"""pcT\(\s*(['"])((?:\\.|(?!\1).)*)\1""", re.S)
_msgids = None
_cache = {}


def _unescape(raw):
    return re.sub(r'\\(.)', lambda m: {'n': '\n', 't': '\t'}.get(m.group(1), m.group(1)), raw)


def js_msgids(static_folder):
    """Tous les msgids pcT('…') des fichiers static/js (relevés une fois par processus)."""
    global _msgids
    if _msgids is None:
        found = set()
        for path in glob.glob(os.path.join(static_folder, 'js', '*.js')):
            with open(path, encoding='utf-8', errors='ignore') as f:
                for _q, raw in _PAT.findall(f.read()):
                    found.add(_unescape(raw))
        _msgids = sorted(found)
    return _msgids


def js_translations(app, lang=None):
    """{msgid: traduction} pour `lang` (par défaut la langue de la requête) ; {} en français."""
    from flask_babel import get_locale, gettext, force_locale
    loc = str(lang or get_locale() or 'fr')
    if loc.startswith('fr') or loc not in app.config.get('LANGUAGES', {}):
        return {}
    if loc not in _cache:
        out = {}
        with force_locale(loc):
            for msgid in js_msgids(app.static_folder):
                translated = gettext(msgid)
                if translated != msgid:
                    out[msgid] = translated
        _cache[loc] = out
    return _cache[loc]


_version = None


def bundle_version(app):
    """Change dès que les catalogues ou les fichiers JS changent (cache navigateur)."""
    global _version
    if _version is None:
        h = hashlib.md5()
        for path in sorted(glob.glob(os.path.join(app.root_path, 'translations', '*', 'LC_MESSAGES', 'messages.mo'))):
            with open(path, 'rb') as f:
                h.update(f.read())
        h.update('\n'.join(js_msgids(app.static_folder)).encode('utf-8'))
        _version = h.hexdigest()[:10]
    return _version


def register_js_i18n(app):
    @app.route('/i18n/<lang>.js')
    def js_i18n_bundle(lang):
        from flask import Response
        body = 'window.PC_I18N = ' + json.dumps(js_translations(app, lang), ensure_ascii=False) + ';\n'
        resp = Response(body, mimetype='application/javascript')
        resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
        return resp
