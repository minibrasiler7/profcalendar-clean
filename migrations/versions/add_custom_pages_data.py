"""Add custom_pages_data to FileAnnotation

Revision ID: add_custom_pages_001
Revises:
Create Date: 2025-01-06

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'add_custom_pages_001'
down_revision = None  # Mettez l'ID de votre dernière migration ici si vous en avez
branch_labels = None
depends_on = None


def upgrade():
    # Ajouter la colonne custom_pages_data
    op.add_column('file_annotations',
        sa.Column('custom_pages_data', postgresql.JSON(astext_type=sa.Text()), nullable=True)
    )


def downgrade():
    # Retirer la colonne si on fait un rollback
    op.drop_column('file_annotations', 'custom_pages_data')
