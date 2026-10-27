from uuid import UUID
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database.connection import SessionLocal
from app.database.orm.staff_entity import StaffEntity
from app.main import app
from app.models.enums import RoomStatus, StaffRole, TaskStatus, TaskType
from app.repositories.postgres_hotel_repository import PostgresHotelRepository

client = TestClient(app)
repo = PostgresHotelRepository()


def test_guest_request_accepted_and_assigned():
    """Verify 202 response and creation of GUEST_REQUEST task assigned to a housekeeper."""
    response = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Please deliver extra bath towels."},
    )
    assert response.status_code == 202
    data = response.json()

    assert data["message"] == "Guest request received and routed"
    assert data["processing_status"] == "ROUTED"

    # Orchestration block
    assert "orchestration" in data
    assert data["orchestration"]["workflow_name"] == "GUEST_REQUEST"
    assert data["orchestration"]["next_agent"] == "HOUSEKEEPING_AGENT"
    assert data["orchestration"]["room_id"] == 1

    # Housekeeping block
    assert "housekeeping" in data
    hk = data["housekeeping"]
    assert hk["room_id"] == 1
    assert hk["task_id"] is not None
    assert hk["assigned_staff_id"] is not None
    assert hk["assigned_staff_name"] is not None
    assert hk["status"] == "HOUSEKEEPING_ASSIGNED"

    # Verify task directly in repository
    task_id = UUID(hk["task_id"])
    task = repo.get_operational_task_by_id(task_id)
    assert task is not None
    assert task.task_type == TaskType.GUEST_REQUEST
    assert task.status == TaskStatus.ASSIGNED
    assert task.priority_score == 50
    assert task.priority_level == "MEDIUM"
    assert task.notes == "Please deliver extra bath towels."
    assert task.assigned_staff_id == hk["assigned_staff_id"]


def test_room_stays_occupied_lifecycle():
    """Verify room 1 stays OCCUPIED across create, start, and complete lifecycle steps."""
    # Check initial room state is OCCUPIED
    room_before = repo.get_room_by_id(1)
    assert room_before.status == RoomStatus.OCCUPIED

    # 1. Create guest request
    create_res = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Need fresh towels and extra shampoo."},
    )
    assert create_res.status_code == 202
    task_id = create_res.json()["housekeeping"]["task_id"]

    # Verify room status stays OCCUPIED after create
    room_after_create = repo.get_room_by_id(1)
    assert room_after_create.status == RoomStatus.OCCUPIED

    # 2. Start the delivery task
    start_res = client.post(f"/api/tasks/{task_id}/start")
    assert start_res.status_code == 200

    # Verify room status stays OCCUPIED after start
    room_after_start = repo.get_room_by_id(1)
    assert room_after_start.status == RoomStatus.OCCUPIED

    # 3. Complete the delivery task
    complete_res = client.post(f"/api/tasks/{task_id}/complete")
    assert complete_res.status_code == 200

    # Verify room status stays OCCUPIED after complete
    room_after_complete = repo.get_room_by_id(1)
    assert room_after_complete.status == RoomStatus.OCCUPIED


def test_completing_task_releases_housekeeper():
    """Verify completing guest request releases the housekeeper (is_available=True, workload decremented)."""
    create_res = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Extra dental kit needed."},
    )
    assert create_res.status_code == 202
    hk_info = create_res.json()["housekeeping"]
    task_id = hk_info["task_id"]
    staff_id = hk_info["assigned_staff_id"]

    # Verify staff is currently assigned and busy
    staff_before = repo.get_staff_by_id(staff_id)
    assert staff_before.is_available is False
    assert staff_before.active_task_count >= 1

    # Complete the task
    complete_res = client.post(f"/api/tasks/{task_id}/complete")
    assert complete_res.status_code == 200

    # Verify staff is released
    staff_after = repo.get_staff_by_id(staff_id)
    assert staff_after.is_available is True
    assert staff_after.active_task_count == 0
    assert staff_after.assigned_room_id is None


