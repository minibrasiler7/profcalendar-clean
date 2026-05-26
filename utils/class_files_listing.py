"""Helper centralisé pour lister les fichiers d'une classe.

Historique : trois endpoints (planning, file_manager, class_files API) listaient
les fichiers d'une classe avec des logiques DIVERGENTES :

  /planning/get-class-resources  → lisait V2 + legacy, MAIS supprimait silencieusement
                                    les entrées v2 "orphelines" (sans own_* ET sans
                                    UserFile source). Bug : si un enseignant déplaçait
                                    un fichier source après l'avoir copié dans une
                                    classe, la prochaine ouverture du calendrier
                                    SUPPRIMAIT les entrées v2 → fichiers invisibles
                                    après ce point.

  /file_manager/get-class-files  → ne lisait QUE v2.

  /api/class-files/list           → ne lisait QUE legacy (via l'alias
                                    `LegacyClassFile as ClassFile` en haut du
                                    fichier).

Conséquences observées :
  - "11VG2" : fichiers en v2 avec UserFile source supprimé → calendar ne pouvait
              pas les ouvrir (le bug du PDF).
  - "11VG3 sciences" : v2 supprimés silencieusement par get_class_resources →
                       calendar montre vide ; legacy intacts → file_manager OK.

Cette fonction unifie tout :
  - lit les DEUX tables (`class_files_v2` et `class_files`)
  - NE SUPPRIME JAMAIS rien (un read endpoint ne doit pas muter)
  - retourne des dicts normalisés que les routes peuvent sérialiser tels quels
  - garde une trace des fichiers cassés (broken references) au lieu de les cacher
"""

from typing import List, Dict, Any, Optional, Tuple
from flask import current_app


