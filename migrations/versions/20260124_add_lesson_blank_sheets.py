"""Add lesson_blank_sheets table

Revision ID: 20260124_add_blank_sheets
Revises: allow_other_periods_001
Create Date: 2026-01-24

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260124_add_blank_sheets'
down_revision = 'allow_other_periods_001'
branch_labels = None
depends_on = None


def upgrade():
    # Créer la table lesson_blank_sheets
    op.create_table(
        'lesson_blank_sheets',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('classroom_id', sa.Integer(), sa.ForeignKey('classrooms.id'), nullable=True),
        sa.Column('lesson_date', sa.Date(), nullable=False),
        sa.Column('period_number', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(200), default='Feuille blanche'),
        sa.Column('sheet_data', postgresql.JSON(astext_type=sa.Text()), nullable=False),
        sa.Column('created_at', sa.DateTime(), default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(), default=sa.func.now(), onupdate=sa.func.now())
    )

    # Créer un index composite pour les requêtes fréquentes (user + date + période)
    op.create_index(
        'idx_blank_sheets_user_date_period',
        'lesson_blank_sheets',
        ['user_id', 'lesson_date', 'period_number']
    )

    # Index sur lesson_date pour les requêtes par date
    op.create_index(
        'idx_blank_sheets_lesson_date',
        'lesson_blank_sheets',
        ['lesson_date']
    )

    # Index sur period_number pour les requêtes par période
    op.create_index(
        'idx_blank_sheets_period_number',
        'lesson_blank_sheets',
        ['period_number']
    )


def downgrade():
    # Supprimer les index
    op.drop_index('idx_blank_sheets_period_number', table_name='lesson_blank_sheets')
    op.drop_index('idx_blank_sheets_lesson_date', table_name='lesson_blank_sheets')
    op.drop_index('idx_blank_sheets_user_date_period', table_name='lesson_blank_sheets')

    # Supprimer la table
    op.drop_table('lesson_blank_sheets')
