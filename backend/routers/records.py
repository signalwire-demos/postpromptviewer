import math
from datetime import datetime, date
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, or_, cast, String

from ..database import get_db
from ..models import Record
from ..schemas import RecordSummary, RecordDetail, RecordListResponse, StatsResponse

router = APIRouter(prefix="/api/v1/records", tags=["records"])

# Columns allowed for sorting
SORT_FIELDS = {
    "call_start_ts", "call_duration_sec", "avg_latency_ms", "turn_count",
    "swaig_call_count", "ingested_at", "app_name", "performance_rating",
    "caller_id_number", "ai_result", "call_ended_by",
}


@router.get("", response_model=RecordListResponse)
async def list_records(
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
    sort: str = Query("call_start_ts"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    q: str = Query("", description="Search call_id, caller number, app name"),
    project_id: str | None = None,
    space_id: str | None = None,
    app_name: str | None = None,
    caller_id_number: str | None = None,
    ai_result: str | None = None,
    call_ended_by: str | None = None,
    performance_rating: str | None = None,
    conversation_type: str | None = None,
    call_direction: str | None = None,
    date_from: str | None = Query(None, description="ISO date or datetime"),
    date_to: str | None = Query(None, description="ISO date or datetime"),
    min_duration: float | None = None,
    max_duration: float | None = None,
    db: AsyncSession = Depends(get_db),
):
    """List records with pagination, filtering, and sorting."""
    if sort not in SORT_FIELDS:
        sort = "call_start_ts"

    query = select(Record)

    # Text search
    if q:
        pattern = f"%{q}%"
        query = query.where(
            or_(
                Record.call_id.ilike(pattern),
                Record.caller_id_number.ilike(pattern),
                Record.caller_id_name.ilike(pattern),
                Record.app_name.ilike(pattern),
                Record.to_number.ilike(pattern),
                Record.from_number.ilike(pattern),
            )
        )

    # Exact filters
    if project_id:
        query = query.where(Record.project_id == project_id)
    if space_id:
        query = query.where(Record.space_id == space_id)
    if app_name:
        query = query.where(Record.app_name == app_name)
    if caller_id_number:
        query = query.where(Record.caller_id_number == caller_id_number)
    if ai_result:
        query = query.where(Record.ai_result == ai_result)
    if call_ended_by:
        query = query.where(Record.call_ended_by == call_ended_by)
    if performance_rating:
        query = query.where(Record.performance_rating == performance_rating)
    if conversation_type:
        query = query.where(Record.conversation_type == conversation_type)
    if call_direction:
        query = query.where(Record.call_direction == call_direction)

    # Date range
    if date_from:
        try:
            dt = datetime.fromisoformat(date_from)
        except ValueError:
            dt = datetime.combine(date.fromisoformat(date_from), datetime.min.time())
        query = query.where(Record.call_start_ts >= dt)
    if date_to:
        try:
            dt = datetime.fromisoformat(date_to)
        except ValueError:
            dt = datetime.combine(date.fromisoformat(date_to), datetime.max.time())
        query = query.where(Record.call_start_ts <= dt)

    # Duration range
    if min_duration is not None:
        query = query.where(Record.call_duration_sec >= min_duration)
    if max_duration is not None:
        query = query.where(Record.call_duration_sec <= max_duration)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Sort
    sort_col = getattr(Record, sort)
    if order == "desc":
        query = query.order_by(sort_col.desc())
    else:
        query = query.order_by(sort_col.asc())

    # Paginate
    offset = (page - 1) * per_page
    query = query.offset(offset).limit(per_page)

    result = await db.execute(query)
    records = result.scalars().all()

    return RecordListResponse(
        records=[RecordSummary.model_validate(r) for r in records],
        total=total,
        page=page,
        per_page=per_page,
        pages=math.ceil(total / per_page) if total > 0 else 0,
    )


@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Aggregate statistics across all records."""
    total = (await db.execute(select(func.count(Record.id)))).scalar() or 0

    today = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_count = (await db.execute(
        select(func.count(Record.id)).where(Record.call_start_ts >= today_start)
    )).scalar() or 0

    avg_dur = (await db.execute(select(func.avg(Record.call_duration_sec)))).scalar()
    avg_lat = (await db.execute(select(func.avg(Record.avg_latency_ms)))).scalar()

    # Breakdowns
    perf_rows = (await db.execute(
        select(Record.performance_rating, func.count(Record.id))
        .where(Record.performance_rating.isnot(None))
        .group_by(Record.performance_rating)
    )).all()
    performance_breakdown = {r[0]: r[1] for r in perf_rows}

    result_rows = (await db.execute(
        select(Record.ai_result, func.count(Record.id))
        .where(Record.ai_result.isnot(None))
        .group_by(Record.ai_result)
    )).all()
    ai_result_breakdown = {r[0]: r[1] for r in result_rows}

    ended_rows = (await db.execute(
        select(Record.call_ended_by, func.count(Record.id))
        .where(Record.call_ended_by.isnot(None))
        .group_by(Record.call_ended_by)
    )).all()
    ended_by_breakdown = {r[0]: r[1] for r in ended_rows}

    return StatsResponse(
        total_records=total,
        total_calls_today=today_count,
        avg_duration_sec=round(avg_dur, 2) if avg_dur else None,
        avg_latency_ms=round(avg_lat) if avg_lat else None,
        performance_breakdown=performance_breakdown,
        ai_result_breakdown=ai_result_breakdown,
        ended_by_breakdown=ended_by_breakdown,
    )


@router.get("/{call_id}", response_model=RecordDetail)
async def get_record(call_id: str, db: AsyncSession = Depends(get_db)):
    """Get a single record with full raw payload."""
    result = await db.execute(select(Record).where(Record.call_id == call_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(404, f"Record not found: {call_id}")
    return RecordDetail.model_validate(record)


@router.delete("/{call_id}", status_code=204)
async def delete_record(call_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a record by call_id."""
    result = await db.execute(select(Record).where(Record.call_id == call_id))
    record = result.scalar_one_or_none()
    if not record:
        raise HTTPException(404, f"Record not found: {call_id}")
    await db.delete(record)
    await db.commit()
