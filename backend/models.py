from datetime import datetime
from sqlalchemy import (
    Column, Integer, BigInteger, Float, String, Text, Boolean, DateTime, JSON, Index
)
from .database import Base


class Record(Base):
    __tablename__ = "records"

    id = Column(Integer, primary_key=True, autoincrement=True)

    # Identity
    call_id = Column(String, unique=True, nullable=False, index=True)
    project_id = Column(String, index=True)
    space_id = Column(String, index=True)
    ai_session_id = Column(String)
    conversation_id = Column(String)
    app_name = Column(String, index=True)

    # Timestamps
    call_start_ts = Column(DateTime, nullable=False, index=True)
    call_answer_ts = Column(DateTime)
    ai_start_ts = Column(DateTime)
    ai_end_ts = Column(DateTime)
    call_end_ts = Column(DateTime)

    # Caller info
    caller_id_name = Column(String)
    caller_id_number = Column(String, index=True)
    conversation_type = Column(String, index=True)

    # Call direction/type
    call_direction = Column(String, index=True)
    call_type = Column(String)
    from_number = Column(String)
    to_number = Column(String, index=True)

    # Computed durations (seconds)
    call_duration_sec = Column(Float)
    ai_session_duration_sec = Column(Float)

    # AI result
    ai_result = Column(String, index=True)
    content_disposition = Column(String)
    call_ended_by = Column(String, index=True)
    hard_timeout = Column(Boolean, default=False)

    # Aggregate metrics
    turn_count = Column(Integer)
    swaig_call_count = Column(Integer)
    total_input_tokens = Column(Integer)
    total_output_tokens = Column(Integer)
    total_minutes = Column(Float)
    avg_latency_ms = Column(Float)
    p95_latency_ms = Column(Float)
    avg_asr_confidence = Column(Float)
    barge_in_count = Column(Integer)
    performance_rating = Column(String, index=True)

    # Full raw payload
    raw_payload = Column(JSON, nullable=False)

    # Record management
    ingested_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    source = Column(String, nullable=False, default="upload")

    __table_args__ = (
        Index("idx_records_call_start_desc", call_start_ts.desc()),
        Index("idx_records_ingested_desc", ingested_at.desc()),
    )
