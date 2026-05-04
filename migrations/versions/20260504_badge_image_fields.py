"""Add badge_pattern and badge_color columns to exercises

Revision ID: 20260504_badge_image_001
Revises: 20260402_exercise_folders
Create Date: 2026-05-04

Stocke l'image du badge généré aléatoirement à la création/sauvegarde
d'un exercice : 25 carrés (5x5), chacun blanc ou de la couleur flashy
sélectionnée.

- badge_pattern : chaîne de 25 caractères ('0' = blanc, '1' = couleur)
- badge_color   : couleur hexadécimale (#RRGGBB) du carré "rempli"

L'or (gold) est conservé en DB pour ne pas perdre l'historique mais
n'est plus crédité ni affiché.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260504_badge_image_001'
down_revision = '20260402_exercise_folders'
branch_labels = None
depends_on = None


def upgrade():
    # Idempotent : si la migration a été partiellement appliquée (cas rencontré
    # quand l'arbre Alembic était dans un état multi-head), `ADD COLUMN IF NOT
    # EXISTS` évite l'erreur "column already exists" sans rien casser.
    # Postgres ≥ 9.6, ce qui est largement satisfait sur Render.
    op.execute("ALTER TABLE exercises ADD COLUMN IF NOT EXISTS badge_pattern VARCHAR(25)")
    op.execute("ALTER TABLE exercises ADD COLUMN IF NOT EXISTS badge_color VARCHAR(7)")


def downgrade():
    op.execute("ALTER TABLE exercises DROP COLUMN IF EXISTS badge_color")
    op.execute("ALTER TABLE exercises DROP COLUMN IF EXISTS badge_pattern")
