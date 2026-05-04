"""Merge alembic heads (2026-05-04)

Revision ID: merge_heads_20260504
Revises: 20260302_used_block_ids, add_has_seen_tour_001, add_planning_resources_001, 20260504_badge_image_001
Create Date: 2026-05-04

Pourquoi ce merge :
  L'arbre Alembic avait dérivé en 4 branches parallèles (heads) sans jamais
  être consolidé. Conséquence : `flask db upgrade` (qui vise « head » au
  singulier) ne savait pas vers quel head aller — au mieux il ne faisait
  rien, au pire il ignorait silencieusement les nouvelles migrations.
  Résultat concret : la migration `20260504_badge_image_001` (qui ajoute
  les colonnes `badge_pattern` et `badge_color` sur `exercises`) ne
  s'est jamais appliquée sur Render, alors que le code Python lisait
  ces colonnes — ce qui faisait planter `/planning/lesson` avec
  `psycopg.errors.InFailedSqlTransaction` (la transaction était
  empoisonnée par un SELECT sur une colonne inexistante).

  Cette révision n'a aucun upgrade/downgrade : elle ne fait que joindre
  les 4 branches en un seul head. Une fois appliquée, `flask db upgrade`
  pointe sur ce merge unique et applique automatiquement les migrations
  manquantes de chaque branche (y compris `20260504_badge_image_001`).
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'merge_heads_20260504'
down_revision = (
    '20260302_used_block_ids',
    'add_has_seen_tour_001',
    'add_planning_resources_001',
    '20260504_badge_image_001',
)
branch_labels = None
depends_on = None


def upgrade():
    # Merge no-op : aucune mutation de schéma.
    pass


def downgrade():
    pass
