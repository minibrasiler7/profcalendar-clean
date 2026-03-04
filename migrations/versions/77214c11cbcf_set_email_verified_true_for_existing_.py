"""Set email_verified true for existing accounts

Revision ID: 77214c11cbcf
Revises: 45f081cbc4e2
Create Date: 2026-02-09 18:28:43.945459

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '77214c11cbcf'
down_revision = '45f081cbc4e2'
branch_labels = None
depends_on = None


def upgrade():
    # Marquer tous les comptes existants comme email vérifié
    op.execute("UPDATE users SET email_verified = true WHERE email_verified IS NULL")
    op.execute("UPDATE parents SET email_verified = true WHERE email_verified IS NULL")
    op.execute("UPDATE students SET email_verified = true WHERE email_verified IS NULL")


def downgrade():
    pass
