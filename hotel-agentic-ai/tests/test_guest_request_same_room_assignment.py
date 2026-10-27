from datetime import datetime, timezone
from uuid import UUID
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.config import settings
from app.database.connection import SessionLocal
from app.database.orm.operational_task_entity import OperationalTaskEntity
from app.database.orm.staff_entity import StaffEntity
from app.main import app
from app.models.enums import RoomStatus, StaffRole, TaskStatus, TaskType
from app.models.operational_task import OperationalTask
from app.repositories.postgres_hotel_repository import PostgresHotelRepository

client = TestClient(app)
repo = PostgresHotelRepository()


def _reset_housekeepers():
    """Reset all housekeeping staff to available, 0 active tasks, and AVAILABLE status."""
    with SessionLocal() as session:
        stmt = select(StaffEntity).where(StaffEntity.role == StaffRole.HOUSEKEEPING.value)
        for staff in session.execute(stmt).scalars().all():
            staff.is_available = True
            staff.active_task_count = 0
            staff.availability_status = "AVAILABLE"
            staff.assigned_room_id = None
        session.commit()


def test_same_room_two_requests_go_to_same_housekeeper():
    """Verify that multiple guest requests for the same room are assigned to the same housekeeper."""
    _reset_housekeepers()
    repo.update_room_status(1, RoomStatus.OCCUPIED)

    # 1. First guest request for Room 1
    res1 = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Need 2 extra pillows."},
    )
    assert res1.status_code == 202
    hk1 = res1.json()["housekeeping"]
    staff1_id = hk1["assigned_staff_id"]
    assert staff1_id is not None

    # 2. Second guest request for the SAME Room 1
    res2 = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Need 2 fresh towels."},
    )
    assert res2.status_code == 202
    hk2 = res2.json()["housekeeping"]
    staff2_id = hk2["assigned_staff_id"]

    # Both requests must be assigned to the same housekeeper
    assert staff2_id == staff1_id
    assert "same room match" in hk2["reason"].lower()

    # Verify both tasks in database
    t1 = repo.get_operational_task_by_id(UUID(hk1["task_id"]))
    t2 = repo.get_operational_task_by_id(UUID(hk2["task_id"]))
    assert t1.assigned_staff_id == staff1_id
    assert t2.assigned_staff_id == staff1_id

    # Cleaner's active task count is now 2
    staff = repo.get_staff_by_id(staff1_id)
    assert staff.active_task_count == 2


def test_different_rooms_spread_to_different_housekeepers():
    """Verify that guest requests for different rooms spread to different available housekeepers."""
    _reset_housekeepers()
    repo.update_room_status(1, RoomStatus.OCCUPIED)
    repo.update_room_status(2, RoomStatus.OCCUPIED)

    # Request for Room 1
    res1 = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Pillows for Room 1."},
    )
    assert res1.status_code == 202
    staff1_id = res1.json()["housekeeping"]["assigned_staff_id"]

    # Request for Room 2
    res2 = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 2, "description": "Towels for Room 2."},
    )
    assert res2.status_code == 202
    staff2_id = res2.json()["housekeeping"]["assigned_staff_id"]

    # Must be assigned to different housekeepers
    assert staff1_id != staff2_id


def test_cap_reached_falls_back_to_another_housekeeper():
    """Verify that when a room's housekeeper reaches the active task cap (N=5), assignment falls back."""
    _reset_housekeepers()
    repo.update_room_status(1, RoomStatus.OCCUPIED)

    # Submit 5 requests for Room 1 (reaching default cap of 5)
    first_staff_id = None
    for i in range(settings.MAX_HOUSEKEEPER_ACTIVE_TASKS):
        res = client.post(
            "/api/events/housekeeping-request",
            json={"room_id": 1, "description": f"Request {i+1} for Room 1."},
        )
        assert res.status_code == 202
        assigned_id = res.json()["housekeeping"]["assigned_staff_id"]
        if first_staff_id is None:
            first_staff_id = assigned_id
        else:
            assert assigned_id == first_staff_id

    # Verify first staff has reached active task cap
    staff_info = repo.get_staff_by_id(first_staff_id)
    assert staff_info.active_task_count == settings.MAX_HOUSEKEEPER_ACTIVE_TASKS

    # 6th request for Room 1 must fall back to another available housekeeper
    res6 = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "6th request: Extra dental kit."},
    )
    assert res6.status_code == 202
    hk6 = res6.json()["housekeeping"]
    staff6_id = hk6["assigned_staff_id"]

    # Must be assigned to a different housekeeper
    assert staff6_id is not None
    assert staff6_id != first_staff_id


