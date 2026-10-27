import logging
from typing import Any, Dict
from fastapi import APIRouter, Depends, status

from app.dependencies.auth import get_current_user
from app.repositories.postgres_hotel_repository import PostgresHotelRepository

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(get_current_user)])
repository = PostgresHotelRepository()


@router.get(
    "/ai-operations/summary",
    status_code=status.HTTP_200_OK,
    summary="Get AI Operations Summary",
    description="Retrieve live AI operations summary with agent cards, orchestration runs, and activity feed from PostgreSQL. Strictly read-only.",
)
async def get_ai_operations_summary_endpoint(
    current_user: dict = Depends(get_current_user),
) -> Dict[str, Any]:
    """Retrieve complete AI Operations summary metrics, agent cards, orchestration runs, and activity feed."""
    return repository.get_ai_operations_summary()
