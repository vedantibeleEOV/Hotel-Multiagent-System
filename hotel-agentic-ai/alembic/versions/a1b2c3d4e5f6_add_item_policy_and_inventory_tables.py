"""add item_policy and inventory tables

Revision ID: a1b2c3d4e5f6
Revises: f2a3b4c5d6e7
Create Date: 2026-10-19 14:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    table_names = insp.get_table_names()

    # 1. Create item_policy table if not present
    if 'item_policy' not in table_names:
        op.create_table(
            'item_policy',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('item_name', sa.String(length=100), nullable=False),
            sa.Column('free_limit', sa.Integer(), nullable=False, server_default='5'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_item_policy_item_name'), 'item_policy', ['item_name'], unique=True)

    # 2. Create inventory table if not present
    if 'inventory' not in table_names:
        op.create_table(
            'inventory',
            sa.Column('id', sa.Uuid(), nullable=False),
            sa.Column('item_name', sa.String(length=100), nullable=False),
            sa.Column('stock', sa.Integer(), nullable=False, server_default='100'),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_inventory_item_name'), 'inventory', ['item_name'], unique=True)


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    table_names = insp.get_table_names()

    if 'inventory' in table_names:
        indexes = [i['name'] for i in insp.get_indexes('inventory')]
        if 'ix_inventory_item_name' in indexes:
            op.drop_index(op.f('ix_inventory_item_name'), table_name='inventory')
        op.drop_table('inventory')

    if 'item_policy' in table_names:
        indexes = [i['name'] for i in insp.get_indexes('item_policy')]
        if 'ix_item_policy_item_name' in indexes:
            op.drop_index(op.f('ix_item_policy_item_name'), table_name='item_policy')
        op.drop_table('item_policy')