def test_housekeeper_offline_falls_back_to_another_housekeeper():
    """Verify that if the room's housekeeper is OFFLINE or ON_LEAVE, assignment falls back."""
    _reset_housekeepers()
    repo.update_room_status(1, RoomStatus.OCCUPIED)

    # 1. First request for Room 1
    res1 = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Initial request for Room 1."},
    )
    assert res1.status_code == 202
    staff1_id = res1.json()["housekeeping"]["assigned_staff_id"]

    # 2. Mark this housekeeper OFFLINE
    with SessionLocal() as session:
        staff_ent = session.get(StaffEntity, staff1_id)
        staff_ent.availability_status = "OFFLINE"
        session.commit()

    # 3. Second request for Room 1 while housekeeper is OFFLINE
    res2 = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Follow-up request while cleaner offline."},
    )
    assert res2.status_code == 202
    hk2 = res2.json()["housekeeping"]
    staff2_id = hk2["assigned_staff_id"]

    # Must fall back to another available housekeeper
    assert staff2_id is not None
    assert staff2_id != staff1_id


def test_on_hold_request_prefers_room_housekeeper():
    """Verify that an ON_HOLD request for a room is assigned to the housekeeper already working on that room."""
    _reset_housekeepers()
    repo.update_room_status(1, RoomStatus.OCCUPIED)

    # 1. Staff 201 is active in Room 1 (has 1 active GUEST_REQUEST task)
    active_task = repo.save_operational_task(
        OperationalTask(
            task_type=TaskType.GUEST_REQUEST,
            room_id=1,
            priority_score=50,
            priority_level="MEDIUM",
            status=TaskStatus.ASSIGNED,
            assigned_staff_id=201,
            notes="Active delivery in Room 1",
        )
    )
    with SessionLocal() as session:
        s201 = session.get(StaffEntity, 201)
        s201.active_task_count = 1
        s201.is_available = False
        s201.assigned_room_id = 1

        # Make other housekeepers busy as well
        s202 = session.get(StaffEntity, 202)
        s202.active_task_count = 1
        s202.is_available = False

        s203 = session.get(StaffEntity, 203)
        s203.active_task_count = 1
        s203.is_available = False
        session.commit()

    # 2. Create an ON_HOLD request for Room 1
    on_hold_task = repo.save_operational_task(
        OperationalTask(
            task_type=TaskType.GUEST_REQUEST,
            room_id=1,
            priority_score=50,
            priority_level="MEDIUM",
            status=TaskStatus.ON_HOLD,
            assigned_staff_id=None,
            notes="On-hold request for Room 1",
        )
    )

    # Verify task is currently ON_HOLD
    saved = repo.get_operational_task_by_id(on_hold_task.id)
    assert saved.status == TaskStatus.ON_HOLD

    # 3. Trigger assign_on_hold_guest_requests
    assigned = repo.assign_on_hold_guest_requests()
    assert len(assigned) >= 1

    # 4. Verify the on-hold task for Room 1 was assigned to Staff 201 (the room's active housekeeper)
    updated_task = repo.get_operational_task_by_id(on_hold_task.id)
    assert updated_task.status == TaskStatus.ASSIGNED
    assert updated_task.assigned_staff_id == 201
