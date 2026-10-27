from datetime import datetime, timedelta, timezone
from typing import Any, List, Union
from uuid import uuid4

from app.models.enums import RoomStatus, TaskStatus, TaskType
from app.models.housekeeping_request import HousekeepingRequestResult
from app.models.housekeeping_result import HousekeepingResult
from app.models.operational_task import OperationalTask
from app.models.room_readiness_result import RoomReadinessResult
from app.repositories.postgres_hotel_repository import PostgresHotelRepository


class HousekeepingAgent:
    def __init__(self, repository: Union[PostgresHotelRepository, Any]):
        self.repository = repository
        self.activity_logs = []

    def assign_cleaning_task(self, readiness: RoomReadinessResult) -> HousekeepingResult:
        room = self.repository.get_room_by_id(readiness.room_id)
        if not room:
            raise ValueError(f"Room with ID {readiness.room_id} not found.")

        room_status_str = room.status.value if hasattr(room.status, "value") else str(room.status)
        if room_status_str != RoomStatus.DIRTY.value:
            raise ValueError(
                f"Room {readiness.room_id} must be in DIRTY status to assign housekeeping, but is {room_status_str}."
            )

        available_staff = self.repository.get_available_housekeeping_staff(room.floor)

        if not available_staff:
            event_id = uuid4()
            result = HousekeepingResult(
                event_id=event_id,
                room_id=readiness.room_id,
                task_id=None,
                task_status=None,
                assigned_staff_id=None,
                assigned_staff_name=None,
                previous_room_status=RoomStatus.DIRTY,
                new_room_status=RoomStatus.DIRTY,
                priority_score=readiness.priority_score,
                priority_level=readiness.priority_level,
                status="WAITING_FOR_STAFF",
                reason="No housekeeping employee is currently available for this room.",
            )
            self.activity_logs.append({
                "agent": "HOUSEKEEPING_AGENT",
                "action": "ESCALATE_NO_STAFF",
                "room_id": readiness.room_id,
                "priority_level": readiness.priority_level,
                "status": "ESCALATED",
            })
            return result

        task = OperationalTask(
            task_type=TaskType.ROOM_CLEANING,
            room_id=readiness.room_id,
            priority_score=readiness.priority_score,
            priority_level=readiness.priority_level,
            status=TaskStatus.PENDING,
            notes="Cleaning task created following guest checkout.",
        )
        saved_task = self.repository.save_operational_task(task)

        selected_staff = available_staff[0]
        updated_task = self.repository.assign_task_to_staff(saved_task.id, selected_staff.id)

        now_dt = datetime.now(timezone.utc)
        prev_st = readiness.previous_status or "OCCUPIED"
        p_label = {
            "URGENT": "Critical",
            "CRITICAL": "Critical",
            "HIGH": "High",
            "STANDARD": "Medium",
            "MEDIUM": "Medium",
            "NORMAL": "Low",
            "LOW": "Low",
        }.get(str(readiness.priority_level).upper(), str(readiness.priority_level).title())

        if hasattr(self.repository, "log_activity"):
            # 1. Guest checkout received
            self.repository.log_activity(
                task_id=saved_task.id,
                room_id=readiness.room_id,
                event_type="CHECKOUT_EVENT",
                title="Guest checkout received",
                actor_name="PMS",
                actor_role="System",
                action="Guest checked out",
                outcome="Event queued",
                timestamp=now_dt - timedelta(seconds=60),
            )
            # 2. Room status changed
            self.repository.log_activity(
                task_id=saved_task.id,
                room_id=readiness.room_id,
                event_type="ROOM_STATUS_CHANGED",
                title="Room status changed",
                actor_name="Room Readiness Agent",
                actor_role="AI Agent",
                action=f"{prev_st} → DIRTY",
                outcome=f"Priority {p_label}",
                timestamp=now_dt - timedelta(seconds=30),
            )
            # 3. Task created
            self.repository.log_activity(
                task_id=saved_task.id,
                room_id=readiness.room_id,
                event_type="TASK_CREATED",
                title="Task created",
                actor_name="Housekeeping Agent",
                actor_role="AI Agent",
                action="Cleaning task created",
                outcome=f"{p_label} priority",
                timestamp=now_dt,
            )
            # 4. Cleaner assigned
            self.repository.log_activity(
                task_id=saved_task.id,
                room_id=readiness.room_id,
                event_type="STAFF_ASSIGNED",
                title="Cleaner assigned",
                actor_name="Housekeeping Agent",
                actor_role="AI Agent",
                action=f"Assigned {selected_staff.name}",
                outcome="Assigned automatically",
                timestamp=now_dt + timedelta(seconds=1),
            )

        previous_status = room_status_str
        self.repository.update_room_status(room.id, RoomStatus.CLEANING)

        event_id = uuid4()
        result = HousekeepingResult(
            event_id=event_id,
            room_id=readiness.room_id,
            task_id=updated_task.id,
            task_status=updated_task.status,
            assigned_staff_id=selected_staff.id,
            assigned_staff_name=selected_staff.name,
            previous_room_status=previous_status,
            new_room_status=RoomStatus.CLEANING,
            priority_score=readiness.priority_score,
            priority_level=readiness.priority_level,
            status="HOUSEKEEPING_ASSIGNED",
            reason=f"Assigned to {selected_staff.name} based on floor match and lowest workload.",
        )

        self.activity_logs.append({
            "agent": "HOUSEKEEPING_AGENT",
            "event_id": event_id,
            "action": "ASSIGN_CLEANING_TASK",
            "room_id": readiness.room_id,
            "task_id": updated_task.id,
            "assigned_staff_id": selected_staff.id,
            "priority_score": readiness.priority_score,
            "priority_level": readiness.priority_level,
            "previous_status": previous_status,
            "new_status": RoomStatus.CLEANING,
            "status": "COMPLETED",
        })

        return result

    def assign_guest_request_task(self, room: Any, description: str) -> HousekeepingRequestResult:
        """Assign guest item request to available housekeeper without affecting room status."""
        if isinstance(room, int):
            room_obj = self.repository.get_room_by_id(room)
            if not room_obj:
                raise ValueError(f"Room with ID {room} not found.")
            room = room_obj

        room_num = getattr(room, "room_number", room.id)
        selected_staff = None
        match_reason = None

        # 1. Prefer active housekeeper already assigned to this room (ASSIGNED or IN_PROGRESS)
        if hasattr(self.repository, "get_active_room_housekeeper"):
            from app.config import settings
            cap = getattr(settings, "MAX_HOUSEKEEPER_ACTIVE_TASKS", 5)
            same_room_cleaner = self.repository.get_active_room_housekeeper(room.id, max_active_tasks=cap)
            if same_room_cleaner:
                selected_staff = same_room_cleaner
                match_reason = f"Same room match (Room {room_num}), already assigned with {selected_staff.active_task_count} active tasks"

        # 2. Fall back to existing rule: same floor match, lowest workload
        if not selected_staff:
            available_staff = self.repository.get_available_housekeeping_staff(room.floor)
            if available_staff:
                selected_staff = available_staff[0]
                match_reason = (
                    f"Floor {selected_staff.assigned_floor} match, lowest workload ({selected_staff.active_task_count} active tasks)"
                    if selected_staff.assigned_floor == room.floor
                    else f"Assigned from Floor {selected_staff.assigned_floor} (workload: {selected_staff.active_task_count} active tasks)"
                )

        task = OperationalTask(
            task_type=TaskType.GUEST_REQUEST,
            room_id=room.id,
            priority_score=50,
            priority_level="MEDIUM",
            status=TaskStatus.PENDING,
            notes=description,
        )
        saved_task = self.repository.save_operational_task(task)

        if hasattr(self.repository, "log_activity"):
            self.repository.log_activity(
                task_id=saved_task.id,
                room_id=room.id,
                event_type="GUEST_REQUEST_RECEIVED",
                title="Guest request received",
                actor_name="Guest",
                actor_role="Guest",
                action=f"Guest request for Room {room_num}",
                outcome=f'"{description}"',
            )

        if selected_staff:
            self.repository.assign_task_to_staff(saved_task.id, selected_staff.id)
            if not match_reason:
                match_reason = (
                    f"Floor {selected_staff.assigned_floor} match, lowest workload ({selected_staff.active_task_count} active tasks)"
                    if selected_staff.assigned_floor == room.floor
                    else f"Assigned from Floor {selected_staff.assigned_floor} (workload: {selected_staff.active_task_count} active tasks)"
                )

            if hasattr(self.repository, "log_activity"):
                self.repository.log_activity(
                    task_id=saved_task.id,
                    room_id=room.id,
                    event_type="STAFF_ASSIGNED",
                    title="Housekeeper assigned",
                    actor_name="Housekeeping Agent",
                    actor_role="AI Agent",
                    action=f"Assigned {selected_staff.name}",
                    outcome=match_reason,
                )

            self.activity_logs.append({
                "agent": "HOUSEKEEPING_AGENT",
                "action": "ASSIGN_GUEST_REQUEST_TASK",
                "room_id": room.id,
                "task_id": saved_task.id,
                "assigned_staff_id": selected_staff.id,
                "priority_score": 50,
                "priority_level": "MEDIUM",
                "status": "COMPLETED",
            })

            return HousekeepingRequestResult(
                room_id=room.id,
                task_id=saved_task.id,
                task_status=TaskStatus.ASSIGNED,
                assigned_staff_id=selected_staff.id,
                assigned_staff_name=selected_staff.name,
                status="HOUSEKEEPING_ASSIGNED",
                reason=match_reason,
            )
        else:
            reason = "No housekeeping employee is currently available; task kept on hold and unassigned."
            saved_task.status = TaskStatus.ON_HOLD
            self.repository.save_operational_task(saved_task)
            self.activity_logs.append({
                "agent": "HOUSEKEEPING_AGENT",
                "action": "NO_HOUSEKEEPER_AVAILABLE",
                "room_id": room.id,
                "task_id": saved_task.id,
                "status": "ON_HOLD",
            })
            return HousekeepingRequestResult(
                room_id=room.id,
                task_id=saved_task.id,
                task_status=TaskStatus.ON_HOLD,
                assigned_staff_id=None,
                assigned_staff_name=None,
                status="WAITING_FOR_STAFF",
                reason=reason,
            )

    def assign_on_hold_guest_requests(self) -> List[Any]:
        """Trigger auto-assignment of ON_HOLD guest requests using the repository."""
        if hasattr(self.repository, "assign_on_hold_guest_requests"):
            return self.repository.assign_on_hold_guest_requests()
        return []
