"""Lecture d'un dossier théorique (PDF) pour en tirer un thème de cours.

Format attendu, celui des dossiers « — Théorie.pdf » :
  page de garde   « NO » + titre, « CE QUE JE DOIS SAVOIR FAIRE (PER) » (objectifs),
                  « EXERCICES À FAIRE » (liste), éventuellement « LES NOTIONS DU CHAPITRE »
  pages suivantes « NOTION 3 · NO105 NO107 … » puis le titre de la notion sur la ligne d'après.

Le résultat reste modifiable à la main dans l'application : une mise en page différente
donne simplement un thème à compléter.
"""
import json
import os
import re

SPECIAL_RE = r'Que sais-je \?(?:\s*p\.\s*\d+)?(?:\s*\d\)(?:\s*et\s*\d\))?)?|Faire le point(?:\s*p\.\s*\d+)?'
CODE_RE = r'[A-Z]{2}\s?\d{1,3}(?:\s+[A-Z](?:,\s*[A-Z])+(?=\s|$))?'
TOKEN_RE = re.compile(f'({SPECIAL_RE}|{CODE_RE})')
NOTION_RE = re.compile(r'^NOTION\s+(\d+)\s*(?:·\s*(.*))?$')
BULLETS = {'•': 'top', '◦': 'sub'}


def _is_domain_line(line):
    """« ◆   ·   N O M B R E S  &  O P É R A T I O N S » : bandeau du domaine."""
    return bool(re.search(r'(?:[A-ZÀ-Ü&] ){4,}', line + ' '))


def _tokens(text):
    """Exercices cités dans un texte, dans l'ordre, libellés normalisés."""
    text = re.sub(r'QUE SAIS-JE \?', 'Que sais-je ?', text)
    text = re.sub(r'FAIRE LE POINT', 'Faire le point', text)
    text = re.sub(r'\bP\.\s*(\d+)', r'p.\1', text)
    out = []
    for raw in TOKEN_RE.findall(text):
        label = re.sub(r'\s+', ' ', raw).strip()
        label = re.sub(r'^([A-Z]{2}) (\d)', r'\1\2', label)       # « NO 103 » → « NO103 »
        label = re.sub(r'p\.\s*(\d+)', r'p.\1', label)
        if label and label not in out:
            out.append(label)
    return out


def _merge_wrapped(lines, marks):
    """Recolle les objectifs coupés par un retour à la ligne.

    `marks` : la suite des puces de la page (« top » / « sub »), dans l'ordre ; vide si
    inconnue. On cherche le découpage le plus plausible : une ligne ne continue la
    précédente que si celle-ci remplissait la largeur, une puce principale commence par
    une majuscule, une sous-puce par une minuscule. Retourne [(texte, 'top'|'sub')]."""
    lines = [l.strip() for l in lines if l.strip()]
    if not lines:
        return []
    if not marks or len(marks) > len(lines):
        out = []
        for i, line in enumerate(lines):
            prev = lines[i - 1] if i else ''
            if out and len(prev) >= 100 and line[:1].islower() and not prev.endswith(':'):
                out[-1] = (out[-1][0] + ' ' + line, 'top')
            else:
                out.append((line, 'top'))
        return out

    def new_cost(i, kind):
        lower = lines[i][:1].islower()
        cost = (5 if lower else 0) if kind == 'top' else (0 if lower else 2)
        if i and len(lines[i - 1]) >= 108:
            cost += 1                      # ligne précédente pleine : coupure probable
        return cost

    def cont_cost(i):
        n = len(lines[i - 1])
        return 0 if n >= 100 else 1 if n >= 80 else 4

    INF = 10 ** 6
    M, N = len(lines), len(marks)
    # best[i][k] = coût minimal après la ligne i avec k puces consommées
    best = [[INF] * (N + 1) for _ in range(M)]
    how = [[None] * (N + 1) for _ in range(M)]
    best[0][1] = new_cost(0, marks[0])
    for i in range(1, M):
        for k in range(1, N + 1):
            if best[i - 1][k] < INF:                      # suite de la puce k
                c = best[i - 1][k] + cont_cost(i)
                if c < best[i][k]:
                    best[i][k], how[i][k] = c, 'cont'
            if best[i - 1][k - 1] < INF:                  # nouvelle puce
                c = best[i - 1][k - 1] + new_cost(i, marks[k - 1])
                if c < best[i][k]:
                    best[i][k], how[i][k] = c, 'new'
    if best[M - 1][N] >= INF:
        return [(l, 'top') for l in lines]
    kinds, k = [None] * M, N
    for i in range(M - 1, 0, -1):
        kinds[i] = how[i][k]
        if kinds[i] == 'new':
            k -= 1
    out, k = [], 0
    for i, line in enumerate(lines):
        if i and kinds[i] == 'cont':
            out[-1] = (out[-1][0] + ' ' + line, out[-1][1])
        else:
            out.append((line, marks[k]))
            k += 1
    return out


