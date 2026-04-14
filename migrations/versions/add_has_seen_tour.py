"""Add has_seen_tour column to users table

Revision ID: add_has_seen_tour_001
Revises: add_r2_storage_001
Create Date: 2026-04-14

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = 'add_has_seen_tour_001'
down_revision = 'add_r2_storage_001'
branch_labels = None
depends_on = None


def _column_exists(table_name, column_name):
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [col['name'] for col in insp.get_columns(table_name)]
    return column_name in columns


def upgrade():
    if not _column_exists('users', 'has_seen_tour'):
        op.add_column('users', sa.Column('has_seen_tour', sa.Boolean(), nullable=True, server_default='false'))


def downgrade():
    if _column_exists('users', 'has_seen_tour'):
        op.drop_column('users', 'has_seen_tour')
