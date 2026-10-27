from datetime import datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.agents.guest_operations_agent import (
    GuestOperationsAgent,
    extract_requested_time_regex,
    KOLKATA_TZ,
)
from app.database.connection import SessionLocal
from app.database.orm import (
    GuestEntity,
    MaintenanceIncidentEntity,
    OperationalTaskEntity,
    ReservationEntity,
    RoomEntity,
)
from app.main import app
from app.models.enums import GuestType, TaskStatus, TaskType
from app.repositories.postgres_hotel_repository import PostgresHotelRepository

client = TestClient(app)
repo = PostgresHotelRepository()


# ---------------------------------------------------------------------------
# Test Fixture Helpers (isolated from live seed rows)
# ---------------------------------------------------------------------------
@pytest.fixture
def make_guest_and_room():
    """Create a temporary guest and room for tests."""
    created_ids = {"rooms": [], "guests": [], "reservations": [], "tasks": [], "incidents": []}

    def _factory(
        room_number: str = "701",
        room_status: str = "READY",
        room_type: str = "STANDARD",
        is_vip: bool = False,
        with_reservation: bool = True,
        reservation_early_checkin: bool = False,
    ):
        now = datetime.now(timezone.utc)
        with SessionLocal() as s:
            room = RoomEntity(
                property_id=1,
                room_number=room_number,
                floor=7,
                room_type=room_type,
                status=room_status,
            )
            s.add(room)
            s.flush()
            created_ids["rooms"].append(room.id)

            guest = GuestEntity(
                first_name="Test",
                last_name=f"Guest_{room_number}",
                guest_type=GuestType.VIP.value if is_vip else GuestType.REGULAR.value,
            )
            s.add(guest)
            s.flush()
            created_ids["guests"].append(guest.id)

            res = None
            if with_reservation:
                res = ReservationEntity(
                    guest_id=guest.id,
                    room_id=room.id,
                    check_in_time=now.replace(hour=14, minute=0, second=0, microsecond=0),
                    check_out_time=(now + timedelta(days=1)).replace(hour=11, minute=0, second=0, microsecond=0),
                    early_check_in_requested=reservation_early_checkin,
                )
                s.add(res)
                s.flush()
                created_ids["reservations"].append(res.id)

            s.commit()
            return {
                "room_id": room.id,
                "room_number": room_number,
                "guest_id": guest.id,
                "reservation_id": res.id if res else None,
            }

    try:
        yield _factory
    finally:
        with SessionLocal() as s:
            if created_ids["rooms"]:
                s.query(MaintenanceIncidentEntity).filter(
                    MaintenanceIncidentEntity.room_id.in_(created_ids["rooms"])
                ).delete(synchronize_session=False)
                s.query(OperationalTaskEntity).filter(
                    OperationalTaskEntity.room_id.in_(created_ids["rooms"])
                ).delete(synchronize_session=False)
                s.query(ReservationEntity).filter(
                    ReservationEntity.room_id.in_(created_ids["rooms"])
                ).delete(synchronize_session=False)
                s.query(RoomEntity).filter(
                    RoomEntity.id.in_(created_ids["rooms"])
                ).delete(synchronize_session=False)
            if created_ids["guests"]:
                s.query(GuestEntity).filter(
                    GuestEntity.id.in_(created_ids["guests"])
                ).delete(synchronize_session=False)
            s.commit()



# ---------------------------------------------------------------------------
# 1. Time parsing regex cases ("12", "12 pm", "noon", "1", "at 12:30", etc.)
# ---------------------------------------------------------------------------
def test_time_parsing_regex_cases():
    """Verify regex parses standard and shorthand time formats per specification:
    'noon' = 12:00; '12' = 12:00; 1-6 = PM; 7-11 = AM; explicit am/pm honored.
    """
    assert extract_requested_time_regex("12") == "12:00"
    assert extract_requested_time_regex("12 pm") == "12:00"
    assert extract_requested_time_regex("12:00 pm") == "12:00"
    assert extract_requested_time_regex("noon") == "12:00"
    assert extract_requested_time_regex("at noon") == "12:00"
    assert extract_requested_time_regex("1") == "13:00"
    assert extract_requested_time_regex("at 1") == "13:00"
    assert extract_requested_time_regex("12:30") == "12:30"
    assert extract_requested_time_regex("at 12:30") == "12:30"
    assert extract_requested_time_regex("12:30 pm") == "12:30"
    assert extract_requested_time_regex("2 pm") == "14:00"
    assert extract_requested_time_regex("11") == "11:00"
    assert extract_requested_time_regex("11 am") == "11:00"
    assert extract_requested_time_regex("11 pm") == "23:00"
    assert extract_requested_time_regex("Can I check in at 12?") == "12:00"
    assert extract_requested_time_regex("Room 301 check-in at 2 pm") == "14:00"
    assert extract_requested_time_regex("Random text with no numbers") is None


