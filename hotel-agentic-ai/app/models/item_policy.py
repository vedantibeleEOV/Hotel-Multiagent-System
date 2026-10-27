from datetime import datetime, timezone
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class ItemPolicy(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    item_name: str
    free_limit: int = Field(default=5, ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
