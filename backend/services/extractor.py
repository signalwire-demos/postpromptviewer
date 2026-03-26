"""
Extract searchable metadata from a raw post_conversation JSON payload.
This is a Python port of the subset of lib/parser.js and lib/metrics/ needed
to populate the database columns. The full parsing/normalization still happens
client-side via the existing JS parsePayload() + computeMetrics().
"""

from datetime import datetime, timezone
from statistics import mean as _mean

REQUIRED_FIELDS = ["call_id", "action", "call_start_date", "call_log"]


def validate(raw: dict) -> None:
    """Validate required fields and action type."""
    if not isinstance(raw, dict):
        raise ValueError("Payload must be a JSON object")
    for field in REQUIRED_FIELDS:
        if field not in raw:
            raise ValueError(f"Missing required field: {field}")
    if raw.get("action") != "post_conversation":
        raise ValueError(f"Unexpected action: {raw.get('action')} (expected 'post_conversation')")


def us_to_datetime(us: int | float | None) -> datetime | None:
    """Convert microsecond epoch to UTC datetime."""
    if not us or us <= 0:
        return None
    return datetime.fromtimestamp(us / 1_000_000, tz=timezone.utc)


def us_to_sec(us: int | float) -> float:
    """Convert microsecond duration to seconds."""
    return round(us / 1_000_000, 3)


def safe_mean(values: list) -> float | None:
    """Mean of a list, or None if empty."""
    values = [v for v in values if v is not None and v > 0]
    if not values:
        return None
    return _mean(values)


def percentile(values: list[float], pct: int) -> float | None:
    """Simple percentile calculation."""
    values = sorted(v for v in values if v is not None and v > 0)
    if not values:
        return None
    k = (len(values) - 1) * (pct / 100)
    f = int(k)
    c = f + 1
    if c >= len(values):
        return values[f]
    return values[f] + (k - f) * (values[c] - values[f])


def infer_call_ended_by(raw: dict) -> str:
    """Port of _inferCallEndedBy from parser.js."""
    if raw.get("call_ended_by"):
        return raw["call_ended_by"]
    for entry in raw.get("call_log", []):
        if entry.get("role") == "system-log" and entry.get("action") == "session_end":
            meta = entry.get("metadata") or {}
            return meta.get("ended_by", "unknown")
    return "unknown"


def infer_call_end_date(raw: dict) -> int:
    """Port of _inferCallEndDate from parser.js."""
    for entry in raw.get("call_log", []):
        if (entry.get("role") == "system-log"
                and entry.get("action") == "session_end"
                and entry.get("timestamp")):
            return entry["timestamp"]
    return 0