# ---------------------------------------------------------------------------
# 2. ESCALATE when time cannot be parsed
# ---------------------------------------------------------------------------
def test_early_checkin_unparseable_time_escalates(make_guest_and_room):
    """Verify ESCALATE when time cannot be extracted from message or requested_time."""
    fixture = make_guest_and_room(room_number="710", room_status="READY")
    agent = GuestOperationsAgent(repository=repo)

    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        message="Can I please check in whenever it is convenient?",
    )

    assert result["decision"] == "ESCALATE"
    assert result["reason"] == "could not understand the requested time"
    assert result["guest_message"] == "I've passed your early check-in request to our front desk. They will contact you shortly."
    assert result["requested_time"] is None


# ---------------------------------------------------------------------------
# 3. REJECT when there is no reservation found
# ---------------------------------------------------------------------------
def test_early_checkin_no_reservation_rejects():
    """Verify REJECT when no reservation is found for the given guest/room today."""
    agent = GuestOperationsAgent(repository=repo)

    result = agent.process_early_checkin_request(
        room_number="9999",
        message="Can I check in at 12?",
    )

    assert result["decision"] == "REJECT"
    assert "No reservation found" in result["reason"]
    assert result["guest_message"] == "I couldn't find a reservation for your room. Please contact the front desk (Dial 0)."
    assert result["requested_time"] == "12:00"
    assert result["ready_by"] is None


# ---------------------------------------------------------------------------
# 4. ESCALATE for time earlier than earliest_early_check_in (12:00)
# ---------------------------------------------------------------------------
def test_early_checkin_before_earliest_policy_escalates(make_guest_and_room):
    """Verify ESCALATE when requested time is earlier than 12:00 earliest early check-in."""
    fixture = make_guest_and_room(room_number="711", room_status="READY")
    agent = GuestOperationsAgent(repository=repo)

    # Request check-in at 10:30 AM
    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        message="Can I check in at 10:30 am?",
    )

    assert result["decision"] == "ESCALATE"
    assert "earlier than earliest early check-in" in result["reason"].lower()
    assert result["guest_message"] == "I've passed your early check-in request to our front desk. They will contact you shortly."
    assert result["requested_time"] == "10:30"
    assert result["ready_by"] is None


# ---------------------------------------------------------------------------
# 5. APPROVE for a READY room
# ---------------------------------------------------------------------------
def test_early_checkin_ready_room_approves(make_guest_and_room):
    """Verify APPROVE when room is READY and time is >= 12:00."""
    fixture = make_guest_and_room(room_number="712", room_status="READY")
    agent = GuestOperationsAgent(repository=repo)

    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        message="Can I check in at 12?",
    )

    assert result["decision"] == "APPROVE"
    assert "ready" in result["reason"].lower()
    assert result["guest_message"] == "Your room 712 will be ready for check-in at 12:00. We'll have everything prepared for you."
    assert result["requested_time"] == "12:00"
    assert result["ready_by"] == "12:00"
    assert result["room_number"] == "712"

    # Verify reservation early_check_in_requested was set to True
    with SessionLocal() as s:
        db_res = s.get(ReservationEntity, fixture["reservation_id"])
        assert db_res.early_check_in_requested is True


