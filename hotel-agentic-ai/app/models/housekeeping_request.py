from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.enums import TaskStatus


class HousekeepingRequest(BaseModel):
    room_id: int = Field(gt=0, description="Target room ID")
    description: str = Field(min_length=3, max_length=500, description="Guest request description")


class HousekeepingRequestResult(BaseModel):
    room_id: int
    task_id: Optional[UUID] = None
    task_status: Optional[TaskStatus] = None
    assigned_staff_id: Optional[int] = None
    assigned_staff_name: Optional[str] = None
    status: str
    reason: str
