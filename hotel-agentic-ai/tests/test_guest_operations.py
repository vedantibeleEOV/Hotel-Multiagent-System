import pytest
from fastapi.testclient import TestClient

from app.agents.guest_operations_agent import (
    GuestOperationsAgent,
    extract_item_and_quantity_regex,
)
from app.main import app
from app.repositories.guest_ops_repository import GuestOpsRepository

client = TestClient(app)


def test_regex_extraction_various_formats():
    """Verify regex item and quantity extraction across different message formats."""
    # Standard formats
    item, qty = extract_item_and_quantity_regex("Please deliver extra bath towels.")
    assert item == "bath towels"
    assert qty == 1

    item, qty = extract_item_and_quantity_regex("Two extra pillows and bathrobes.")
    assert item in ("bathrobes", "pillows")
    assert qty == 2

    item, qty = extract_item_and_quantity_regex("Need 10 towels urgently")
    assert item == "towels"
    assert qty == 10

    item, qty = extract_item_and_quantity_regex("Extra dental kit needed.")
    assert item == "dental kit"
    assert qty == 1

    item, qty = extract_item_and_quantity_regex("Could you bring three bottles of shampoo?")
    assert item == "shampoo"
    assert qty == 3

    item, qty = extract_item_and_quantity_regex("Need ice bucket urgently.")
    assert item == "ice bucket"
    assert qty == 1

    # Non-item message
    item, qty = extract_item_and_quantity_regex("Cancel test request.")
    assert item is None
    assert qty is None


def test_guest_ops_approve_and_decrement():
    """Verify APPROVE decision decrements inventory stock."""
    repo = GuestOpsRepository()
    agent = GuestOperationsAgent(guest_ops_repo=repo)

    initial_stock = repo.get_inventory_stock("towels")
    assert initial_stock is not None
    assert initial_stock >= 10

    res = agent.process_request("Please bring 2 extra towels")
    assert res["decision"] == "APPROVE"
    assert res["item"] == "towels"
    assert res["quantity"] == 2
    assert "guest_message" in res
    assert isinstance(res["guest_message"], str) and len(res["guest_message"]) > 0
    assert res["guest_message"] == "Your request for 2 towels has been approved. Our housekeeping team is on the way."

    new_stock = repo.get_inventory_stock("towels")
    assert new_stock == initial_stock - 2


def test_guest_ops_escalate_over_free_limit():
    """Verify ESCALATE decision when requested quantity exceeds policy free_limit."""
    repo = GuestOpsRepository()
    agent = GuestOperationsAgent(guest_ops_repo=repo)

    initial_stock = repo.get_inventory_stock("towels")

    # Free limit for towels is 5; request 10
    res = agent.process_request("Can I get 10 extra towels?")
    assert res["decision"] == "ESCALATE"
    assert res["quantity"] == 10
    assert "exceeds free limit" in res["reason"].lower()
    assert "guest_message" in res
    assert isinstance(res["guest_message"], str) and len(res["guest_message"]) > 0
    assert "manager" not in res["guest_message"].lower()
    assert "billing" not in res["guest_message"].lower()
    assert res["guest_message"] == (
        "Your request for 10 towels is more than we can provide as a complimentary item, "
        "so I have passed it to our front desk. They will contact you shortly."
    )

    # Stock must NOT be decremented on escalation
    stock_after = repo.get_inventory_stock("towels")
    assert stock_after == initial_stock


