"""Add referral columns to users (parrainage « invite un collègue »)

Revision ID: add_referral_20260619
Revises: apple_iap_20260513
Create Date: 2026-06-19

Boucle de croissance : chaque prof a un code de parrainage (referral_code) ;
un nouveau prof inscrit via le lien d'un parrain a referred_by_id renseigné.
Récompense (gérée côté code) : le filleul démarre avec 60 j d'essai (au lieu de
30) et le parrain gagne +30 j de Premium à la vérification email du filleul.

SQL brut + IF NOT EXISTS : idempotent et sûr (même style que les autres
migrations du projet). FK auto-référente avec ON DELETE SET NULL pour ne pas
bloquer la suppression d'un parrain.
"""
from alembic import op
import sqlalchemy as sa


revision = 'add_referral_20260619'
down_revision = 'apple_iap_20260513'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12)")
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_id INTEGER "
        "REFERENCES users(id) ON DELETE SET NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_users_referral_code "
        "ON users (referral_code)"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_users_referral_code")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS referred_by_id")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS referral_code")