# ---------------------------------------------------------------------------
# 6. APPROVE for a DIRTY room whose cleaning finishes before requested time
# ---------------------------------------------------------------------------
def test_early_checkin_dirty_room_cleaning_finishes_before_requested_time_approves(make_guest_and_room):
    """Verify APPROVE when room is DIRTY but active cleaning task finishes before requested time."""
    fixture = make_guest_and_room(room_number="713", room_status="DIRTY", room_type="STANDARD")
    now_utc = datetime.now(timezone.utc)

    # Standard room duration is 30m. Task started 25 min ago -> finishes in 5 min (~now + 5m)
    with SessionLocal() as s:
        task = OperationalTaskEntity(
            room_id=fixture["room_id"],
            task_type=TaskType.ROOM_CLEANING.value,
            status=TaskStatus.IN_PROGRESS.value,
            priority_score=20,
            priority_level="NORMAL",
            started_at=now_utc - timedelta(minutes=25),
        )
        s.add(task)
        s.commit()
        task_id = task.id

    agent = GuestOperationsAgent(repository=repo)
    # Guest asks for 13:00 (which is well after the 5m finish)
    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="13:00",
    )

    assert result["decision"] == "APPROVE"
    assert result["requested_time"] == "13:00"
    assert result["guest_message"] == "Your room 713 will be ready for check-in at 13:00. We'll have everything prepared for you."

    # Verify open cleaning task priority was raised to HIGH
    with SessionLocal() as s:
        updated_task = s.get(OperationalTaskEntity, task_id)
        assert updated_task.priority_level == "HIGH"
        assert updated_task.priority_score == 80


# ---------------------------------------------------------------------------
# 7. ESCALATE when previous guest checks out after requested time
# ---------------------------------------------------------------------------
def test_early_checkin_occupant_checkout_after_requested_time_escalates(make_guest_and_room):
    """Verify ESCALATE when prior occupant is scheduled to check out after requested check-in time."""
    fixture = make_guest_and_room(room_number="714", room_status="OCCUPIED")
    now_utc = datetime.now(timezone.utc)

    # Add prior occupant reservation with checkout at 13:30 today
    with SessionLocal() as s:
        prior_guest = GuestEntity(first_name="Prior", last_name="Occupant", guest_type=GuestType.REGULAR.value)
        s.add(prior_guest)
        s.flush()
        prior_res = ReservationEntity(
            guest_id=prior_guest.id,
            room_id=fixture["room_id"],
            check_in_time=now_utc - timedelta(days=1),
            check_out_time=now_utc.replace(hour=13, minute=30, second=0, microsecond=0),
            early_check_in_requested=False,
        )
        s.add(prior_res)
        s.commit()

    agent = GuestOperationsAgent(repository=repo)
    # Incoming guest requests check-in at 12:30 (before 13:30 prior checkout)
    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="12:30",
    )

    assert result["decision"] == "ESCALATE"
    assert any("occupied" in result["reason"].lower() or "checkout" in result["reason"].lower() for _ in [1])
    assert result["guest_message"] == "I've passed your early check-in request to our front desk. They will contact you shortly."
    assert result["ready_by"] is None


# ---------------------------------------------------------------------------
# 8. ESCALATE for a maintenance blocker
# ---------------------------------------------------------------------------
def test_early_checkin_maintenance_blocker_escalates(make_guest_and_room):
    """Verify ESCALATE when room has an active maintenance issue that blocks housekeeping."""
    fixture = make_guest_and_room(room_number="715", room_status="DIRTY")

    with SessionLocal() as s:
        inc = MaintenanceIncidentEntity(
            room_id=fixture["room_id"],
            category="PLUMBING",
            severity="HIGH",
            status="OPEN",
            description="Leaking pipe under sink",
            sla_minutes=60,
            blocks_housekeeping=True,
            affects_room_readiness=True,
        )
        s.add(inc)
        s.commit()

    agent = GuestOperationsAgent(repository=repo)
    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="13:00",
    )

    assert result["decision"] == "ESCALATE"
    assert "maintenance blocker" in result["reason"].lower()
    assert result["guest_message"] == "I've passed your early check-in request to our front desk. They will contact you shortly."
    assert result["ready_by"] is None


# ---------------------------------------------------------------------------
# 9. ESCALATE with "VIP guest" in reason for a VIP on a slightly late DIRTY room
# ---------------------------------------------------------------------------
def test_early_checkin_vip_dirty_room_slightly_late_escalates(make_guest_and_room):
    """Verify ESCALATE with 'VIP guest' in the reason for a VIP guest on a DIRTY room ready <= 30m late."""
    fixture = make_guest_and_room(room_number="716", room_status="DIRTY", is_vip=True, room_type="STANDARD")
    now_utc = datetime.now(timezone.utc)

    # Standard room duration is 30m.
    # Set task started_at so that finish_time = 12:15 (15 min after requested 12:00, within 30m late window)
    req_dt = datetime.combine(now_utc.date(), time(12, 0), tzinfo=timezone.utc)
    with SessionLocal() as s:
        task = OperationalTaskEntity(
            room_id=fixture["room_id"],
            task_type=TaskType.ROOM_CLEANING.value,
            status=TaskStatus.IN_PROGRESS.value,
            priority_score=50,
            priority_level="STANDARD",
            started_at=req_dt - timedelta(minutes=15),
        )
        s.add(task)
        s.commit()

    agent = GuestOperationsAgent(repository=repo)
    result = agent.process_early_checkin_request(
        guest_id=fixture["guest_id"],
        room_number=fixture["room_number"],
        requested_time="12:00",
    )

    assert result["decision"] == "ESCALATE"
    assert "VIP guest" in result["reason"]
    assert result["ready_by"] == "12:15"
    assert result["guest_message"] == "I've passed your early check-in request to our front desk. They will contact you shortly."