def test_guest_ops_reject_insufficient_stock():
    """Verify REJECT decision when inventory stock is less than requested quantity."""
    repo = GuestOpsRepository()
    agent = GuestOperationsAgent(guest_ops_repo=repo)

    # Artificially decrement stock until near 0 or request more than available
    current_stock = repo.get_inventory_stock("blanket")
    assert current_stock is not None

    # Request more than stock
    large_qty = current_stock + 50
    # Temporarily check with a high free limit or test directly
    # Even if policy limit is 5, let's verify on item with no policy or within policy
    # If policy exists, a quantity > 5 would escalate; but if stock is 0, test reject
    from sqlalchemy import update
    from app.database.orm.inventory_entity import InventoryEntity
    with repo.session_factory() as session:
        session.execute(
            update(InventoryEntity)
            .where(InventoryEntity.item_name == "ice bucket")
            .values(stock=0)
        )
        session.commit()

    res = agent.process_request("Please bring 1 ice bucket")
    assert res["decision"] == "REJECT"
    assert "insufficient" in res["reason"].lower()
    assert "guest_message" in res
    assert isinstance(res["guest_message"], str) and len(res["guest_message"]) > 0
    assert "manager" not in res["guest_message"].lower()
    assert "billing" not in res["guest_message"].lower()
    assert res["guest_message"] == "Sorry, ice bucket is not available right now. Our front desk will help you with an alternative."


def test_guest_ops_approve_non_item_and_fallback():
    """Verify APPROVE without recognised item or in fallback produces friendly guest_message."""
    agent = GuestOperationsAgent()
    res = agent.process_request("Can someone check on the room later?")
    assert res["decision"] == "APPROVE"
    assert "guest_message" in res
    assert isinstance(res["guest_message"], str) and len(res["guest_message"]) > 0
    assert res["guest_message"] == "Our housekeeping team has been informed and will attend to your request shortly."


def test_api_escalate_bypasses_housekeeping_task():
    """Verify API endpoint returns 202 with ESCALATE status and no task created."""
    response = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "We need 10 extra pillows for the room."},
    )
    assert response.status_code == 202
    data = response.json()

    assert data["processing_status"] == "ESCALATE"
    assert data["housekeeping"] is None
    assert "guest_operations" in data
    assert data["guest_operations"]["decision"] == "ESCALATE"
    assert data["guest_operations"]["quantity"] == 10
    assert "guest_message" in data["guest_operations"]
    assert isinstance(data["guest_operations"]["guest_message"], str) and len(data["guest_operations"]["guest_message"]) > 0
    assert "manager" not in data["guest_operations"]["guest_message"].lower()
    assert "billing" not in data["guest_operations"]["guest_message"].lower()
    assert (
        data["guest_operations"]["guest_message"]
        == "Your request for 10 pillows is more than we can provide as a complimentary item, so I have passed it to our front desk. They will contact you shortly."
    )
    assert "guest_message" in data["orchestration"]["guest_operations"]
    assert data["orchestration"]["guest_operations"]["guest_message"] == data["guest_operations"]["guest_message"]


def test_api_reject_bypasses_housekeeping_task():
    """Verify API endpoint returns 202 with REJECT status and no task created when out of stock."""
    repo = GuestOpsRepository()
    from sqlalchemy import update
    from app.database.orm.inventory_entity import InventoryEntity
    with repo.session_factory() as session:
        session.execute(
            update(InventoryEntity)
            .where(InventoryEntity.item_name == "bathrobes")
            .values(stock=0)
        )
        session.commit()

    response = client.post(
        "/api/events/housekeeping-request",
        json={"room_id": 1, "description": "Need 2 bathrobes please."},
    )
    assert response.status_code == 202
    data = response.json()

    assert data["processing_status"] == "REJECT"
    assert data["housekeeping"] is None
    assert "guest_operations" in data
    assert data["guest_operations"]["decision"] == "REJECT"
    assert "guest_message" in data["guest_operations"]
    assert isinstance(data["guest_operations"]["guest_message"], str) and len(data["guest_operations"]["guest_message"]) > 0
    assert "manager" not in data["guest_operations"]["guest_message"].lower()
    assert "billing" not in data["guest_operations"]["guest_message"].lower()
    assert (
        data["guest_operations"]["guest_message"]
        == "Sorry, bathrobes is not available right now. Our front desk will help you with an alternative."
    )
    assert "guest_message" in data["orchestration"]["guest_operations"]
    assert data["orchestration"]["guest_operations"]["guest_message"] == data["guest_operations"]["guest_message"]
