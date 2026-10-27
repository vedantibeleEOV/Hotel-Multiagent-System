from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, Column, DateTime, String, Uuid

from app.database.base import Base


class HotelPolicyEntity(Base):
    __tablename__ = "hotel_policy"

    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    policy_name = Column(String(100), unique=True, nullable=False, index=True, default="DEFAULT")
    standard_check_in_time = Column(String(10), nullable=False, default="14:00")
    standard_check_out_time = Column(String(10), nullable=False, default="11:00")
    earliest_early_check_in = Column(String(10), nullable=False, default="12:00")
    early_check_in_requires_ready_room = Column(Boolean, nullable=False, default=True)
    vip_priority = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
