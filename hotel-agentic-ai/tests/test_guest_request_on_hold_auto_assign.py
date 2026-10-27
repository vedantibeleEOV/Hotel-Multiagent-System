from datetime import datetime, timedelta, timezone
from uuid import UUID
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.database.connection import SessionLocal
from app.database.orm.operational_task_entity import OperationalTaskEntity
from app.database.orm.staff_entity import StaffEntity
from app.main import app
from app.models.enums import RoomStatus, StaffRole, TaskStatus, TaskType
from app.models.operational_task import OperationalTask
from app.repositories.postgres_hotel_repository import PostgresHotelRepository

client = TestClient(app)
repo = PostgresHotelRepository()


def _set_all_housekeepers_busy(workload_per_staff: int = 1):
    """Set all housekeeping staff to is_available=False with the given active workload."""
    with SessionLocal() as session:
        stmt = select(StaffEntity).where(StaffEntity.role == StaffRole.HOUSEKEEPING.value)
        housekeepers = session.execute(stmt).scalars().all()
        for hk in housekeepers:
            hk.is_available = False
            hk.active_task_count = workload_per_staff
        session.commit()


def test_hold_then_complete_then_auto_assign():
    """Verify an ON_HOLD guest request is automatically assigned when a cleaner completes a task."""
    # 1. Make all housekeepers busy
    _set_all_housekeepers_busy(workload_per_staff=1)

    # 2. Assign a real cleaning task to one housekeeper (staff 201) so they can complete it
    hk_task = OperationalTask(
        task_type=TaskType.ROOM_CLEANING,
        room_id=2,
        priority_score=40,
        priority_level="STANDARD",
        status=TaskStatus.ASSIGNED,
        assigned_staff_id=201,
        notes="Standard checkout clean",
    )
    saved_hk_task = repo.save_operational_task(hk_task)

    # 3. Create guest request while no cleaners are free -> created ON_HOLD
    res = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Need two extra blankets."},
    )
    assert res.status_code == 202
    gr_task_id = UUID(res.json()["housekeeping"]["task_id"])

    task_before = repo.get_operational_task_by_id(gr_task_id)
    assert task_before.status == TaskStatus.ON_HOLD
    assert task_before.assigned_staff_id is None

    # Room status must remain OCCUPIED
    room_before = repo.get_room_by_id(1)
    assert room_before.status == RoomStatus.OCCUPIED

    # 4. Housekeeper completes their cleaning task
    complete_res = client.post(f"/api/tasks/{saved_hk_task.id}/complete")
    assert complete_res.status_code == 200

    # 5. Verify the ON_HOLD guest request was auto-assigned
    task_after = repo.get_operational_task_by_id(gr_task_id)
    assert task_after.status == TaskStatus.ASSIGNED
    assert task_after.assigned_staff_id == 201

    # Room status remains OCCUPIED
    room_after = repo.get_room_by_id(1)
    assert room_after.status == RoomStatus.OCCUPIED


def test_no_cleaner_available_task_stays_on_hold():
    """Verify an ON_HOLD guest request remains on hold when no cleaner is free."""
    # 1. Make all housekeepers busy with 2 active tasks each
    _set_all_housekeepers_busy(workload_per_staff=2)

    # 2. Create guest request -> created ON_HOLD
    res = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Need extra dental kit."},
    )
    assert res.status_code == 202
    gr_task_id = UUID(res.json()["housekeeping"]["task_id"])

    task_before = repo.get_operational_task_by_id(gr_task_id)
    assert task_before.status == TaskStatus.ON_HOLD

    # 3. Staff 201 has 2 active tasks. We create and complete 1 task, but they still have 1 remaining
    task_a = repo.save_operational_task(
        OperationalTask(
            task_type=TaskType.ROOM_CLEANING,
            room_id=3,
            priority_score=40,
            priority_level="STANDARD",
            status=TaskStatus.ASSIGNED,
            assigned_staff_id=201,
            notes="Active task 1",
        )
    )
    # Remaining active task for 201
    repo.save_operational_task(
        OperationalTask(
            task_type=TaskType.ROOM_CLEANING,
            room_id=4,
            priority_score=40,
            priority_level="STANDARD",
            status=TaskStatus.ASSIGNED,
            assigned_staff_id=201,
            notes="Active task 2",
        )
    )

    complete_res = client.post(f"/api/tasks/{task_a.id}/complete")
    assert complete_res.status_code == 200

    # Staff 201 still has task_b in progress -> is_available remains False
    staff_201 = repo.get_staff_by_id(201)
    assert staff_201.is_available is False

    # 4. Guest request task MUST stay ON_HOLD
    task_after = repo.get_operational_task_by_id(gr_task_id)
    assert task_after.status == TaskStatus.ON_HOLD
    assert task_after.assigned_staff_id is None

    # Room status remains OCCUPIED
    room = repo.get_room_by_id(1)
    assert room.status == RoomStatus.OCCUPIED


