"""Add email_hash columns and convert encrypted fields to Text

This migration:
1. Adds email_hash columns to students and parents tables
2. Converts String columns to Text for fields that will be encrypted
   (encrypted data is longer than original plaintext)
3. Removes the unique constraint on parents.email (now on email_hash)

After running this migration, run: python scripts/encrypt_existing_data.py --execute

Revision ID: add_encryption_001
Revises: 77214c11cbcf
Create Date: 2026-02-13

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'add_encryption_001'
down_revision = '77214c11cbcf'
branch_labels = None
depends_on = None


def upgrade():
    # === STUDENTS TABLE ===
    # Add email_hash column
    op.add_column('students', sa.Column('email_hash', sa.String(64), nullable=True))
    op.create_index('ix_students_email_hash', 'students', ['email_hash'])

    # Convert String columns to Text (encrypted data is longer)
    op.alter_column('students', 'first_name', type_=sa.Text(), existing_type=sa.String(100))
    op.alter_column('students', 'last_name', type_=sa.Text(), existing_type=sa.String(100))
    op.alter_column('students', 'email', type_=sa.Text(), existing_type=sa.String(120))
    op.alter_column('students', 'date_of_birth', type_=sa.Text(), existing_type=sa.Date())
    op.alter_column('students', 'parent_email_mother', type_=sa.Text(), existing_type=sa.String(120))
    op.alter_column('students', 'parent_email_father', type_=sa.Text(), existing_type=sa.String(120))

    # === PARENTS TABLE ===
    # Add email_hash column
    op.add_column('parents', sa.Column('email_hash', sa.String(64), nullable=True))

    # Remove old unique constraint on email (if it exists)
    try:
        op.drop_constraint('parents_email_key', 'parents', type_='unique')
    except Exception:
        pass  # Constraint may not exist or have a different name

    # Convert String columns to Text
    op.alter_column('parents', 'email', type_=sa.Text(), existing_type=sa.String(120))
    op.alter_column('parents', 'first_name', type_=sa.Text(), existing_type=sa.String(100))
    op.alter_column('parents', 'last_name', type_=sa.Text(), existing_type=sa.String(100))

    # Add unique index on email_hash (replaces unique on email)
    op.create_index('ix_parents_email_hash', 'parents', ['email_hash'], unique=True)

    # === GRADES TABLE ===
    op.alter_column('grades', 'title', type_=sa.Text(), existing_type=sa.String(200))

    # === STUDENT ACCOMMODATIONS TABLE ===
    op.alter_column('student_accommodations', 'custom_name', type_=sa.Text(), existing_type=sa.String(200))

    # === SANCTION TEMPLATES TABLE ===
    op.alter_column('sanction_templates', 'name', type_=sa.Text(), existing_type=sa.String(100))


def downgrade():
    # === SANCTION TEMPLATES TABLE ===
    op.alter_column('sanction_templates', 'name', type_=sa.String(100), existing_type=sa.Text())

    # === STUDENT ACCOMMODATIONS TABLE ===
    op.alter_column('student_accommodations', 'custom_name', type_=sa.String(200), existing_type=sa.Text())

    # === GRADES TABLE ===
    op.alter_column('grades', 'title', type_=sa.String(200), existing_type=sa.Text())

    # === PARENTS TABLE ===
    op.drop_index('ix_parents_email_hash', table_name='parents')
    op.alter_column('parents', 'last_name', type_=sa.String(100), existing_type=sa.Text())
    op.alter_column('parents', 'first_name', type_=sa.String(100), existing_type=sa.Text())
    op.alter_column('parents', 'email', type_=sa.String(120), existing_type=sa.Text())
    op.create_unique_constraint('parents_email_key', 'parents', ['email'])
    op.drop_column('parents', 'email_hash')

    # === STUDENTS TABLE ===
    op.alter_column('students', 'parent_email_father', type_=sa.String(120), existing_type=sa.Text())
    op.alter_column('students', 'parent_email_mother', type_=sa.String(120), existing_type=sa.Text())
    op.alter_column('students', 'date_of_birth', type_=sa.Date(), existing_type=sa.Text())
    op.alter_column('students', 'email', type_=sa.String(120), existing_type=sa.Text())
    op.alter_column('students', 'last_name', type_=sa.String(100), existing_type=sa.Text())
    op.alter_column('students', 'first_name', type_=sa.String(100), existing_type=sa.Text())
    op.drop_index('ix_students_email_hash', table_name='students')
    op.drop_column('students', 'email_hash')