def test_out_of_order_room_returns_409():
    """Verify guest request on an OUT_OF_ORDER room returns HTTP 409 Conflict."""
    repo.update_room_status(2, RoomStatus.OUT_OF_ORDER)

    response = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 2, "description": "Need extra pillows please."},
    )
    assert response.status_code == 409
    err = response.json()["detail"]
    assert "out_of_order" in err.lower() or "does not allow" in err.lower()


def test_unknown_room_returns_error_style_as_maintenance():
    """Verify guest request for non-existent room returns error style matching maintenance (400 or 404)."""
    response = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 9999, "description": "Extra towels please."},
    )
    assert response.status_code in (400, 404)
    err = response.json()["detail"]
    assert "not found" in err.lower()


def test_description_shorter_than_3_characters_returns_422():
    """Verify description with fewer than 3 characters is rejected with HTTP 422."""
    # 2 characters
    res_short = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "hi"},
    )
    assert res_short.status_code == 422

    # empty string
    res_empty = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": ""},
    )
    assert res_empty.status_code == 422


def test_task_detail_shows_guest_request_metadata():
    """Verify GET /api/tasks/{id}/detail shows type_label 'Guest request', GR- prefix, Delivering/Delivered status."""
    create_res = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Two extra pillows and bathrobes."},
    )
    assert create_res.status_code == 202
    task_id = create_res.json()["housekeeping"]["task_id"]

    # 1. Detail when ASSIGNED
    detail_res = client.get(f"/api/tasks/{task_id}/detail")
    assert detail_res.status_code == 200
    detail = detail_res.json()

    assert detail["type_label"] == "Guest request"
    assert detail["display_id"].startswith("GR-")
    assert detail["assigned_by"] == "Housekeeping Agent"
    assert detail["description"] == "Two extra pillows and bathrobes."
    assert detail["incident"] is None
    assert detail["status_label"] == "Assigned"

    # 2. Detail when IN_PROGRESS (Delivering)
    start_res = client.post(f"/api/tasks/{task_id}/start")
    assert start_res.status_code == 200

    in_prog_detail = client.get(f"/api/tasks/{task_id}/detail").json()
    assert in_prog_detail["type_label"] == "Guest request"
    assert in_prog_detail["status_label"] == "Delivering"

    # 3. Detail when COMPLETED (Delivered)
    comp_res = client.post(f"/api/tasks/{task_id}/complete")
    assert comp_res.status_code == 200

    completed_detail = client.get(f"/api/tasks/{task_id}/detail").json()
    assert completed_detail["type_label"] == "Guest request"
    assert completed_detail["status_label"] == "Delivered"


def test_cancel_task_preserves_occupied_room_status():
    """Verify cancelling a guest request does not modify room status."""
    create_res = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Cancel test request."},
    )
    assert create_res.status_code == 202
    task_id = create_res.json()["housekeeping"]["task_id"]

    cancel_res = client.post(f"/api/tasks/{task_id}/cancel")
    assert cancel_res.status_code == 200

    room = repo.get_room_by_id(1)
    assert room.status == RoomStatus.OCCUPIED


def test_no_available_housekeeper_keeps_task_pending():
    """Verify when no housekeeper is available, the guest request task stays PENDING and unassigned."""
    with SessionLocal() as session:
        stmt = select(StaffEntity).where(StaffEntity.role == StaffRole.HOUSEKEEPING.value)
        housekeepers = session.execute(stmt).scalars().all()
        for hk in housekeepers:
            hk.is_available = False
            hk.active_task_count = 5
        session.commit()

    response = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Need ice bucket urgently."},
    )
    assert response.status_code == 202
    data = response.json()

    hk = data["housekeeping"]
    assert hk["status"] == "WAITING_FOR_STAFF"
    assert hk["assigned_staff_id"] is None
    assert hk["assigned_staff_name"] is None
    assert "pending" in hk["reason"].lower() or "no housekeeping" in hk["reason"].lower()

    # Verify task in DB
    task_id = UUID(hk["task_id"])
    task = repo.get_operational_task_by_id(task_id)
    assert task.status in (TaskStatus.PENDING, TaskStatus.ON_HOLD)
    assert task.assigned_staff_id is None