def test_oldest_first_auto_assignment_and_stops_when_no_cleaner_free():
    """Verify ON_HOLD guest requests are auto-assigned oldest first, stopping when no cleaner is free."""
    # 1. Make all housekeepers busy
    _set_all_housekeepers_busy(workload_per_staff=1)

    # 2. Staff 201 has 1 task that can be completed
    cleaner_task = repo.save_operational_task(
        OperationalTask(
            task_type=TaskType.GUEST_REQUEST,
            room_id=5,
            priority_score=40,
            priority_level="STANDARD",
            status=TaskStatus.ASSIGNED,
            assigned_staff_id=201,
            notes="Cleaner active delivery",
        )
    )

    # 3. Create Request A (older)
    now_utc = datetime.now(timezone.utc)
    res_a = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "First request - Bath towels."},
    )
    assert res_a.status_code == 202
    task_a_id = UUID(res_a.json()["housekeeping"]["task_id"])

    # Ensure Request A has an older timestamp
    with SessionLocal() as session:
        t_a = session.get(OperationalTaskEntity, task_a_id)
        t_a.created_at = now_utc - timedelta(minutes=10)
        session.commit()

    # 4. Create Request B (newer) - ensure Room 2 is OCCUPIED
    repo.update_room_status(2, RoomStatus.OCCUPIED)
    res_b = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 2, "description": "Second request - Coffee capsules."},
    )
    assert res_b.status_code == 202
    task_b_id = UUID(res_b.json()["housekeeping"]["task_id"])

    with SessionLocal() as session:
        t_b = session.get(OperationalTaskEntity, task_b_id)
        t_b.created_at = now_utc - timedelta(minutes=5)
        session.commit()

    # Both requests are ON_HOLD
    assert repo.get_operational_task_by_id(task_a_id).status == TaskStatus.ON_HOLD
    assert repo.get_operational_task_by_id(task_b_id).status == TaskStatus.ON_HOLD

    # 5. Cleaner completes their single active task -> exactly 1 cleaner becomes free
    complete_res = client.post(f"/api/tasks/{cleaner_task.id}/complete")
    assert complete_res.status_code == 200

    # 6. Request A (oldest) MUST be assigned, Request B MUST stay ON_HOLD (no more free cleaners)
    task_a_after = repo.get_operational_task_by_id(task_a_id)
    task_b_after = repo.get_operational_task_by_id(task_b_id)

    assert task_a_after.status == TaskStatus.ASSIGNED
    assert task_a_after.assigned_staff_id == 201

    assert task_b_after.status == TaskStatus.ON_HOLD
    assert task_b_after.assigned_staff_id is None

    # Both rooms remain OCCUPIED
    assert repo.get_room_by_id(1).status == RoomStatus.OCCUPIED
    assert repo.get_room_by_id(2).status == RoomStatus.OCCUPIED

    # 7. Now complete Request A -> Cleaner 201 becomes free again -> Request B auto-assigned!
    complete_a_res = client.post(f"/api/tasks/{task_a_id}/complete")
    assert complete_a_res.status_code == 200

    task_b_final = repo.get_operational_task_by_id(task_b_id)
    assert task_b_final.status == TaskStatus.ASSIGNED
    assert task_b_final.assigned_staff_id == 201
    assert repo.get_room_by_id(2).status == RoomStatus.OCCUPIED