# ---------------------------------------------------------------------------
# 10. Guest's own reservation does not count as a conflict
# ---------------------------------------------------------------------------
def test_guest_own_reservation_does_not_count_as_conflict(make_guest_and_room):
    """Verify incoming guest's own booking is excluded from prior occupant conflict check."""
    fixture = make_guest_and_room(room_number="717", room_status="READY")
    agent = GuestOperationsAgent(repository=repo)

    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        guest_id=fixture["guest_id"],
        requested_time="12:00",
    )

    assert result["decision"] == "APPROVE"
    assert result["room_number"] == "717"
    assert "conflict" not in result["reason"].lower()


# ---------------------------------------------------------------------------
# 11. Endpoint POST /api/events/early-checkin returns the contract
# ---------------------------------------------------------------------------
def test_early_checkin_endpoint_returns_contract(make_guest_and_room):
    """Verify POST /api/events/early-checkin returns HTTP 200 with complete contract fields."""
    fixture = make_guest_and_room(room_number="718", room_status="READY")

    response = client.post(
        "/api/events/early-checkin",
        json={
            "room_number": fixture["room_number"],
            "message": "Can I check in at 12?",
        },
    )

    assert response.status_code == 200
    data = response.json()

    # Check contract fields
    assert "decision" in data
    assert data["decision"] in ("APPROVE", "ESCALATE", "REJECT")
    assert "reason" in data
    assert "guest_message" in data
    assert "requested_time" in data
    assert "ready_by" in data
    assert "room_number" in data

    assert data["decision"] == "APPROVE"
    assert data["requested_time"] == "12:00"
    assert data["ready_by"] == "12:00"
    assert data["room_number"] == "718"
    assert "Your room 718 will be ready for check-in at 12:00." in data["guest_message"]


# ---------------------------------------------------------------------------
# 12. Clock injection tests: now before 12:00
# ---------------------------------------------------------------------------
def test_clock_now_before_12_future_request(make_guest_and_room):
    """Verify behaviour when now is before 12:00 (e.g. 10:30 AM):
    - Future request after 12:00 (e.g. 12:30) APPROVES when room is READY with 'future request' in reason.
    - Future request before 12:00 (e.g. 11:00) ESCALATES due to 12:00 cutoff with 'future request' in reason.
    """
    today = datetime.now(KOLKATA_TZ).date()
    fake_clock = datetime(today.year, today.month, today.day, 10, 30, tzinfo=KOLKATA_TZ)
    fixture = make_guest_and_room(room_number="720", room_status="READY")

    agent = GuestOperationsAgent(repository=repo, clock=fake_clock)

    # 1. Future request for 12:30 (>= 12:00 cutoff)
    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="12:30",
    )
    assert result["decision"] == "APPROVE"
    assert "future request" in result["reason"]
    assert result["guest_message"] == "Your room 720 will be ready for check-in at 12:30. We'll have everything prepared for you."
    assert result["requested_time"] == "12:30"
    assert result["ready_by"] == "12:30"

    # 2. Future request for 11:00 (< 12:00 cutoff)
    result_early = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="11:00",
    )
    assert result_early["decision"] == "ESCALATE"
    assert "earlier than earliest early check-in" in result_early["reason"].lower()
    assert "future request" in result_early["reason"]


