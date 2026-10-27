import logging
from typing import Optional
from sqlalchemy import func, select, update

from app.database.connection import SessionLocal
from app.database.orm.inventory_entity import InventoryEntity
from app.database.orm.item_policy_entity import ItemPolicyEntity
from app.models.inventory import InventoryItem
from app.models.item_policy import ItemPolicy

logger = logging.getLogger(__name__)


class GuestOpsRepository:
    """Repository for managing item policies and inventory stock."""

    def __init__(self, session_factory=SessionLocal):
        self.session_factory = session_factory

    @staticmethod
    def _to_pydantic_policy(entity: ItemPolicyEntity) -> ItemPolicy:
        return ItemPolicy(
            id=entity.id,
            item_name=entity.item_name,
            free_limit=entity.free_limit,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
        )

    @staticmethod
    def _to_pydantic_inventory(entity: InventoryEntity) -> InventoryItem:
        return InventoryItem(
            id=entity.id,
            item_name=entity.item_name,
            stock=entity.stock,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
        )

    @staticmethod
    def _get_name_candidates(item_name: str) -> list[str]:
        clean = item_name.strip().lower()
        candidates = [clean]
        if clean.endswith("s"):
            candidates.append(clean[:-1])
        else:
            candidates.append(clean + "s")
        return candidates

    def get_item_policy(self, item_name: str) -> Optional[ItemPolicy]:
        """Fetch item policy by item name (case-insensitive with singular/plural fallback)."""
        if not item_name or not item_name.strip():
            return None
        candidates = self._get_name_candidates(item_name)
        try:
            with self.session_factory() as session:
                for name in candidates:
                    stmt = select(ItemPolicyEntity).where(
                        func.lower(ItemPolicyEntity.item_name) == name
                    )
                    entity = session.execute(stmt).scalar_one_or_none()
                    if entity:
                        return self._to_pydantic_policy(entity)
                return None
        except Exception as ex:
            logger.error("Database error fetching item policy for '%s': %s", item_name, ex, exc_info=True)
            return None

    def get_inventory_stock(self, item_name: str) -> Optional[int]:
        """Fetch current available inventory stock for an item (case-insensitive with fallback)."""
        if not item_name or not item_name.strip():
            return None
        candidates = self._get_name_candidates(item_name)
        try:
            with self.session_factory() as session:
                for name in candidates:
                    stmt = select(InventoryEntity.stock).where(
                        func.lower(InventoryEntity.item_name) == name
                    )
                    stock = session.execute(stmt).scalar_one_or_none()
                    if stock is not None:
                        return stock
                return None
        except Exception as ex:
            logger.error("Database error fetching inventory stock for '%s': %s", item_name, ex, exc_info=True)
            return None

    def get_inventory_item(self, item_name: str) -> Optional[InventoryItem]:
        """Fetch inventory item entity as Pydantic model (case-insensitive with fallback)."""
        if not item_name or not item_name.strip():
            return None
        candidates = self._get_name_candidates(item_name)
        try:
            with self.session_factory() as session:
                for name in candidates:
                    stmt = select(InventoryEntity).where(
                        func.lower(InventoryEntity.item_name) == name
                    )
                    entity = session.execute(stmt).scalar_one_or_none()
                    if entity:
                        return self._to_pydantic_inventory(entity)
                return None
        except Exception as ex:
            logger.error("Database error fetching inventory item for '%s': %s", item_name, ex, exc_info=True)
            return None

    def decrement_inventory_stock(self, item_name: str, quantity: int = 1) -> bool:
        """Atomically decrement stock if sufficient stock exists.

        Returns True if stock was successfully decremented, False if insufficient stock or item not found.
        """
        if quantity <= 0:
            return True
        if not item_name or not item_name.strip():
            return False
        candidates = self._get_name_candidates(item_name)
        try:
            with self.session_factory() as session:
                for name in candidates:
                    # Find matching row ID with sufficient stock
                    subq = (
                        select(InventoryEntity.id)
                        .where(
                            func.lower(InventoryEntity.item_name) == name,
                            InventoryEntity.stock >= quantity,
                        )
                        .scalar_subquery()
                    )
                    stmt = (
                        update(InventoryEntity)
                        .where(InventoryEntity.id == subq)
                        .values(stock=InventoryEntity.stock - quantity)
                    )
                    result = session.execute(stmt)
                    if result.rowcount > 0:
                        session.commit()
                        return True
                return False
        except Exception as ex:
            logger.error(
                "Database error decrementing stock for '%s' (quantity=%d): %s",
                item_name,
                quantity,
                ex,
                exc_info=True,
            )
            return False
