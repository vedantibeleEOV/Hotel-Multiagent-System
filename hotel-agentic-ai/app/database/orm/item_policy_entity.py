from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Column, DateTime, Integer, String, Uuid

from app.database.base import Base


class ItemPolicyEntity(Base):
    __tablename__ = "item_policy"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    item_name = Column(String(100), unique=True, nullable=False, index=True)
    free_limit = Column(Integer, nullable=False, default=5)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
