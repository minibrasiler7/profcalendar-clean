"""Add R2 storage columns to user_files

Adds r2_key and r2_thumbnail_key columns to user_files table
for Cloudflare R2 storage integration.

Revision ID: add_r2_storage_001
Revises: add_encryption_001
Create Date: 2026-03-30

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = 'add_r2_storage_001'
down_revision = 'add_encryption_001'
branch_labels = None
depends_on = None


def _column_exists(table_name, column_name):
    """Vérifie si une colonne existe déjà dans la table."""
    bind = op.get_bind()
    insp = inspect(bind)
    columns = [col['name'] for col in insp.get_columns(table_name)]
    return column_name in columns


def upgrade():
    # Ajouter r2_key à user_files
    if not _column_exists('user_files', 'r2_key'):
        op.add_column('user_files', sa.Column('r2_key', sa.String(500), nullable=True))

    # Ajouter r2_thumbnail_key à user_files
    if not _column_exists('user_files', 'r2_thumbnail_key'):
        op.add_column('user_files', sa.Column('r2_thumbnail_key', sa.String(500), nullable=True))


def downgrade():
    # Supprimer les colonnes R2
    if _column_exists('user_files', 'r2_thumbnail_key'):
        op.drop_column('user_files', 'r2_thumbnail_key')

    if _column_exists('user_files', 'r2_key'):
        op.drop_column('user_files', 'r2_key')
