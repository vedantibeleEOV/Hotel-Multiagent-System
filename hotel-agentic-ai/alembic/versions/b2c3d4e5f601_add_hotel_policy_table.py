"""add hotel_policy table

Revision ID: b2c3d4e5f601
Revises: a1b2c3d4e5f6
Create Date: 2026-10-26 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f601'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    table_names = insp.get_table_names()

    # Create hotel_policy table if not present
    if 'hotel_policy' not in table_names:
        op.create_table(
            'hotel_policy',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('policy_name', sa.String(length=100), nullable=False, server_default='DEFAULT'),
            sa.Column('standard_check_in_time', sa.String(length=10), nullable=False, server_default='14:00'),
            sa.Column('standard_check_out_time', sa.String(length=10), nullable=False, server_default='11:00'),
            sa.Column('earliest_early_check_in', sa.String(length=10), nullable=False, server_default='12:00'),
            sa.Column('early_check_in_requires_ready_room', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('vip_priority', sa.Boolean(), nullable=False, server_default='true'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_hotel_policy_policy_name'), 'hotel_policy', ['policy_name'], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    table_names = insp.get_table_names()

    if 'hotel_policy' in table_names:
        indexes = [i['name'] for i in insp.get_indexes('hotel_policy')]
        if 'ix_hotel_policy_policy_name' in indexes:
            op.drop_index(op.f('ix_hotel_policy_policy_name'), table_name='hotel_policy')
        op.drop_table('hotel_policy')