# ---------------------------------------------------------------------------
# 13. Clock injection tests: between 12:00 and 14:00 with a future request
# ---------------------------------------------------------------------------
def test_clock_between_12_and_14_with_future_request(make_guest_and_room):
    """Verify behaviour when now is between 12:00 and 14:00 (e.g. 12:30 PM) and request is in future (e.g. 13:30)."""
    today = datetime.now(KOLKATA_TZ).date()
    fake_clock = datetime(today.year, today.month, today.day, 12, 30, tzinfo=KOLKATA_TZ)
    fixture = make_guest_and_room(room_number="721", room_status="READY")

    agent = GuestOperationsAgent(repository=repo, clock=fake_clock)

    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="13:30",
    )
    assert result["decision"] == "APPROVE"
    assert "future request" in result["reason"]
    assert result["guest_message"] == "Your room 721 will be ready for check-in at 13:30. We'll have everything prepared for you."
    assert result["requested_time"] == "13:30"


# ---------------------------------------------------------------------------
# 14. Clock injection tests: between 12:00 and 14:00 with a request that already passed
# ---------------------------------------------------------------------------
def test_clock_between_12_and_14_with_passed_request_ready_approves(make_guest_and_room):
    """Verify APPROVE with fixed guest_message 'Your room {room_number} is ready for check-in now.'
    when now is 13:00, requested_time was 12:00 (already passed), and room is READY.
    """
    today = datetime.now(KOLKATA_TZ).date()
    fake_clock = datetime(today.year, today.month, today.day, 13, 0, tzinfo=KOLKATA_TZ)
    fixture = make_guest_and_room(room_number="722", room_status="READY")

    agent = GuestOperationsAgent(repository=repo, clock=fake_clock)

    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="12:00",
    )
    assert result["decision"] == "APPROVE"
    assert "requested time already passed" in result["reason"]
    assert result["guest_message"] == f"Your room {fixture['room_number']} is ready for check-in now."
    assert result["requested_time"] == "12:00"


def test_clock_between_12_and_14_with_passed_request_not_ready_escalates(make_guest_and_room):
    """Verify ESCALATE with usual front desk message when now is 13:00,
    requested_time was 12:00 (already passed), and room is DIRTY (not ready).
    """
    today = datetime.now(KOLKATA_TZ).date()
    fake_clock = datetime(today.year, today.month, today.day, 13, 0, tzinfo=KOLKATA_TZ)
    fixture = make_guest_and_room(room_number="723", room_status="DIRTY")

    agent = GuestOperationsAgent(repository=repo, clock=fake_clock)

    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="12:00",
    )
    assert result["decision"] == "ESCALATE"
    assert "requested time already passed" in result["reason"]
    assert result["guest_message"] == "I've passed your early check-in request to our front desk. They will contact you shortly."
    assert result["requested_time"] == "12:00"


# ---------------------------------------------------------------------------
# 15. Clock injection tests: after 14:00 (past standard check-in time)
# ---------------------------------------------------------------------------
def test_clock_after_14_normal_checkin_ready_approves(make_guest_and_room):
    """Verify APPROVE when now is 14:30 (past standard check-in time 14:00) and room is READY.
    The earliest_early_check_in cutoff (12:00) must not apply even if request mentions an earlier time (e.g. 11:00).
    Reason must say 'past standard check-in time'.
    """
    today = datetime.now(KOLKATA_TZ).date()
    fake_clock = datetime(today.year, today.month, today.day, 14, 30, tzinfo=KOLKATA_TZ)
    fixture = make_guest_and_room(room_number="724", room_status="READY")

    agent = GuestOperationsAgent(repository=repo, clock=fake_clock)

    # Even with requested time 11:00, cutoff 12:00 must NOT apply after 14:00
    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="11:00",
    )
    assert result["decision"] == "APPROVE"
    assert "past standard check-in time" in result["reason"]
    assert result["guest_message"] == f"Your room {fixture['room_number']} is ready for check-in now."


def test_clock_after_14_normal_checkin_not_ready_escalates(make_guest_and_room):
    """Verify ESCALATE when now is 15:00 (past standard check-in time 14:00) and room is DIRTY."""
    today = datetime.now(KOLKATA_TZ).date()
    fake_clock = datetime(today.year, today.month, today.day, 15, 0, tzinfo=KOLKATA_TZ)
    fixture = make_guest_and_room(room_number="725", room_status="DIRTY")

    agent = GuestOperationsAgent(repository=repo, clock=fake_clock)

    result = agent.process_early_checkin_request(
        room_number=fixture["room_number"],
        requested_time="14:00",
    )
    assert result["decision"] == "ESCALATE"
    assert "past standard check-in time" in result["reason"]
    assert result["guest_message"] == "I've passed your early check-in request to our front desk. They will contact you shortly."
