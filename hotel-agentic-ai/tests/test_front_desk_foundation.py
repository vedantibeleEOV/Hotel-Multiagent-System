from datetime import datetime, time, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import text

from app.agents.guest_operations_agent import evaluate_room_readiness
from app.database import OperationalTaskEntity, MaintenanceIncidentEntity, RoomEntity, SessionLocal
from app.repositories.postgres_hotel_repository import PostgresHotelRepository


def test_hotel_policy_seeded_and_retrieved():
    """Verify hotel policy table exists with the exact required seeded values."""
    repo = PostgresHotelRepository()
    policy = repo.get_hotel_policy()

    assert policy is not None
    assert policy.standard_check_in_time == "14:00"
    assert policy.standard_check_out_time == "11:00"
    assert policy.earliest_early_check_in == "12:00"
    assert policy.early_check_in_requires_ready_room is True
    assert policy.vip_priority is True


def test_vip_vs_regular_guest():
    """Verify is_vip_guest identifies VIP and regular guests correctly."""
    repo = PostgresHotelRepository()

    # Guest 102 is seeded as VIP
    assert repo.is_vip_guest(102) is True

    # Guest 101 is seeded as REGULAR
    assert repo.is_vip_guest(101) is False

    # Non-existent guest returns False
    assert repo.is_vip_guest(9999) is False


def test_get_room_status():
    """Verify get_room_status returns string status without altering DB."""
    repo = PostgresHotelRepository()

    # Room 1 (405) is OCCUPIED in seed
    assert repo.get_room_status(1) == "OCCUPIED"

    # Room 2 (406) is READY in seed
    assert repo.get_room_status(2) == "READY"

    # Non-existent room returns None
    assert repo.get_room_status(99999) is None


def test_get_current_occupant_reservation():
    """Verify get_current_occupant_reservation returns active occupant reservation with check_out_time."""
    repo = PostgresHotelRepository()

    # Room 1 (405) has active reservation 5006
    occupant = repo.get_current_occupant_reservation(1)
    assert occupant is not None
    assert occupant["room_id"] == 1
    assert occupant["id"] == 5006
    assert occupant["check_out_time"] is not None

    # Room 2 (406) is unoccupied
    assert repo.get_current_occupant_reservation(2) is None


def test_get_reservation_for_guest_room():
    """Verify get_reservation_for_guest_room returns reservation by room number, guest, or date."""
    repo = PostgresHotelRepository()

    # Query by room number "405"
    res = repo.get_reservation_for_guest_room(room_number="405")
    assert res is not None
    assert res["room_number"] == "405"
    assert res["id"] == 5006

    # Query by guest_id 101
    res_guest = repo.get_reservation_for_guest_room(guest_id=101)
    assert res_guest is not None
    assert res_guest["guest_id"] == 101

    # Non-existent query returns None
    assert repo.get_reservation_for_guest_room(guest_id=99999) is None
    assert repo.get_reservation_for_guest_room(room_number="9999") is None


def test_get_cleaning_eta_calculation():
    """Verify get_cleaning_eta uses room type duration (Deluxe: 45m, Standard: 30m)."""
    repo = PostgresHotelRepository()

    # Room 2 (406, STANDARD) with no active cleaning task returns None
    assert repo.get_cleaning_eta(2) is None

    # Insert an active cleaning task for Room 1 (405, DELUXE -> 45 min job)
    now_utc = datetime.now(timezone.utc)
    started = now_utc - timedelta(minutes=15)
    with SessionLocal() as session:
        task = OperationalTaskEntity(
            room_id=1,
            task_type="ROOM_CLEANING",
            priority_score=50,
            priority_level="NORMAL",
            status="IN_PROGRESS",
            created_at=started,
            started_at=started,
            notes="Active cleaning test",
        )
        session.add(task)
        session.commit()

    eta_info = repo.get_cleaning_eta(1)
    assert eta_info is not None
    assert eta_info["status"] == "IN_PROGRESS"
    assert eta_info["duration_minutes"] == 45
    expected_finish = started + timedelta(minutes=45)
    assert abs((eta_info["estimated_finish_time"] - expected_finish).total_seconds()) < 5


def test_get_maintenance_blockers():
    """Verify get_maintenance_blockers returns open incidents with blocks_housekeeping=True."""
    repo = PostgresHotelRepository()

    # Room 2 initially has no blockers
    assert repo.get_maintenance_blockers(2) == []

    # Insert an open maintenance incident that blocks housekeeping
    with SessionLocal() as session:
        inc = MaintenanceIncidentEntity(
            room_id=2,
            category="HVAC",
            severity="HIGH",
            status="OPEN",
            description="AC compressor breakdown",
            sla_minutes=30,
            blocks_housekeeping=True,
            affects_room_readiness=True,
        )
        session.add(inc)
        session.commit()

    blockers = repo.get_maintenance_blockers(2)
    assert len(blockers) == 1
    assert blockers[0]["category"] == "HVAC"
    assert blockers[0]["blocks_housekeeping"] is True


