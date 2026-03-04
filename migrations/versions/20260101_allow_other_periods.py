"""Allow periods without classroom or mixed_group (Other periods)

Revision ID: allow_other_periods_001
Revises: add_lesson_memos_001
Create Date: 2026-01-01

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'allow_other_periods_001'
down_revision = '20241001_add_push_tokens'
branch_labels = None
depends_on = None


def upgrade():
    # Supprimer l'ancienne contrainte qui exigeait qu'une période ait toujours une classe OU un groupe mixte
    op.drop_constraint('_classroom_or_mixed_group_planning', 'plannings', type_='check')

    # Créer la nouvelle contrainte qui permet les périodes "Autre" (les deux NULL)
    # Syntaxe explicite pour garantir la compatibilité PostgreSQL
    op.create_check_constraint(
        '_classroom_or_mixed_group_planning',
        'plannings',
        '(classroom_id IS NULL AND mixed_group_id IS NULL) OR '
        '(classroom_id IS NOT NULL AND mixed_group_id IS NULL) OR '
        '(classroom_id IS NULL AND mixed_group_id IS NOT NULL)'
    )


def downgrade():
    # Supprimer la nouvelle contrainte
    op.drop_constraint('_classroom_or_mixed_group_planning', 'plannings', type_='check')

    # Restaurer l'ancienne contrainte
    op.create_check_constraint(
        '_classroom_or_mixed_group_planning',
        'plannings',
        '(classroom_id IS NOT NULL AND mixed_group_id IS NULL) OR (classroom_id IS NULL AND mixed_group_id IS NOT NULL)'
    )
