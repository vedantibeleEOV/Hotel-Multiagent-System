import json
import logging
import re
import urllib.error
import urllib.request
from datetime import datetime, time, timedelta, timezone
from typing import Any, Optional, Tuple, Union
from zoneinfo import ZoneInfo

from app.repositories.guest_ops_repository import GuestOpsRepository
from app.services.prompts.guest_ops_prompts import GUEST_ITEM_EXTRACTION_PROMPT

logger = logging.getLogger(__name__)

KOLKATA_TZ = ZoneInfo("Asia/Kolkata")

WORDS_TO_NUM = {
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
    "couple": 2,
    "few": 3,
    "a": 1,
    "an": 1,
}

# Priority patterns: longer / more specific phrases checked first
ITEM_PATTERNS = [
    (r"\b(bath\s+towels?)\b", "bath towels"),
    (r"\b(dental\s+kits?|toothbrushes?|toothpastes?)\b", "dental kit"),
    (r"\b(ice\s+buckets?)\b", "ice bucket"),
    (r"\b(water\s+bottles?)\b", "water bottle"),
    (r"\b(bath\s*robes?|robes?)\b", "bathrobes"),
    (r"\b(towels?|fresh\s+towels?)\b", "towels"),
    (r"\b(pillows?)\b", "pillows"),
    (r"\b(shampoos?|body\s*wash|soaps?)\b", "shampoo"),
    (r"\b(blankets?)\b", "blanket"),
    (r"\b(slippers?)\b", "slippers"),
]

ITEM_ALIASES = {
    "towel": "towels",
    "fresh towel": "towels",
    "fresh towels": "towels",
    "bath towel": "bath towels",
    "pillow": "pillows",
    "bathrobe": "bathrobes",
    "robe": "bathrobes",
    "robes": "bathrobes",
    "dental kits": "dental kit",
    "toothbrush": "dental kit",
    "toothbrushes": "dental kit",
    "toothpaste": "dental kit",
    "ice": "ice bucket",
    "ice buckets": "ice bucket",
    "water": "water bottle",
    "water bottles": "water bottle",
    "blankets": "blanket",
    "slipper": "slippers",
}


def extract_item_and_quantity_regex(message: str) -> Tuple[Optional[str], Optional[int]]:
    """Fast, deterministic regex parser for common hotel amenities and quantities."""
    if not message or not message.strip():
        return None, None

    msg_lower = message.lower().strip()

    # 1. Match item
    matched_item = None
    item_span = None
    for pattern, canonical in ITEM_PATTERNS:
        m = re.search(pattern, msg_lower)
        if m:
            matched_item = canonical
            item_span = m.span()
            break

    if not matched_item:
        return None, None

    # 2. Match quantity preceding the item
    preceding_text = msg_lower[: item_span[0]]
    num_match = re.findall(r"\b(\d+)\b", preceding_text)
    if num_match:
        return matched_item, int(num_match[-1])

    word_match = re.findall(
        r"\b(one|two|three|four|five|six|seven|eight|nine|ten|couple|few)\b",
        preceding_text,
    )
    if word_match:
        return matched_item, WORDS_TO_NUM.get(word_match[-1], 1)

    # 3. Check for any reasonable number in the message
    all_nums = re.findall(r"\b(\d+)\b", msg_lower)
    if all_nums:
        for n_str in reversed(all_nums):
            n_val = int(n_str)
            if n_val <= 50:
                return matched_item, n_val
        return matched_item, int(all_nums[-1])

    all_words = re.findall(
        r"\b(one|two|three|four|five|six|seven|eight|nine|ten|couple|few)\b",
        msg_lower,
    )
    if all_words:
        return matched_item, WORDS_TO_NUM.get(all_words[0], 1)

    # Default quantity is 1
    return matched_item, 1


def extract_requested_time_regex(message: str) -> Optional[str]:
    """Parse requested check-in time from text using regex rules.
    Rules:
    - 'noon' = 12:00
    - '12' = 12:00
    - numbers 1 to 6 without am/pm mean PM (e.g. 1 -> 13:00)
    - 7 to 11 without am/pm mean AM (e.g. 8 -> 08:00)
    - explicit am/pm honored
    """
    if not message or not str(message).strip():
        return None
    msg = str(message).strip().lower()

    # Rule: 'noon' = 12:00
    if re.search(r"\bnoon\b", msg):
        return "12:00"

    pattern = r"(?:\bat\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b"
    matches = list(re.finditer(pattern, msg))
    for m in matches:
        hour_str, min_str, meridiem = m.groups()
        start_idx = m.start()
        prefix = msg[:start_idx].strip()
        if prefix.endswith("room"):
            continue

        hour = int(hour_str)
        minute = int(min_str) if min_str is not None else 0

        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            continue

        if meridiem:
            meridiem = meridiem.lower()
            if meridiem == "pm":
                if hour < 12:
                    hour += 12
            elif meridiem == "am":
                if hour == 12:
                    hour = 0
        else:
            if hour == 12:
                hour = 12
            elif 1 <= hour <= 6:
                hour += 12
            elif 7 <= hour <= 11:
                pass

        return f"{hour:02d}:{minute:02d}"

    return None