def test_evaluate_room_readiness_ready_room():
    """Verify evaluate_room_readiness succeeds for a READY room with no blockers."""
    repo = PostgresHotelRepository()

    # Room 2 (406) is READY in seed data
    requested_time = datetime.now(timezone.utc).replace(hour=13, minute=0, second=0, microsecond=0)
    result = evaluate_room_readiness(2, requested_time, repository=repo)

    assert result["blockers"] == []
    assert result["ready_by"] == requested_time
    assert "ready" in result["reason"].lower()


def test_evaluate_room_readiness_dirty_with_cleaning_eta():
    """Verify evaluate_room_readiness for DIRTY room calculates estimated turnaround."""
    repo = PostgresHotelRepository()

    # Temporarily set room 2 to DIRTY
    with SessionLocal() as session:
        r = session.get(RoomEntity, 2)
        r.status = "DIRTY"
        session.commit()

    # Check-in requested immediately (5 minutes from now)
    soon = datetime.now(timezone.utc) + timedelta(minutes=5)
    result = evaluate_room_readiness(2, soon, repository=repo)

    # 30-min turnaround for standard room completes after 5 minutes
    assert len(result["blockers"]) > 0
    assert any("turnaround" in b.lower() or "dirty" in b.lower() for b in result["blockers"])
    assert result["ready_by"] is not None


def test_evaluate_room_readiness_cleaning_in_progress():
    """Verify evaluate_room_readiness for CLEANING room uses active task finish ETA."""
    repo = PostgresHotelRepository()
    now_utc = datetime.now(timezone.utc)
    started = now_utc - timedelta(minutes=10)

    # Set room 2 to CLEANING and insert active task (Standard room: 30 min duration -> 20 min left)
    with SessionLocal() as session:
        r = session.get(RoomEntity, 2)
        r.status = "CLEANING"
        task = OperationalTaskEntity(
            room_id=2,
            task_type="ROOM_CLEANING",
            priority_score=50,
            priority_level="NORMAL",
            status="IN_PROGRESS",
            created_at=started,
            started_at=started,
        )
        session.add(task)
        session.commit()

    # Request check-in right now (10 minutes before estimated completion)
    result = evaluate_room_readiness(2, now_utc, repository=repo)
    assert len(result["blockers"]) > 0
    assert any("cleaning in progress" in b.lower() for b in result["blockers"])
    assert result["ready_by"] is not None
    assert result["ready_by"] > now_utc


def test_evaluate_room_readiness_occupied_checkout_after_requested_time():
    """Verify evaluate_room_readiness flags occupant checkout after requested time."""
    repo = PostgresHotelRepository()

    # Room 1 (405) is OCCUPIED with checkout tomorrow
    today_noon = datetime.now(timezone.utc).replace(hour=12, minute=30, second=0, microsecond=0)
    result = evaluate_room_readiness(1, today_noon, repository=repo)

    assert len(result["blockers"]) > 0
    assert any("occupied" in b.lower() for b in result["blockers"])
    assert "checkout" in result["reason"].lower()


def test_evaluate_room_readiness_maintenance_blocker():
    """Verify evaluate_room_readiness hard-blocks when open maintenance blocks housekeeping."""
    repo = PostgresHotelRepository()

    with SessionLocal() as session:
        inc = MaintenanceIncidentEntity(
            room_id=2,
            category="PLUMBING",
            severity="HIGH",
            status="OPEN",
            description="Flooded bathroom pipe",
            sla_minutes=30,
            blocks_housekeeping=True,
            affects_room_readiness=True,
        )
        session.add(inc)
        session.commit()

    req_time = datetime.now(timezone.utc).replace(hour=14, minute=0, second=0, microsecond=0)
    result = evaluate_room_readiness(2, req_time, repository=repo)

    assert result["ready_by"] is None
    assert any("maintenance" in b.lower() for b in result["blockers"])
    assert "flooded bathroom pipe" in result["reason"].lower()


def test_evaluate_room_readiness_earliest_early_checkin_policy_violation():
    """Verify evaluate_room_readiness blocks requests before earliest_early_check_in (12:00)."""
    repo = PostgresHotelRepository()

    # Request at 10:00 AM (policy cutoff is 12:00)
    too_early = datetime.now(timezone.utc).replace(hour=10, minute=0, second=0, microsecond=0)
    result = evaluate_room_readiness(2, too_early, repository=repo)

    assert result["ready_by"] is None
    assert any("earliest" in b.lower() for b in result["blockers"])


def test_evaluate_room_readiness_nonexistent_room():
    """Verify evaluate_room_readiness handles non-existent room ID gracefully."""
    repo = PostgresHotelRepository()
    result = evaluate_room_readiness(99999, "13:00", repository=repo)

    assert result["ready_by"] is None
    assert any("not found" in b.lower() for b in result["blockers"])
