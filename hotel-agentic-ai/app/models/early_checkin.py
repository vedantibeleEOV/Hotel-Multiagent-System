from typing import Optional
from pydantic import BaseModel, Field


class EarlyCheckInRequest(BaseModel):
    room_number: Optional[str] = Field(None, description="Room number of the reservation")
    guest_id: Optional[int] = Field(None, description="Guest ID associated with the reservation")
    room_id: Optional[int] = Field(None, description="Optional room database ID")
    message: Optional[str] = Field(None, description="Guest message requesting early check-in")
    requested_time: Optional[str] = Field(None, description="Explicit requested check-in time, e.g. '12:00'")


class EarlyCheckInResponse(BaseModel):
    decision: str = Field(description="Decision outcome: APPROVE, ESCALATE, or REJECT")
    reason: str = Field(description="Internal explanation for operations audit")
    guest_message: str = Field(description="Fixed text reply for the guest")
    requested_time: Optional[str] = Field(None, description="Parsed requested check-in time (HH:MM)")
    ready_by: Optional[str] = Field(None, description="Estimated time room will be ready (HH:MM)")
    room_number: Optional[str] = Field(None, description="Room number evaluated")
