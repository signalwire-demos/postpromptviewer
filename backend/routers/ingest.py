import json
import secrets
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..config import WEBHOOK_AUTH
from ..database import get_db
from ..models import Record
from ..schemas import IngestResponse, BulkIngestResponse
from ..services.extractor import extract_metadata, validate

router = APIRouter(prefix="/api/v1/ingest", tags=["ingest"])
security = HTTPBasic(auto_error=False)


async def verify_webhook_auth(credentials: HTTPBasicCredentials | None = Depends(security)):
    """Verify HTTP Basic Auth if PIE_WEBHOOK_AUTH is configured."""
    if not WEBHOOK_AUTH:
        return  # No auth configured, allow all

    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Basic"},
        )

    expected_user, _, expected_pass = WEBHOOK_AUTH.partition(":")
    user_ok = secrets.compare_digest(credentials.username.encode(), expected_user.encode())
    pass_ok = secrets.compare_digest(credentials.password.encode(), expected_pass.encode())

    if not (user_ok and pass_ok):
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )


async def _ingest_one(raw: dict, source: str, upsert: bool, db: AsyncSession) -> Record | None:
    """Validate, extract metadata, and insert a single record. Returns None if skipped."""
    validate(raw)
    meta = extract_metadata(raw)
    meta["source"] = source

    # Check for duplicate
    existing = await db.execute(
        select(Record).where(Record.call_id == meta["call_id"])
    )
    existing = existing.scalar_one_or_none()

    if existing:
        if not upsert:
            return None  # skip duplicate
        # Update existing record
        for key, value in meta.items():
            setattr(existing, key, value)
        await db.flush()
        return existing

    record = Record(**meta)
    db.add(record)
    await db.flush()
    return record


@router.post("/webhook", response_model=IngestResponse, status_code=201,
             dependencies=[Depends(verify_webhook_auth)])
async def ingest_webhook(
    request: Request,
    upsert: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Receive a raw post_conversation JSON payload (e.g., from SignalWire post_url)."""
    try:
        raw = await request.json()
    except Exception:
        raise HTTPException(400, "Invalid JSON body")

    try:
        record = await _ingest_one(raw, source="webhook", upsert=upsert, db=db)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if record is None:
        raise HTTPException(409, f"Record with call_id already exists. Use ?upsert=true to overwrite.")

    await db.commit()
    return IngestResponse(id=record.id, call_id=record.call_id)


@router.post("/upload", response_model=IngestResponse, status_code=201,
             dependencies=[Depends(verify_webhook_auth)])
async def ingest_upload(
    file: UploadFile = File(...),
    upsert: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Upload a single post_conversation JSON file."""
    content = await file.read()
    try:
        raw = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON file")

    try:
        record = await _ingest_one(raw, source="upload", upsert=upsert, db=db)
    except ValueError as e:
        raise HTTPException(400, str(e))

    if record is None:
        raise HTTPException(409, f"Record with call_id already exists. Use ?upsert=true to overwrite.")

    await db.commit()
    return IngestResponse(id=record.id, call_id=record.call_id)


@router.post("/bulk", response_model=BulkIngestResponse,
             dependencies=[Depends(verify_webhook_auth)])
async def ingest_bulk(
    request: Request,
    files: list[UploadFile] | None = File(None),
    upsert: bool = Query(False),
    db: AsyncSession = Depends(get_db),
):
    """Bulk ingest: either multiple uploaded files or a JSON array body."""
    payloads = []

    if files:
        for f in files:
            content = await f.read()
            try:
                payloads.append(json.loads(content))
            except json.JSONDecodeError:
                pass
    else:
        try:
            body = await request.json()
            if isinstance(body, list):
                payloads = body
            else:
                payloads = [body]
        except Exception:
            raise HTTPException(400, "Expected JSON array or multipart files")

    ingested = 0
    skipped = 0
    errors = []

    for i, raw in enumerate(payloads):
        try:
            record = await _ingest_one(raw, source="bulk", upsert=upsert, db=db)
            if record:
                ingested += 1
            else:
                skipped += 1
        except ValueError as e:
            errors.append(f"Item {i}: {e}")
            skipped += 1

    await db.commit()
    return BulkIngestResponse(ingested=ingested, skipped=skipped, errors=errors)