def parse_theory_pages(pages):
    """`pages` : texte de chaque page. Retourne un dict prêt pour CourseTheme."""
    first = [l.strip() for l in (pages[0] if pages else '').split('\n') if l.strip()]
    # La liste des notions est parfois repoussée en page 2.
    cover = first + [l.strip() for l in (pages[1] if len(pages) > 1 else '').split('\n') if l.strip()]
    result = {'code': '', 'title': '', 'level': '', 'objectives': [], 'exercises': [], 'notions': [], 'revision': ''}
    if not first:
        return result

    m = re.match(r'^([A-Z]{2})\s*([A-ZÀ-Ü].+)$', first[0])
    if m:
        result['code'], result['title'] = m.group(1), m.group(2).strip()
    else:
        result['title'] = first[0]

    def find(prefix, lines=first):
        return next((i for i, l in enumerate(lines) if l.upper().startswith(prefix)), None)

    i_obj, i_ex = find('CE QUE JE DOIS SAVOIR FAIRE'), find('EXERCICES À FAIRE')
    marks = [BULLETS[l] for l in first if l in BULLETS]

    if i_obj is not None:
        end = i_ex if i_ex is not None and i_ex > i_obj else len(first)
        raw = [l for l in first[i_obj + 1:end] if l not in BULLETS and not _is_domain_line(l)]
        result['objectives'] = [('– ' + text) if kind == 'sub' else text
                                for text, kind in _merge_wrapped(raw, marks)]

    if i_ex is not None:
        chunk = []
        for line in first[i_ex + 1:]:
            if line.upper().startswith(('LES NOTIONS DU CHAPITRE', 'NUMÉROTATION', 'COMMENT LIRE')) or _is_domain_line(line) \
                    or line in BULLETS or re.match(r'^\d+\.$', line):
                break
            rev = re.match(r'^Révision\s*:\s*(.*)$', line)
            if rev:
                result['revision'] = rev.group(1).strip()
                continue
            chunk.append(line)
        result['exercises'] = _tokens(' '.join(chunk))

    level = next((l for l in first if re.match(r'^\d+e année', l)), '')
    result['level'] = level

    # Titres annoncés sur la page de garde (repli si le corps ne les donne pas).
    announced = []
    i_not = find('LES NOTIONS DU CHAPITRE', cover)
    if i_not is not None:
        for line in cover[i_not + 1:]:
            if line.upper().startswith('COMMENT LIRE') or _is_domain_line(line) or line in BULLETS \
                    or re.match(r'^\d+\.$', line) or re.match(r'^\d+e année', line):
                break
            announced.append(line)

    notions = {}
    for page in pages[1:]:
        lines = [l.strip() for l in page.split('\n')]
        for i, line in enumerate(lines):
            m = NOTION_RE.match(line)
            if not m:
                continue
            n = int(m.group(1))
            title = next((x for x in lines[i + 1:i + 4] if x and x.upper() != 'THÉORIE' and not NOTION_RE.match(x)), '')
            if n not in notions:
                notions[n] = {'n': n, 'title': title, 'exercises': _tokens(m.group(2) or '')}
    if not notions and announced:
        notions = {i + 1: {'n': i + 1, 'title': t, 'exercises': []} for i, t in enumerate(announced)}
    for n, notion in notions.items():
        if not notion['title'] and n - 1 < len(announced):
            notion['title'] = announced[n - 1]
    result['notions'] = [notions[n] for n in sorted(notions)]
    return result


def parse_theory_pdf(stream):
    """Lit un PDF (objet fichier) et retourne le thème qu'il décrit."""
    from pypdf import PdfReader          # import tardif : n'est utile que pour l'import
    reader = PdfReader(stream)
    return parse_theory_pages([(page.extract_text() or '') for page in reader.pages])


def default_themes():
    """Thèmes fournis avec l'application (mathématiques 9e, VG niveau 2 et VP)."""
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'owner_themes', 'math_9_vg2_vp.json')
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return []
