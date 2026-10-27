from datetime import datetime, timezone
from uuid import UUID, uuid4
from pydantic import BaseModel, Field


class HotelPolicy(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    policy_name: str = Field(default="DEFAULT")
    standard_check_in_time: str = Field(default="14:00")
    standard_check_out_time: str = Field(default="11:00")
    earliest_early_check_in: str = Field(default="12:00")
    early_check_in_requires_ready_room: bool = Field(default=True)
    vip_priority: bool = Field(default=True)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
