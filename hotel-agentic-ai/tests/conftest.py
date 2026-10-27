import pytest
from app.database.seed import seed_db
from app.dependencies.auth import get_current_user
from app.main import app

# Manager user dictionary matching the exact keys returned by real get_current_user
MOCK_MANAGER_USER = {
    "id": 7,
    "username": "amit.shah",
    "role": "MANAGER",
    "staff_id": None,
    "name": "Amit Shah",
    "full_name": "Amit Shah",
    "is_active": True,
}


def override_get_current_user():
    return MOCK_MANAGER_USER


# Apply override globally at import time
app.dependency_overrides[get_current_user] = override_get_current_user


@pytest.fixture(autouse=True)
def authenticate_as_manager():
    """Authenticate all test requests as MANAGER."""
    app.dependency_overrides[get_current_user] = override_get_current_user
    yield
    app.dependency_overrides[get_current_user] = override_get_current_user


@pytest.fixture(autouse=True)
def clean_database_lifecycle():
    """Guarantee clean database state before and after every test."""
    seed_db()
    yield
    seed_db()
