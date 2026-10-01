"""add_governorate_to_feeders

Revision ID: 3cf6e88a5158
Revises: f3a91b7e2d04
Create Date: 2026-09-30 09:59:37.917742

Both columns (feeders.governorate and citizens.feeder_id) were added
directly via fix_alembic.py before this migration was generated.
This revision is a no-op that records the schema state for future
alembic upgrade/downgrade operations.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '3cf6e88a5158'
down_revision: Union[str, None] = 'f3a91b7e2d04'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add governorate to feeders if it doesn't exist yet
    # (safe to run even if column already exists due to the IF NOT EXISTS guard)
    conn = op.get_bind()
    col_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='feeders' AND column_name='governorate'"
    )).fetchone()
    if not col_exists:
        op.add_column('feeders', sa.Column('governorate', sa.String(length=100), nullable=True))

    # Add feeder_id to citizens if it doesn't exist yet
    fid_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='citizens' AND column_name='feeder_id'"
    )).fetchone()
    if not fid_exists:
        op.add_column('citizens', sa.Column('feeder_id', sa.Integer(), nullable=True))
        op.create_foreign_key(
            'fk_citizens_feeder_id', 'citizens', 'feeders',
            ['feeder_id'], ['id'], ondelete='SET NULL',
        )


def downgrade() -> None:
    conn = op.get_bind()
    fid_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='citizens' AND column_name='feeder_id'"
    )).fetchone()
    if fid_exists:
        op.drop_constraint('fk_citizens_feeder_id', 'citizens', type_='foreignkey')
        op.drop_column('citizens', 'feeder_id')

    col_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='feeders' AND column_name='governorate'"
    )).fetchone()
    if col_exists:
        op.drop_column('feeders', 'governorate')
