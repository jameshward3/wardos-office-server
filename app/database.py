from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.settings import get_settings


settings = get_settings()
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db() -> None:
    from app import models

    Base.metadata.create_all(bind=engine)
    ensure_incremental_columns()


def ensure_incremental_columns() -> None:
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "constituent_cases" not in table_names:
        return
    columns = {column["name"] for column in inspector.get_columns("constituent_cases")}
    statements = []
    if "latitude" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN latitude FLOAT")
    if "longitude" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN longitude FLOAT")
    if "address_line" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN address_line VARCHAR(500) DEFAULT '' NOT NULL")
    if "phone" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN phone VARCHAR(80) DEFAULT '' NOT NULL")
    if "email" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN email VARCHAR(255) DEFAULT '' NOT NULL")
    if "events" in table_names:
        event_columns = {column["name"] for column in inspector.get_columns("events")}
        if "source_url" not in event_columns:
            statements.append("ALTER TABLE events ADD COLUMN source_url TEXT DEFAULT '' NOT NULL")
        if "source_id" not in event_columns:
            statements.append("ALTER TABLE events ADD COLUMN source_id VARCHAR(255) DEFAULT '' NOT NULL")
        if "updated_at" not in event_columns:
            statements.append("ALTER TABLE events ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL")
    if "development_projects" in table_names:
        development_columns = {column["name"] for column in inspector.get_columns("development_projects")}
        if "source_url" not in development_columns:
            statements.append("ALTER TABLE development_projects ADD COLUMN source_url TEXT DEFAULT '' NOT NULL")
        if "source_id" not in development_columns:
            statements.append("ALTER TABLE development_projects ADD COLUMN source_id VARCHAR(255) DEFAULT '' NOT NULL")
    if not statements:
        return
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
