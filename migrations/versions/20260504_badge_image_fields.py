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
    with op.batch_alter_table('exercises', schema=None) as batch_op:
        batch_op.add_column(sa.Column('badge_pattern', sa.String(length=25), nullable=True))
        batch_op.add_column(sa.Column('badge_color', sa.String(length=7), nullable=True))


def downgrade():
    with op.batch_alter_table('exercises', schema=None) as batch_op:
        batch_op.drop_column('badge_color')
        batch_op.drop_column('badge_pattern')
