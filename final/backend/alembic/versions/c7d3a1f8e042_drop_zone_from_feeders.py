"""drop_zone_from_feeders

Revision ID: c7d3a1f8e042
Revises: b1e4d9f7a023
Create Date: 2026-10-01 10:00:00.000000

Remove the `zone` column from the `feeders` table.
The column is redundant — `governorate` carries the same geographic context
and the frontend no longer exposes or sends a zone value.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c7d3a1f8e042'
down_revision: Union[str, None] = 'b1e4d9f7a023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    col_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='feeders' AND column_name='zone'"
    )).fetchone()
    if col_exists:
        op.drop_column('feeders', 'zone')


def downgrade() -> None:
    conn = op.get_bind()
    col_exists = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='feeders' AND column_name='zone'"
    )).fetchone()
    if not col_exists:
        # Re-add as nullable so existing rows aren't broken on rollback
        op.add_column('feeders', sa.Column('zone', sa.String(length=64), nullable=True))
