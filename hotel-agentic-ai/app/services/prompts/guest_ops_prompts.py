"""LLM prompts for guest operations requests."""

GUEST_ITEM_EXTRACTION_PROMPT = """You are a hotel operations triage assistant. Analyze the guest request message and extract the requested amenity/housekeeping item and quantity.

Return a valid JSON object strictly matching this schema:
{{
    "item": "<item_name_or_null>",
    "quantity": <integer_quantity>
}}

Guidelines:
1. "item": Identify the primary item requested (e.g. "towels", "pillows", "shampoo", "bathrobes", "dental kit", "ice bucket", "water bottle", "blanket", "slippers"). If no specific physical item is requested, return null.
2. "quantity": Positive integer. If not explicitly specified, assume 1.

Examples:
- "Please bring two extra pillows" -> {{"item": "pillows", "quantity": 2}}
- "Can we have some fresh towels?" -> {{"item": "towels", "quantity": 1}}
- "Send 10 bottles of water" -> {{"item": "water bottle", "quantity": 10}}
- "When is checkout time?" -> {{"item": null, "quantity": 0}}

Guest message: "{message}"
"""
