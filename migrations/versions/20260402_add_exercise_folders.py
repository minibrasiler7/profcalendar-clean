"""Add exercise_folders table and exercise_folder_id column

Creates the exercise_folders table for the exercise manager feature
and adds exercise_folder_id foreign key to exercises table.

Revision ID: 20260402_exercise_folders
Revises: add_r2_storage_001
Create Date: 2026-04-02

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = '20260402_exercise_folders'
down_revision = 'add_r2_storage_001'
branch_labels = None
depends_on = None


def upgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    # Create exercise_folders table if it doesn't exist
    if 'exercise_folders' not in existing_tables:
        op.create_table('exercise_folders',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('parent_id', sa.Integer(), nullable=True),
            sa.Column('name', sa.String(length=255), nullable=False),
            sa.Column('color', sa.String(length=7), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(['parent_id'], ['exercise_folders.id'], ),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )

    # Add exercise_folder_id column to exercises table if it doesn't exist
    existing_columns = [col['name'] for col in inspector.get_columns('exercises')]
    if 'exercise_folder_id' not in existing_columns:
        op.add_column('exercises',
            sa.Column('exercise_folder_id', sa.Integer(), nullable=True)
        )
        op.create_foreign_key(
            'fk_exercises_exercise_folder_id',
            'exercises', 'exercise_folders',
            ['exercise_folder_id'], ['id']
        )


def downgrade():
    conn = op.get_bind()
    inspector = inspect(conn)
    existing_tables = inspector.get_table_names()

    # Remove exercise_folder_id from exercises
    existing_columns = [col['name'] for col in inspector.get_columns('exercises')]
    if 'exercise_folder_id' in existing_columns:
        try:
            op.drop_constraint('fk_exercises_exercise_folder_id', 'exercises', type_='foreignkey')
        except Exception:
            pass
        op.drop_column('exercises', 'exercise_folder_id')

    # Drop exercise_folders table
    if 'exercise_folders' in existing_tables:
        op.drop_table('exercise_folders')
