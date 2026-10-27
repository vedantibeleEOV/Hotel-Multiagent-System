from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.agents.orchestrator_agent import OperationsOrchestratorAgent
from app.dependencies.auth import get_current_user
from app.models.early_checkin import EarlyCheckInRequest, EarlyCheckInResponse
from app.models.housekeeping_request import HousekeepingRequest
from app.repositories.postgres_hotel_repository import PostgresHotelRepository

router = APIRouter(dependencies=[Depends(get_current_user)])
repository = PostgresHotelRepository()
orchestrator = OperationsOrchestratorAgent(repository)


@router.get(
    "/housekeeping/board",
    status_code=status.HTTP_200_OK,
    summary="Get Housekeeping Kanban Board",
    description="Retrieve live housekeeping operations board including workload summary, column cards, staff attendants, and real-time SLA metrics.",
)
async def get_housekeeping_board_endpoint(
    floor: Optional[int] = Query(None, description="Optional filter by hotel room floor (e.g. 1, 2, 3, 4, 5)"),
) -> Dict[str, Any]:
    """Retrieve housekeeping board data structured for the operations interface."""
    return repository.get_housekeeping_board(floor=floor)


@router.post(
    "/events/housekeeping-request",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Report Guest Housekeeping Request",
    description="Receive guest request for room items and route to Housekeeping Agent. Any authenticated user may call it.",
    responses={
        202: {"description": "Guest request received and routed successfully."},
        400: {"description": "Bad Request - Invalid room or request details."},
        409: {"description": "Conflict - Room status does not allow guest requests."},
    },
)
async def process_guest_housekeeping_request(
    request: HousekeepingRequest,
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Handle guest item request and delegate to orchestrator agent."""
    try:
        orchestration_result = orchestrator.process_housekeeping_request(request)
        housekeeping_result = (
            getattr(orchestration_result, "housekeeping", None)
            or getattr(orchestrator, "last_housekeeping_result", None)
        )
    except HTTPException:
        raise
    except ValueError as e:
        err_msg = str(e)
        if (
            "out_of_order" in err_msg.lower()
            or "does not allow" in err_msg
            or getattr(e, "status_code", None) == 409
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=err_msg,
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=err_msg,
        )

    guest_ops_result = getattr(orchestration_result, "guest_operations", None)
    res_status = getattr(orchestration_result, "status", "ROUTED")

    response_payload = {
        "message": "Guest request received and routed",
        "processing_status": res_status,
        "orchestration": orchestration_result,
        "housekeeping": housekeeping_result,
    }
    if guest_ops_result is not None:
        response_payload["guest_operations"] = guest_ops_result

    return response_payload


@router.post(
    "/events/early-checkin",
    response_model=EarlyCheckInResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate Guest Early Check-In Request",
    description="Receive guest early check-in inquiry, evaluate against hotel policy, room status, turnaround, and maintenance blockers.",
    responses={
        200: {"description": "Early check-in request evaluated successfully with decision contract."},
        400: {"description": "Bad Request - Invalid payload."},
    },
)
async def process_guest_early_checkin_request(
    request: EarlyCheckInRequest,
    current_user: dict = Depends(get_current_user),
) -> EarlyCheckInResponse:
    """Handle guest early check-in inquiry and delegate to orchestrator agent."""
    decision_result = orchestrator.process_early_checkin_request(request)
    return EarlyCheckInResponse(**decision_result)


