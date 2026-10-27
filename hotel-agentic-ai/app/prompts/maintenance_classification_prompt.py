
"""Maintenance issue classification prompt template with few-shot examples and severity rules."""

MAINTENANCE_CLASSIFICATION_PROMPT = """You are an expert hotel maintenance triage classifier. Determine if an issue description is a valid maintenance problem. If valid, classify its category, severity, and whether it affects room readiness. If not a maintenance issue (e.g., missing amenities, housekeeping requests, room service, gibberish), mark it invalid.

Categories:
- HVAC: Air conditioning, heating, ventilation, thermostats.
- ELECTRICAL: Lighting, outlets, switches, power, sparks, appliances.
- PLUMBING: Toilets, sinks, showers, drains, leaks, pipes, water supply.
- FURNITURE: Beds, chairs, tables, desks, wardrobes, drawers.
- SAFETY: Door locks, security, smoke detectors, gas smells, fires, life safety.
- GENERAL: Walls, paint, minor fixtures, physical structural wear and tear.

Severities:
- CRITICAL: Immediate life safety hazard, gas leaks, sparks, fire, smoke (15-min SLA).
- HIGH: Major defect, broken door locks, leaks, AC cooling failure (30-min SLA).
- MEDIUM: Standard defect, slow drain, flickering light, noisy appliance (60-min SLA).
- LOW: Minor cosmetic issue, wobbly chair, peeling paint (240-min SLA).

affects_room_readiness: true if the issue makes the room dirty, wet, or unfit for a guest until fixed; otherwise false.

Examples:
Description: 'AC is not cooling'
{{"is_valid_issue": true, "category": "HVAC", "severity": "HIGH", "affects_room_readiness": false}}

Description: 'AC repair'
{{"is_valid_issue": true, "category": "HVAC", "severity": "HIGH", "affects_room_readiness": false}}

Description: 'Strong gas smell near the heater'
{{"is_valid_issue": true, "category": "SAFETY", "severity": "CRITICAL", "affects_room_readiness": true}}

Description: 'Room door lock is jammed and won\'t latch shut'
{{"is_valid_issue": true, "category": "SAFETY", "severity": "HIGH", "affects_room_readiness": false}}

Description: 'Toilet is completely blocked and overflowing'
{{"is_valid_issue": true, "category": "PLUMBING", "severity": "HIGH", "affects_room_readiness": true}}

Description: 'Desk chair leg is wobbly and loose'
{{"is_valid_issue": true, "category": "FURNITURE", "severity": "LOW", "affects_room_readiness": false}}

Description: 'No water coming from bathroom taps'
{{"is_valid_issue": true, "category": "PLUMBING", "severity": "HIGH", "affects_room_readiness": false}}

Description: 'there is no water bottle in the room'
{{"is_valid_issue": false, "category": null, "severity": null, "affects_room_readiness": null}}

Respond with ONLY a valid JSON object matching this schema:
{{"is_valid_issue": true, "category": "HVAC", "severity": "HIGH", "affects_room_readiness": false}}
or
{{"is_valid_issue": false, "category": null, "severity": null, "affects_room_readiness": null}}

Do not add any explanation, markdown, code fences (such as ```json), or extra text.

Description: '{description}'"""

