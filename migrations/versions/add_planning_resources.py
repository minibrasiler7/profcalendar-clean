"""Add planning_resources table

Revision ID: add_planning_resources_001
Revises: add_lesson_memos_001
Create Date: 2026-02-24

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_planning_resources_001'
down_revision = 'add_lesson_memos_001'
branch_labels = None
depends_on = None


def upgrade():
    # Créer la table planning_resources
    op.create_table('planning_resources',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('planning_id', sa.Integer(), nullable=False),
        sa.Column('resource_type', sa.String(20), nullable=False),
        sa.Column('resource_id', sa.Integer(), nullable=False),
        sa.Column('display_name', sa.String(255), nullable=False),
        sa.Column('display_icon', sa.String(50), nullable=True),
        sa.Column('status', sa.String(20), nullable=True, default='linked'),
        sa.Column('mode', sa.String(20), nullable=True),
        sa.Column('publication_id', sa.Integer(), nullable=True),
        sa.Column('position', sa.Integer(), nullable=True, default=0),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['planning_id'], ['plannings.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Créer un index sur planning_id pour les performances
    op.create_index(op.f('ix_planning_resources_planning_id'), 'planning_resources', ['planning_id'])


def downgrade():
    # Supprimer la table
    op.drop_index(op.f('ix_planning_resources_planning_id'))
    op.drop_table('planning_resources')