class GuestOperationsAgent:
    """Agent responsible for triage, policy checks, inventory availability,
    and approval decisions for guest item requests and early check-ins."""

    default_clock: Optional[Any] = None

    def __init__(
        self,
        guest_ops_repo: Optional[GuestOpsRepository] = None,
        repository: Optional[Any] = None,
        ollama_url: str = "http://localhost:11434/api/generate",
        model_name: str = "llama3.2:latest",
        timeout: float = 3.0,
        clock: Optional[Any] = None,
    ):
        self.guest_ops_repo = guest_ops_repo or GuestOpsRepository()
        self.repository = repository
        self.ollama_url = ollama_url
        self.model_name = model_name
        self.timeout = timeout
        self.clock = clock
        self.activity_logs: list[dict] = []

    def _get_now(self, clock: Optional[Any] = None) -> datetime:
        """Resolve current time from injected clock, default_clock, or Asia/Kolkata now."""
        clk = clock if clock is not None else (self.clock if self.clock is not None else self.default_clock)
        if clk is not None:
            if isinstance(clk, datetime):
                val = clk
            elif callable(clk):
                val = clk()
            elif hasattr(clk, "now") and callable(clk.now):
                val = clk.now()
            else:
                val = clk
            if isinstance(val, datetime):
                if val.tzinfo is None:
                    return val.replace(tzinfo=KOLKATA_TZ)
                return val
        return datetime.now(KOLKATA_TZ)

    def _call_llm_extract(self, message: str) -> Tuple[Optional[str], int]:
        """Fallback LLM call to extract item and quantity when regex yields no result."""
        prompt = GUEST_ITEM_EXTRACTION_PROMPT.format(message=message)
        payload = {
            "model": self.model_name,
            "prompt": prompt,
            "stream": False,
            "keep_alive": "30m",
            "format": "json",
            "options": {"temperature": 0, "num_predict": 50},
        }
        try:
            req = urllib.request.Request(
                self.ollama_url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                response_text = data.get("response", "").strip()
                parsed = json.loads(response_text)
                item = parsed.get("item")
                qty = parsed.get("quantity", 1)
                if item:
                    item_str = str(item).lower().strip()
                    item = ITEM_ALIASES.get(item_str, item_str)
                if not isinstance(qty, int) or qty <= 0:
                    qty = 1
                return item, qty
        except urllib.error.URLError as e:
            logger.info("Ollama service unavailable or timed out during item extraction: %s", e)
            return None, 1
        except json.JSONDecodeError as e:
            logger.warning("Failed to decode LLM extraction JSON output: %s", e)
            return None, 1
        except Exception as e:
            logger.warning("Unexpected error during LLM extraction fallback: %s", e)
            return None, 1

    def _call_llm_extract_time(self, message: str) -> Optional[str]:
        """Fallback LLM call to extract requested check-in time when regex fails."""
        if not message or not str(message).strip():
            return None
        prompt = (
            f"You are a hotel front desk assistant. The guest sent the following message:\n"
            f'"{message}"\n\n'
            f"Extract the requested check-in time in 24-hour HH:MM format.\n"
            f'Return ONLY a JSON object: {{"requested_time": "HH:MM"}}\n'
            f'If no specific time of day or hour is mentioned in the message, return {{"requested_time": null}}.\n'
            f'Do NOT guess or default to 00:00 if no time is mentioned.'
        )
        payload = {
            "model": self.model_name,
            "prompt": prompt,
            "stream": False,
            "keep_alive": "30m",
            "format": "json",
            "options": {"temperature": 0, "num_predict": 50},
        }
        try:
            req = urllib.request.Request(
                self.ollama_url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                response_text = data.get("response", "").strip()
                parsed = json.loads(response_text)
                req_t = parsed.get("requested_time")
                if req_t and isinstance(req_t, str):
                    req_t = req_t.strip()
                    if req_t in ("null", "None", ""):
                        return None
                    # Prevent LLM halluncination/defaulting to 00:00 when no midnight or 12am was requested
                    if req_t == "00:00" and not re.search(r"\b(midnight|12\s*am|00:00|zero)\b", message.lower()):
                        return None
                    if re.match(r"^\d{1,2}:\d{2}$", req_t):
                        parts = req_t.split(":")
                        return f"{int(parts[0]):02d}:{int(parts[1]):02d}"
                return None
        except urllib.error.URLError as e:
            logger.info("Ollama service unavailable or timed out during time extraction: %s", e)
            return None
        except json.JSONDecodeError as e:
            logger.warning("Failed to decode LLM time extraction JSON output: %s", e)
            return None
        except Exception as e:
            logger.warning("Unexpected error during LLM time extraction fallback: %s", e)
            return None

    def _log_activity(self, action: str, message: str, result: dict) -> None:
        log_entry = {
            "agent": "GUEST_OPERATIONS_AGENT",
            "action": f"EVALUATE_{action}",
            "message": message,
            "decision": result.get("decision"),
            "reason": result.get("reason"),
            "status": "COMPLETED",
        }
        if "item" in result:
            log_entry["item"] = result.get("item")
        if "quantity" in result:
            log_entry["quantity"] = result.get("quantity")
        if "room_number" in result:
            log_entry["room_number"] = result.get("room_number")
        if "requested_time" in result:
            log_entry["requested_time"] = result.get("requested_time")
        if "ready_by" in result:
            log_entry["ready_by"] = result.get("ready_by")
        self.activity_logs.append(log_entry)

    def process_request(self, message: str) -> dict:
        """Process an incoming guest request message:
        1. Extract item & quantity via regex first, falling back to LLM.
        2. Check Item Policy free limit (ESCALATE if exceeded).
        3. Check Inventory stock (REJECT if insufficient).
        4. Atomically decrement inventory if approved (APPROVE).
        """
        try:
            # Step a: Fast reliable regex parsing
            item, quantity = extract_item_and_quantity_regex(message)

            # Step b: LLM extraction fallback if regex did not identify a known item
            if not item:
                item, quantity = self._call_llm_extract(message)

            if not quantity or quantity <= 0:
                quantity = 1

            # If no specific physical inventory item requested (e.g. general housekeeping/statement)
            if not item:
                decision_result = {
                    "decision": "APPROVE",
                    "item": None,
                    "quantity": 0,
                    "free_limit": None,
                    "available_stock": None,
                    "reason": "General guest request; no inventory-tracked items required.",
                    "guest_message": "Our housekeeping team has been informed and will attend to your request shortly.",
                }
                self._log_activity("APPROVE", message, decision_result)
                return decision_result

            # Canonical alias check
            item = ITEM_ALIASES.get(item, item)

            # Step c: Check item policy
            policy = self.guest_ops_repo.get_item_policy(item)
            if policy and quantity > policy.free_limit:
                avail = self.guest_ops_repo.get_inventory_stock(item)
                decision_result = {
                    "decision": "ESCALATE",
                    "item": item,
                    "quantity": quantity,
                    "free_limit": policy.free_limit,
                    "available_stock": avail,
                    "reason": (
                        f"Requested quantity ({quantity}) exceeds free limit ({policy.free_limit}) "
                        f"for {item}. Escalated for manager approval or billing."
                    ),
                    "guest_message": (
                        f"Your request for {quantity} {item} is more than we can provide as a complimentary item, "
                        f"so I have passed it to our front desk. They will contact you shortly."
                    ),
                }
                self._log_activity("ESCALATE", message, decision_result)
                return decision_result

            # Step d: Check inventory stock
            current_stock = self.guest_ops_repo.get_inventory_stock(item)
            if current_stock is not None and current_stock < quantity:
                decision_result = {
                    "decision": "REJECT",
                    "item": item,
                    "quantity": quantity,
                    "free_limit": policy.free_limit if policy else None,
                    "available_stock": current_stock,
                    "reason": (
                        f"Insufficient stock for {item} (requested: {quantity}, "
                        f"available: {current_stock})."
                    ),
                    "guest_message": f"Sorry, {item} is not available right now. Our front desk will help you with an alternative.",
                }
                self._log_activity("REJECT", message, decision_result)
                return decision_result

            # Step e: If approved, atomically decrement stock
            if current_stock is not None:
                decremented = self.guest_ops_repo.decrement_inventory_stock(item, quantity)
                if not decremented:
                    stock_left = self.guest_ops_repo.get_inventory_stock(item)
                    decision_result = {
                        "decision": "REJECT",
                        "item": item,
                        "quantity": quantity,
                        "free_limit": policy.free_limit if policy else None,
                        "available_stock": stock_left,
                        "reason": f"Inventory reservation failed for {item} due to insufficient stock.",
                        "guest_message": f"Sorry, {item} is not available right now. Our front desk will help you with an alternative.",
                    }
                    self._log_activity("REJECT", message, decision_result)
                    return decision_result

            remaining_stock = self.guest_ops_repo.get_inventory_stock(item)
            decision_result = {
                "decision": "APPROVE",
                "item": item,
                "quantity": quantity,
                "free_limit": policy.free_limit if policy else None,
                "available_stock": remaining_stock,
                "reason": f"Request for {quantity}x {item} approved and inventory reserved.",
                "guest_message": f"Your request for {quantity} {item} has been approved. Our housekeeping team is on the way.",
            }
            self._log_activity("APPROVE", message, decision_result)
            return decision_result

        except Exception as e:
            logger.error(
                "Unexpected failure in GuestOperationsAgent.process_request for message '%s': %s",
                message,
                e,
                exc_info=True,
            )
            fallback_result = {
                "decision": "APPROVE",
                "item": None,
                "quantity": 1,
                "free_limit": None,
                "available_stock": None,
                "reason": "Request processed with safety fallback due to unexpected operations service error.",
                "guest_message": "Our housekeeping team has been informed and will attend to your request shortly.",
            }
            self._log_activity("FALLBACK_APPROVE", message, fallback_result)
            return fallback_result

    def process_early_checkin_request(
        self,
        room_number: Optional[Union[str, int]] = None,
        guest_id: Optional[int] = None,
        room_id: Optional[int] = None,
        message: Optional[str] = None,
        requested_time: Optional[str] = None,
        clock: Optional[Any] = None,
    ) -> dict:
        """Process an early check-in request:
        1. Parse requested time via regex first, falling back to LLM once.
        2. If time cannot be parsed, ESCALATE with 'could not understand the requested time'.
        3. Check reservation exists today for guest/room (REJECT if not found).
        4. Resolve current time 'now' from injected clock, default_clock, or Asia/Kolkata now.
        5. Evaluate time condition:
           a) Past standard check-in time (14:00): treat as normal check-in, APPROVE if READY with no blockers, else ESCALATE. Earliest cutoff does not apply.
           b) Requested time already passed today: evaluate as of now. APPROVE if ready now, else ESCALATE.
           c) Future request: apply earliest cutoff (12:00), evaluate room readiness, VIP rule.
        6. Reasons must indicate case: 'requested time already passed', 'past standard check-in time', or 'future request'.
        7. On APPROVE, set reservations.early_check_in_requested = True and raise open cleaning task priority to HIGH if method exists.
        8. Log decision via _log_activity.
        """
        raw_msg = message or str(requested_time or "")
        try:
            # Handle positional parameter flexibility where guest_id may be passed as first arg
            if isinstance(room_number, int):
                if guest_id is None:
                    guest_id = room_number
                    room_number = None

            # Handle case where requested_time passed in message slot or vice versa
            raw_time_input = requested_time if requested_time else message
            parsed_time = extract_requested_time_regex(raw_time_input)
            if not parsed_time and message and message != raw_time_input:
                parsed_time = extract_requested_time_regex(message)

            if not parsed_time:
                parsed_time = self._call_llm_extract_time(raw_time_input or message or "")

            if not parsed_time:
                result = {
                    "decision": "ESCALATE",
                    "reason": "could not understand the requested time",
                    "guest_message": "I've passed your early check-in request to our front desk. They will contact you shortly.",
                    "requested_time": None,
                    "ready_by": None,
                    "room_number": str(room_number) if room_number else None,
                }
                self._log_activity("ESCALATE", raw_msg, result)
                return result

            # Obtain repository
            repo = self.repository
            if repo is None:
                from app.repositories.postgres_hotel_repository import PostgresHotelRepository
                repo = PostgresHotelRepository()

            now = self._get_now(clock=clock)

            # Find reservation today for guest_id, room_number, or room_id
            reservation = repo.get_reservation_for_guest_room(
                guest_id=guest_id,
                room_number=str(room_number) if room_number is not None else None,
                room_id=room_id,
                date=now,
            )
            if not reservation:
                result = {
                    "decision": "REJECT",
                    "reason": "No reservation found for this guest/room today.",
                    "guest_message": "I couldn't find a reservation for your room. Please contact the front desk (Dial 0).",
                    "requested_time": parsed_time,
                    "ready_by": None,
                    "room_number": str(room_number) if room_number else None,
                }
                self._log_activity("REJECT", raw_msg, result)
                return result

            reservation_id = reservation["id"]
            res_guest_id = reservation.get("guest_id") or guest_id
            target_room_id = reservation["room_id"]
            room_num_str = reservation.get("room_number") or str(room_number or "")
            if not room_num_str and hasattr(repo, "get_room_by_id"):
                r_obj = repo.get_room_by_id(target_room_id)
                if r_obj and hasattr(r_obj, "room_number") and r_obj.room_number:
                    room_num_str = r_obj.room_number
            if not room_num_str:
                room_num_str = str(target_room_id)

            # Policy checks
            policy = repo.get_hotel_policy() if hasattr(repo, "get_hotel_policy") else None
            standard_str = getattr(policy, "standard_check_in_time", "14:00") or "14:00"
            earliest_str = getattr(policy, "earliest_early_check_in", "12:00") or "12:00"

            std_h, std_m = map(int, standard_str.split(":"))
            std_time_obj = time(std_h, std_m)
            std_dt = datetime.combine(now.date(), std_time_obj, tzinfo=now.tzinfo)

            earl_h, earl_m = map(int, earliest_str.split(":"))
            earl_time_obj = time(earl_h, earl_m)
            earl_dt = datetime.combine(now.date(), earl_time_obj, tzinfo=now.tzinfo)

            req_h, req_m = map(int, parsed_time.split(":"))
            req_time_obj = time(req_h, req_m)
            req_dt = datetime.combine(now.date(), req_time_obj, tzinfo=now.tzinfo)

            # CASE B: Now is already past standard_check_in_time (14:00) -> normal check-in
            if now >= std_dt:
                as_of_dt = datetime.combine(now.date(), now.time(), tzinfo=timezone.utc)
                eval_result = evaluate_room_readiness(
                    room_id=target_room_id,
                    requested_time=as_of_dt,
                    repository=repo,
                    exclude_reservation_id=reservation_id,
                )
                blockers = eval_result.get("blockers", [])
                ready_by_dt = eval_result.get("ready_by")
                ready_by_str = ready_by_dt.strftime("%H:%M") if ready_by_dt else None
                eval_reason = eval_result.get("reason", "")

                room_status = repo.get_room_status(target_room_id)
                room_status_str = str(room_status).upper() if room_status else ""

                if room_status_str == "READY" and not blockers:
                    repo.set_reservation_early_checkin(reservation_id)
                    result = {
                        "decision": "APPROVE",
                        "reason": f"Room {room_num_str} is ready for check-in (past standard check-in time).",
                        "guest_message": f"Your room {room_num_str} is ready for check-in now.",
                        "requested_time": parsed_time,
                        "ready_by": ready_by_str or parsed_time,
                        "room_number": room_num_str,
                    }
                    self._log_activity("APPROVE", raw_msg, result)
                    return result
                else:
                    result = {
                        "decision": "ESCALATE",
                        "reason": f"{eval_reason or f'Room {room_num_str} is not ready (status: {room_status_str})'} (past standard check-in time).",
                        "guest_message": "I've passed your early check-in request to our front desk. They will contact you shortly.",
                        "requested_time": parsed_time,
                        "ready_by": ready_by_str,
                        "room_number": room_num_str,
                    }
                    self._log_activity("ESCALATE", raw_msg, result)
                    return result

            # CASE A: Requested time has already passed today
            elif req_dt <= now:
                if req_time_obj < earl_time_obj and now < earl_dt:
                    result = {
                        "decision": "ESCALATE",
                        "reason": f"Requested check-in time {parsed_time} is earlier than earliest early check-in allowed ({earliest_str}) (requested time already passed).",
                        "guest_message": "I've passed your early check-in request to our front desk. They will contact you shortly.",
                        "requested_time": parsed_time,
                        "ready_by": None,
                        "room_number": room_num_str,
                    }
                    self._log_activity("ESCALATE", raw_msg, result)
                    return result

                as_of_dt = datetime.combine(now.date(), now.time(), tzinfo=timezone.utc)
                eval_result = evaluate_room_readiness(
                    room_id=target_room_id,
                    requested_time=as_of_dt,
                    repository=repo,
                    exclude_reservation_id=reservation_id,
                )
                blockers = eval_result.get("blockers", [])
                ready_by_dt = eval_result.get("ready_by")
                ready_by_str = ready_by_dt.strftime("%H:%M") if ready_by_dt else None
                eval_reason = eval_result.get("reason", "")

                room_status = repo.get_room_status(target_room_id)
                room_status_str = str(room_status).upper() if room_status else ""

                # Room is ready now if (READY, or cleaning done, no blockers, no occupant conflict)
                cleaning_done = False
                if room_status_str in ("DIRTY", "CLEANING"):
                    cleaning_info = repo.get_cleaning_eta(target_room_id)
                    if cleaning_info and cleaning_info.get("estimated_finish_time"):
                        finish_time = cleaning_info["estimated_finish_time"]
                        if finish_time.tzinfo is None:
                            finish_time = finish_time.replace(tzinfo=timezone.utc)
                        if finish_time <= as_of_dt:
                            cleaning_done = True

                is_ready_now = (room_status_str == "READY" or cleaning_done) and (not blockers)

                if is_ready_now:
                    repo.set_reservation_early_checkin(reservation_id)
                    if hasattr(repo, "change_task_priority"):
                        cleaning_info = repo.get_cleaning_eta(target_room_id)
                        if cleaning_info and cleaning_info.get("task_id"):
                            try:
                                from uuid import UUID
                                task_uuid = UUID(str(cleaning_info["task_id"]))
                                repo.change_task_priority(task_uuid, "HIGH")
                            except Exception as ex:
                                logger.warning("Could not raise cleaning task priority: %s", ex)

                    result = {
                        "decision": "APPROVE",
                        "reason": f"Room {room_num_str} is ready for check-in now (requested time already passed).",
                        "guest_message": f"Your room {room_num_str} is ready for check-in now.",
                        "requested_time": parsed_time,
                        "ready_by": ready_by_str or parsed_time,
                        "room_number": room_num_str,
                    }
                    self._log_activity("APPROVE", raw_msg, result)
                    return result
                else:
                    result = {
                        "decision": "ESCALATE",
                        "reason": f"{eval_reason or f'Room {room_num_str} is not ready'} (requested time already passed).",
                        "guest_message": "I've passed your early check-in request to our front desk. They will contact you shortly.",
                        "requested_time": parsed_time,
                        "ready_by": ready_by_str,
                        "room_number": room_num_str,
                    }
                    self._log_activity("ESCALATE", raw_msg, result)
                    return result

            # CASE C: Requested time is still in the future
            else:
                # Policy check: earliest_early_check_in (12:00 cutoff)
                if req_time_obj < earl_time_obj:
                    result = {
                        "decision": "ESCALATE",
                        "reason": f"Requested check-in time {parsed_time} is earlier than earliest early check-in allowed ({earliest_str}) (future request).",
                        "guest_message": "I've passed your early check-in request to our front desk. They will contact you shortly.",
                        "requested_time": parsed_time,
                        "ready_by": None,
                        "room_number": room_num_str,
                    }
                    self._log_activity("ESCALATE", raw_msg, result)
                    return result

                # Evaluate room readiness (excluding the guest's own reservation)
                eval_dt = datetime.combine(now.date(), req_time_obj, tzinfo=timezone.utc)
                eval_result = evaluate_room_readiness(
                    room_id=target_room_id,
                    requested_time=eval_dt,
                    repository=repo,
                    exclude_reservation_id=reservation_id,
                )

                blockers = eval_result.get("blockers", [])
                ready_by_dt = eval_result.get("ready_by")
                ready_by_str = ready_by_dt.strftime("%H:%M") if ready_by_dt else None
                eval_reason = eval_result.get("reason", "")

                # VIP guest check
                is_vip = False
                if policy and getattr(policy, "vip_priority", True):
                    if res_guest_id and hasattr(repo, "is_vip_guest"):
                        is_vip = repo.is_vip_guest(res_guest_id)

                room_status = repo.get_room_status(target_room_id)
                room_status_str = str(room_status).upper() if room_status else ""

                # VIP Rule: when room is DIRTY or CLEANING and ready_by is up to 30 min after requested time,
                # still ESCALATE but add 'VIP guest' in the reason so front desk sees it
                if (
                    is_vip
                    and room_status_str in ("DIRTY", "CLEANING")
                    and ready_by_dt is not None
                    and eval_dt < ready_by_dt <= eval_dt + timedelta(minutes=30)
                ):
                    result = {
                        "decision": "ESCALATE",
                        "reason": (
                            f"VIP guest: Room {room_num_str} is {room_status_str} "
                            f"(ready by {ready_by_str}, within 30 minutes of requested check-in {parsed_time}). "
                            f"Escalated to front desk for priority expediting (future request)."
                        ),
                        "guest_message": "I've passed your early check-in request to our front desk. They will contact you shortly.",
                        "requested_time": parsed_time,
                        "ready_by": ready_by_str,
                        "room_number": room_num_str,
                    }
                    self._log_activity("ESCALATE", raw_msg, result)
                    return result

                # Blocker or delayed readiness check
                if blockers or ready_by_dt is None or ready_by_dt > eval_dt:
                    result = {
                        "decision": "ESCALATE",
                        "reason": f"{eval_reason or f'Room {room_num_str} will not be ready by {parsed_time}.'} (future request)",
                        "guest_message": "I've passed your early check-in request to our front desk. They will contact you shortly.",
                        "requested_time": parsed_time,
                        "ready_by": ready_by_str,
                        "room_number": room_num_str,
                    }
                    self._log_activity("ESCALATE", raw_msg, result)
                    return result

                # APPROVE: Room is READY or cleaning finishes on/before requested time
                repo.set_reservation_early_checkin(reservation_id)

                if hasattr(repo, "change_task_priority"):
                    cleaning_info = repo.get_cleaning_eta(target_room_id)
                    if cleaning_info and cleaning_info.get("task_id"):
                        try:
                            from uuid import UUID
                            task_uuid = UUID(str(cleaning_info["task_id"]))
                            repo.change_task_priority(task_uuid, "HIGH")
                        except Exception as ex:
                            logger.warning("Could not raise cleaning task priority: %s", ex)

                result = {
                    "decision": "APPROVE",
                    "reason": f"Room {room_num_str} is ready for check-in by {ready_by_str or parsed_time} (future request).",
                    "guest_message": f"Your room {room_num_str} will be ready for check-in at {parsed_time}. We'll have everything prepared for you.",
                    "requested_time": parsed_time,
                    "ready_by": ready_by_str or parsed_time,
                    "room_number": room_num_str,
                }
                self._log_activity("APPROVE", raw_msg, result)
                return result

        except Exception as e:
            logger.error("Unexpected error in process_early_checkin_request: %s", e, exc_info=True)
            fallback_result = {
                "decision": "ESCALATE",
                "reason": f"Unexpected error during early check-in evaluation: {e}",
                "guest_message": "I've passed your early check-in request to our front desk. They will contact you shortly.",
                "requested_time": locals().get("parsed_time"),
                "ready_by": None,
                "room_number": str(room_number) if room_number else None,
            }
            self._log_activity("FALLBACK_ESCALATE", raw_msg, fallback_result)
            return fallback_result


def evaluate_room_readiness(
    room_id: int,
    requested_time: Union[datetime, str],
    repository: Optional[Any] = None,
    exclude_reservation_id: Optional[int] = None,
) -> dict:
    """Evaluate room readiness for a requested check-in time using repository helper methods.

    Returns a deterministic dictionary:
    {
        "ready_by": datetime or None,
        "blockers": list[str],
        "reason": str,
    }
    """
    now_utc = datetime.now(timezone.utc)

    # Normalize requested_time to timezone-aware datetime
    if isinstance(requested_time, str):
        cleaned_time = requested_time.strip()
        if len(cleaned_time) <= 5 and ":" in cleaned_time:
            # Format "HH:MM"
            t_hour, t_min = map(int, cleaned_time.split(":"))
            req_dt = datetime.combine(now_utc.date(), time(t_hour, t_min), tzinfo=timezone.utc)
        else:
            req_dt = datetime.fromisoformat(cleaned_time)
            if req_dt.tzinfo is None:
                req_dt = req_dt.replace(tzinfo=timezone.utc)
    elif isinstance(requested_time, datetime):
        req_dt = requested_time if requested_time.tzinfo is not None else requested_time.replace(tzinfo=timezone.utc)
    else:
        req_dt = now_utc

    if repository is None:
        from app.repositories.postgres_hotel_repository import PostgresHotelRepository
        repo = PostgresHotelRepository()
    else:
        repo = repository

    blockers: list[str] = []
    ready_by: Optional[datetime] = None

    # Fetch room entity to display real room number (e.g. '405', '201')
    room_obj = repo.get_room_by_id(room_id) if hasattr(repo, "get_room_by_id") else None
    room_display = (
        room_obj.room_number
        if (room_obj and hasattr(room_obj, "room_number") and room_obj.room_number)
        else str(room_id)
    )

    # 1. Check room existence & status
    room_status = repo.get_room_status(room_id)
    if room_status is None:
        return {
            "ready_by": None,
            "blockers": [f"Room {room_display} not found."],
            "reason": f"Room {room_display} does not exist.",
        }
    room_status_str = str(room_status).upper()

    # 2. Check hotel policy (earliest allowed early check-in)
    policy = repo.get_hotel_policy() if hasattr(repo, "get_hotel_policy") else None
    if policy:
        earliest_str = getattr(policy, "earliest_early_check_in", "12:00")
        try:
            e_hour, e_minute = map(int, earliest_str.split(":"))
            earliest_cutoff = req_dt.replace(hour=e_hour, minute=e_minute, second=0, microsecond=0)
            if req_dt < earliest_cutoff:
                blockers.append(
                    f"Requested check-in time ({req_dt.strftime('%H:%M')}) is before earliest early check-in policy ({earliest_str})."
                )
        except Exception:
            pass

    # 3. Check maintenance blockers (hard blocker)
    maint_blockers = repo.get_maintenance_blockers(room_id)
    has_maint_blocker = False
    if maint_blockers:
        has_maint_blocker = True
        for mb in maint_blockers:
            cat = mb.get("category", "MAINTENANCE")
            desc = mb.get("description", "Active maintenance issue")
            blockers.append(f"Maintenance blocker: {cat} - {desc}")

    # 4. Check current occupant checkout (hard blocker if occupying after requested time)
    occupant = repo.get_current_occupant_reservation(room_id, exclude_reservation_id=exclude_reservation_id)
    has_occupant_conflict = False
    if occupant:
        occupant_co = occupant.get("check_out_time")
        if occupant_co:
            if occupant_co.tzinfo is None:
                occupant_co = occupant_co.replace(tzinfo=timezone.utc)
            if occupant_co > req_dt:
                has_occupant_conflict = True
                blockers.append(
                    f"Room currently occupied; expected checkout is {occupant_co.strftime('%Y-%m-%d %H:%M')}, after requested time {req_dt.strftime('%Y-%m-%d %H:%M')}."
                )

    # 5. Check room cleaning status and turnaround ETA
    if room_status_str == "READY":
        if not blockers:
            ready_by = req_dt
    elif room_status_str in ("DIRTY", "CLEANING"):
        cleaning_info = repo.get_cleaning_eta(room_id)
        if cleaning_info and cleaning_info.get("estimated_finish_time"):
            finish_time = cleaning_info["estimated_finish_time"]
            if finish_time.tzinfo is None:
                finish_time = finish_time.replace(tzinfo=timezone.utc)
            ready_by = finish_time
            if finish_time > req_dt:
                blockers.append(
                    f"Cleaning in progress; estimated completion is {finish_time.strftime('%H:%M')}, after requested time {req_dt.strftime('%H:%M')}."
                )
        else:
            # DIRTY room without active task: estimate turnaround using standard duration
            r_type = (room_obj.room_type if room_obj else "STANDARD") or "STANDARD"
            from app.repositories.postgres_hotel_repository import (
                DEFAULT_CLEANING_MINUTES_BY_ROOM_TYPE,
                DEFAULT_CLEANING_MINUTES_FALLBACK,
            )
            duration = DEFAULT_CLEANING_MINUTES_BY_ROOM_TYPE.get(
                r_type.upper(), DEFAULT_CLEANING_MINUTES_FALLBACK
            )
            estimated_finish = now_utc + timedelta(minutes=duration)
            ready_by = estimated_finish
            if estimated_finish > req_dt:
                blockers.append(
                    f"Room is {room_status_str.lower()}; estimated turnaround time is {duration} minutes ({estimated_finish.strftime('%H:%M')}), after requested check-in {req_dt.strftime('%H:%M')}."
                )
    elif room_status_str == "OCCUPIED":
        if not any("occupied" in b.lower() for b in blockers):
            blockers.append("Room is currently occupied.")
    else:
        blockers.append(f"Room status '{room_status_str}' does not permit check-in.")

    # Maintenance, occupant conflict, or out-of-order nullifies ready_by
    if has_maint_blocker or has_occupant_conflict or room_status_str == "OUT_OF_ORDER":
        ready_by = None

    # 6. Build final response
    if blockers:
        reason = f"Room {room_display} not ready: " + "; ".join(blockers)
    else:
        if ready_by is None:
            ready_by = req_dt
        reason = f"Room {room_display} is ready for check-in by {ready_by.strftime('%H:%M')}."

    return {
        "ready_by": ready_by,
        "blockers": blockers,
        "reason": reason,
    }
