from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase

from .config import DATABASE_URL

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with async_session() as session:
        yield session


async def init_db():
    async with engine.begin() as conn:
        # Enable WAL mode for better concurrent read/write
        await conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_migrate_missing_columns)


def _migrate_missing_columns(conn):
    """
    Additive migration: create_all doesn't alter existing tables, so add any
    model columns missing from an already-created records table.
    """
    from sqlalchemy import inspect
    from .models import Record

    inspector = inspect(conn)
    if not inspector.has_table(Record.__tablename__):
        return
    existing = {col["name"] for col in inspector.get_columns(Record.__tablename__)}
    for column in Record.__table__.columns:
        if column.name in existing:
            continue
        ddl = f'ALTER TABLE {Record.__tablename__} ADD COLUMN {column.name} {column.type.compile(conn.dialect)}'
        conn.exec_driver_sql(ddl)
