"""add_admin_role_must_change_password

Revision ID: 4d5efc9e439d
Revises: e88ade33dcb7
Create Date: 2026-09-23 00:28:45.876324

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4d5efc9e439d'
down_revision: Union[str, None] = 'e88ade33dcb7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add must_change_password with server_default=false so existing rows are backfilled
    op.add_column('users', sa.Column(
        'must_change_password',
        sa.Boolean(),
        nullable=False,
        server_default=sa.text('false'),
    ))

    # Add ADMIN to the user_role enum
    # PostgreSQL requires ALTER TYPE to add new enum values
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ADMIN'")


def downgrade() -> None:
    op.drop_column('users', 'must_change_password')
    # Note: PostgreSQL does not support removing enum values without recreating the type
