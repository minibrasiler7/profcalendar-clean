"""Add used_block_ids_json to combat_sessions

Revision ID: 20260302_used_block_ids
Revises: 20260124_add_blank_sheets
Create Date: 2026-03-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260302_used_block_ids'
down_revision = '20260124_add_blank_sheets'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('combat_sessions',
        sa.Column('used_block_ids_json', postgresql.JSON(astext_type=sa.Text()), nullable=True, server_default='[]')
    )


def downgrade():
    op.drop_column('combat_sessions', 'used_block_ids_json')
