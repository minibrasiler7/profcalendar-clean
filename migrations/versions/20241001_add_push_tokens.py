"""add push_tokens table"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20241001_add_push_tokens'
down_revision = 'add_lesson_memos_001'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'push_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('platform', sa.String(length=20), nullable=False),
        sa.Column('token', sa.String(length=512), nullable=False, unique=True),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP')),
    )
    op.create_index('idx_push_token_user', 'push_tokens', ['user_id'])


def downgrade():
    op.drop_index('idx_push_token_user', table_name='push_tokens')
    op.drop_table('push_tokens')