def list_classroom_files(classroom_id: int,
                          include_exercises: bool = False) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Liste TOUS les fichiers attachés à une classe (v2 + legacy + optionnellement exercices).

    Args:
        classroom_id: id de la classe à interroger
        include_exercises: si True, ajoute aussi les exercices interactifs liés

    Returns:
        Tuple (pinned_files, files) où chaque entrée est un dict avec les clés:
          id, original_filename, file_type, file_size, folder_path,
          is_pinned, pin_order, uploaded_at, source ('v2'|'legacy'|'exercise'),
          broken_reference (bool, True si v2 sans own_* + sans UserFile)

    Cette fonction NE supprime AUCUNE ligne en base. Elle journalise les
    références cassées pour diagnostic mais les retourne quand même
    (avec broken_reference=True) pour que l'utilisateur sache qu'il y a eu
    un fichier — ainsi on évite la surprise "mes fichiers ont disparu".
    """
    from models.class_file import ClassFile
    from models.student import LegacyClassFile

    pinned: List[Dict[str, Any]] = []
    files: List[Dict[str, Any]] = []

    # ----- V2 -----
    v2_files = ClassFile.query.filter_by(classroom_id=classroom_id).all()
    v2_count_total = len(v2_files)
    v2_count_broken = 0

    for f in v2_files:
        filename = f.own_original_filename
        filetype = f.own_file_type
        filesize = f.own_file_size
        broken = False

        if not filename:
            uf = f.user_file  # propriété, retourne None si introuvable
            if uf:
                filename = uf.original_filename
                filetype = filetype or uf.file_type
                filesize = filesize if filesize is not None else uf.file_size
            else:
                # Référence cassée : on la signale mais on ne supprime PAS.
                # Le fichier R2 peut toujours exister (r2_key sur l'entrée v2),
                # même si le UserFile source a été perdu côté file_manager.
                broken = True
                v2_count_broken += 1
                filename = f'(Fichier sans titre #{f.id})'
                filetype = filetype or 'unknown'
                filesize = filesize if filesize is not None else 0

        # Normaliser folder_path : sans slash final (cf. note legacy plus bas).
        v2_folder_path = (f.folder_path or '').rstrip('/')

        entry = {
            'id': f.id,
            'source': 'v2',
            'broken_reference': broken,
            'original_filename': filename,
            'file_type': filetype or 'unknown',
            'file_size': filesize or 0,
            'folder_path': v2_folder_path,
            'is_pinned': bool(f.is_pinned),
            'pin_order': f.pin_order or 0,
            'uploaded_at': f.copied_at.isoformat() if f.copied_at else None,
        }
        if f.is_pinned:
            pinned.append(entry)
        else:
            files.append(entry)

    # ----- Legacy -----
    legacy_files = LegacyClassFile.query.filter_by(classroom_id=classroom_id).all()
    legacy_count_total = len(legacy_files)

    for f in legacy_files:
        # Le folder_path est encodé dans `description` pour le legacy :
        #   "Copié dans le dossier: Sciences/Chap. 1"
        #
        # Normalisation du slash final : l'upload de dossier côté JS construit
        # le path avec un slash final ("Test/"), mais les frontends qui lisent
        # cette API (lesson_view, file_manager) comparent sans slash final
        # ("Test"). Sans cette normalisation, lesson_view trouvait bien le
        # fichier dans son filtre mais n'arrivait pas à l'afficher dans le
        # dossier ouvert (relativePath devenait "" → fichier orphelin).
        # On strip systématiquement les "/" en fin pour aligner toutes les
        # vues sur la même convention sans-slash, indépendamment de ce qui
        # a été stocké historiquement.
        folder_path = ''
        if f.description and 'Copié dans le dossier:' in f.description:
            folder_path = f.description.split('Copié dans le dossier:')[1].strip().rstrip('/')

        entry = {
            'id': f.id,
            'source': 'legacy',
            'broken_reference': False,
            'original_filename': f.original_filename or f'(Fichier #{f.id})',
            'file_type': f.file_type or 'unknown',
            'file_size': f.file_size or 0,
            'folder_path': folder_path,
            'is_pinned': bool(f.is_pinned),
            'pin_order': f.pin_order or 0,
            'uploaded_at': f.uploaded_at.isoformat() if f.uploaded_at else None,
        }
        if f.is_pinned:
            pinned.append(entry)
        else:
            files.append(entry)

    # ----- Exercices (optionnel) -----
    exercise_count = 0
    if include_exercises:
        from models.exercise import Exercise
        exercises = Exercise.query.filter_by(classroom_id=classroom_id).all()
        exercise_count = len(exercises)
        for ex in exercises:
            files.append({
                'id': f'exercise-{ex.id}',
                'source': 'exercise',
                'broken_reference': False,
                'exercise_id': ex.id,
                'original_filename': ex.title or 'Exercice sans titre',
                'file_type': 'exercise',
                'file_size': 0,
                'folder_path': '',
                'is_pinned': False,
                'pin_order': 0,
                'uploaded_at': ex.created_at.isoformat() if ex.created_at else None,
                'total_points': ex.total_points,
                'block_count': ex.blocks.count() if ex.blocks else 0,
                'is_exercise': True,
            })

    # Trier les épinglés
    pinned.sort(key=lambda x: x['pin_order'])

    # Diagnostic systématique : si un appel retourne 0 fichier, on logge
    # explicitement pour faciliter le débuggage en prod.
    if (v2_count_total + legacy_count_total + exercise_count) == 0:
        current_app.logger.warning(
            f"[class_files_listing] Classe {classroom_id} : 0 fichier "
            f"(v2={v2_count_total}, legacy={legacy_count_total}, "
            f"exercises={exercise_count})"
        )
    else:
        current_app.logger.info(
            f"[class_files_listing] Classe {classroom_id} : "
            f"v2={v2_count_total} (broken={v2_count_broken}), "
            f"legacy={legacy_count_total}, exercises={exercise_count}, "
            f"total returned={len(pinned) + len(files)}"
        )

    return pinned, files
