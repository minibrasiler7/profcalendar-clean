"""Add apple_subscriptions table (In-App Purchase)

Revision ID: apple_iap_20260513
Revises: merge_heads_20260504
Create Date: 2026-05-13

Cette migration crée la table qui suit les abonnements achetés via
In-App Purchase Apple. Permet à l'app iPad d'offrir Premium en respectant
la guideline App Store 3.1.1, tout en gardant en parallèle les
abonnements Stripe achetés sur le web.
"""

from alembic import op
import sqlalchemy as sa


revision = 'apple_iap_20260513'
down_revision = 'merge_heads_20260504'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS apple_subscriptions (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            original_transaction_id VARCHAR(64) UNIQUE NOT NULL,
            latest_transaction_id VARCHAR(64),
            product_id VARCHAR(120) NOT NULL,
            bundle_id VARCHAR(120),
            environment VARCHAR(20) DEFAULT 'production',
            status VARCHAR(20) DEFAULT 'active',
            purchase_date TIMESTAMP,
            expires_date TIMESTAMP,
            cancelled_at TIMESTAMP,
            revoked_at TIMESTAMP,
            auto_renew_status BOOLEAN DEFAULT TRUE,
            in_trial_period BOOLEAN DEFAULT FALSE,
            in_intro_offer_period BOOLEAN DEFAULT FALSE,
            last_signed_payload TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_apple_subscriptions_user_id "
        "ON apple_subscriptions (user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_apple_subscriptions_original_transaction_id "
        "ON apple_subscriptions (original_transaction_id)"
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS apple_subscriptions CASCADE")
