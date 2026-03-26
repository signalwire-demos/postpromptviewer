from datetime import datetime
from typing import Any
from pydantic import BaseModel


class RecordSummary(BaseModel):
    id: int
    call_id: str
    app_name: str | None = None
    call_start_ts: datetime
    call_duration_sec: float | None = None
    caller_id_name: str | None = None
    caller_id_number: str | None = None
    to_number: str | None = None
    conversation_type: str | None = None
    call_direction: str | None = None
    ai_result: str | None = None
    call_ended_by: str | None = None
    hard_timeout: bool = False
    turn_count: int | None = None
    swaig_call_count: int | None = None
    avg_latency_ms: float | None = None
    performance_rating: str | None = None
    ingested_at: datetime
    source: str = "upload"

    model_config = {"from_attributes": True}


class RecordDetail(RecordSummary):
    project_id: str | None = None
    space_id: str | None = None
    ai_session_id: str | None = None
    conversation_id: str | None = None
    call_answer_ts: datetime | None = None
    ai_start_ts: datetime | None = None
    ai_end_ts: datetime | None = None
    call_end_ts: datetime | None = None
    call_type: str | None = None
    from_number: str | None = None
    ai_session_duration_sec: float | None = None
    content_disposition: str | None = None
    total_input_tokens: int | None = None
    total_output_tokens: int | None = None
    total_minutes: float | None = None
    p95_latency_ms: float | None = None
    avg_asr_confidence: float | None = None
    barge_in_count: int | None = None
    raw_payload: dict[str, Any]


class RecordListResponse(BaseModel):
    records: list[RecordSummary]
    total: int
    page: int
    per_page: int
    pages: int


class IngestResponse(BaseModel):
    id: int
    call_id: str
    message: str = "Record ingested"


class BulkIngestResponse(BaseModel):
    ingested: int
    skipped: int
    errors: list[str]


class StatsResponse(BaseModel):
    total_records: int
    total_calls_today: int
    avg_duration_sec: float | None = None
    avg_latency_ms: float | None = None
    performance_breakdown: dict[str, int]
    ai_result_breakdown: dict[str, int]
    ended_by_breakdown: dict[str, int]
