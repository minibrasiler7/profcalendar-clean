"""Add lesson_memos and student_remarks tables

Revision ID: add_lesson_memos_001
Revises: add_custom_pages_001
Create Date: 2025-01-11

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_lesson_memos_001'
down_revision = 'add_custom_pages_001'
branch_labels = None
depends_on = None


def upgrade():
    # Créer la table lesson_memos
    op.create_table('lesson_memos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('classroom_id', sa.Integer(), nullable=True),
        sa.Column('mixed_group_id', sa.Integer(), nullable=True),
        sa.Column('source_date', sa.Date(), nullable=False),
        sa.Column('source_period', sa.Integer(), nullable=False),
        sa.Column('target_date', sa.Date(), nullable=True),
        sa.Column('target_period', sa.Integer(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_completed', sa.Boolean(), nullable=True, default=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['classroom_id'], ['classrooms.id'], ),
        sa.ForeignKeyConstraint(['mixed_group_id'], ['mixed_groups.id'], ),
        sa.PrimaryKeyConstraint('id')
    )

    # Créer la table student_remarks
    op.create_table('student_remarks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('student_id', sa.Integer(), nullable=False),
        sa.Column('source_date', sa.Date(), nullable=False),
        sa.Column('source_period', sa.Integer(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['student_id'], ['students.id'], ),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    # Supprimer les tables
    op.drop_table('student_remarks')
    op.drop_table('lesson_memos')