def extract_metadata(raw: dict) -> dict:
    """
    Extract all searchable metadata columns from a raw post_conversation payload.
    Returns a dict ready to be unpacked into a Record model constructor.
    """
    validate(raw)

    call_log = raw.get("call_log", [])
    swaig_log = raw.get("swaig_log", [])
    swml_call = raw.get("SWMLCall", {}) or {}
    swml_vars = raw.get("SWMLVars", {}) or {}
    times = raw.get("times", []) or []

    # Timestamps
    call_start = raw["call_start_date"]
    call_answer = raw.get("call_answer_date", 0) or 0
    ai_start = raw.get("ai_start_date", 0) or 0
    ai_end = raw.get("ai_end_date", 0) or 0
    call_end_raw = raw.get("call_end_date", 0) or 0
    call_end = call_end_raw if call_end_raw else infer_call_end_date(raw)

    # Duration (port of computeDuration)
    if call_end:
        call_duration_sec = us_to_sec(call_end - call_start)
    elif ai_end:
        call_duration_sec = us_to_sec(ai_end - call_start)
    else:
        call_duration_sec = None

    ai_session_duration_sec = None
    if ai_end and ai_start:
        ai_session_duration_sec = us_to_sec(ai_end - ai_start)

    # Turn count (port of computeConversation)
    turn_count = 0
    last_role = None
    for msg in call_log:
        role = msg.get("role")
        if role in ("user", "assistant") and role != last_role:
            turn_count += 1
            last_role = role

    # SWAIG call count
    swaig_call_count = len(swaig_log)

    # Latency (port of computeLatency - assistant only for avg/p95)
    assistant_latencies = []
    for msg in call_log:
        if msg.get("role") != "assistant":
            continue
        lat = msg.get("audio_latency") or msg.get("utterance_latency") or msg.get("latency")
        if lat and lat > 0:
            assistant_latencies.append(lat)

    avg_latency_ms = safe_mean(assistant_latencies)
    if avg_latency_ms is not None:
        avg_latency_ms = round(avg_latency_ms)

    # P95 from times[].answer_time
    answer_times = [
        t["answer_time"] for t in times
        if t.get("answer_time") and t["answer_time"] > 0
        and t.get("response_word_count", 0) > 0
    ]
    p95_val = percentile(answer_times, 95)
    p95_latency_ms = round(p95_val * 1000) if p95_val else None

    # Performance rating (port of latency.js thresholds)
    performance_rating = None
    if avg_latency_ms is not None:
        if avg_latency_ms < 1200:
            performance_rating = "Excellent"
        elif avg_latency_ms < 1800:
            performance_rating = "Good"
        elif avg_latency_ms < 2500:
            performance_rating = "Fair"
        else:
            performance_rating = "Needs Improvement"

    # ASR confidence (port of computeAsr)
    confidences = [
        msg["confidence"] for msg in call_log
        if msg.get("role") == "user" and msg.get("confidence") is not None
    ]
    avg_asr_confidence = round(_mean(confidences), 4) if confidences else None

    # Barge-in count
    barge_in_count = sum(
        msg.get("barge_count", 0)
        for msg in call_log
        if msg.get("role") == "user"
    )

    # Tokens
    total_input_tokens = raw.get("total_input_tokens")
    total_output_tokens = raw.get("total_output_tokens")

    return {
        # Identity
        "call_id": raw["call_id"],
        "project_id": raw.get("project_id"),
        "space_id": raw.get("space_id"),
        "ai_session_id": raw.get("ai_session_id"),
        "conversation_id": raw.get("conversation_id"),
        "app_name": raw.get("app_name"),

        # Timestamps
        "call_start_ts": us_to_datetime(call_start),
        "call_answer_ts": us_to_datetime(call_answer),
        "ai_start_ts": us_to_datetime(ai_start),
        "ai_end_ts": us_to_datetime(ai_end),
        "call_end_ts": us_to_datetime(call_end),

        # Caller info
        "caller_id_name": raw.get("caller_id_name", ""),
        "caller_id_number": raw.get("caller_id_number", ""),
        "conversation_type": raw.get("conversation_type", "unknown"),

        # Call direction/type
        "call_direction": swml_call.get("direction"),
        "call_type": swml_call.get("type"),
        "from_number": swml_call.get("from"),
        "to_number": swml_call.get("to"),

        # Durations
        "call_duration_sec": call_duration_sec,
        "ai_session_duration_sec": ai_session_duration_sec,

        # AI result
        "ai_result": swml_vars.get("ai_result"),
        "content_disposition": raw.get("content_disposition"),
        "call_ended_by": infer_call_ended_by(raw),
        "hard_timeout": bool(raw.get("hard_timeout")),

        # Aggregate metrics
        "turn_count": turn_count,
        "swaig_call_count": swaig_call_count,
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "total_minutes": raw.get("total_minutes"),
        "avg_latency_ms": avg_latency_ms,
        "p95_latency_ms": p95_latency_ms,
        "avg_asr_confidence": avg_asr_confidence,
        "barge_in_count": barge_in_count,
        "performance_rating": performance_rating,

        # Raw payload
        "raw_payload": raw,
    }
