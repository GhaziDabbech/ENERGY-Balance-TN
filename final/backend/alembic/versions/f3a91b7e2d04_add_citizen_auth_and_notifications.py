"""add_citizen_auth_and_notifications

Adds:
  - citizens.notifications_enabled  (boolean, default True)
  - citizen_notifications table
  - INDEX on citizen_notifications(citizen_id)

Revision ID: f3a91b7e2d04
Revises: cec95ac7c838
Create Date: 2026-09-29 18:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f3a91b7e2d04'
down_revision: Union[str, None] = 'a3388528cdb8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add notifications_enabled flag to existing citizens table
    op.add_column(
        'citizens',
        sa.Column('notifications_enabled', sa.Boolean(), nullable=False, server_default='true'),
    )

    # New citizen_notifications table
    op.create_table(
        'citizen_notifications',
        sa.Column('id',         sa.Integer(),     nullable=False),
        sa.Column('citizen_id', sa.Integer(),     nullable=False),
        sa.Column('title',      sa.String(200),   nullable=False),
        sa.Column('message',    sa.Text(),         nullable=False),
        sa.Column('is_read',    sa.Boolean(),     nullable=False, server_default='false'),
        sa.Column('created_at', sa.DateTime(),    nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['citizen_id'], ['citizens.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_citizen_notifications_citizen_id',
        'citizen_notifications',
        ['citizen_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_citizen_notifications_citizen_id', table_name='citizen_notifications')
    op.drop_table('citizen_notifications')
    op.drop_column('citizens', 'notifications_enabled')
