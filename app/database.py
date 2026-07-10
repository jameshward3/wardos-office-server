from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from app.settings import get_settings


settings = get_settings()
engine = create_engine(
    settings.resolved_database_url,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=10,
    max_overflow=20,
)
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
    statements = []
    if "constituents" in table_names:
        constituent_columns = {column["name"] for column in inspector.get_columns("constituents")}
        constituent_column_defs = {
            "dob": "ALTER TABLE constituents ADD COLUMN dob DATE",
            "party_affiliation": "ALTER TABLE constituents ADD COLUMN party_affiliation VARCHAR(80) DEFAULT '' NOT NULL",
            "registration_date": "ALTER TABLE constituents ADD COLUMN registration_date DATE",
            "gender": "ALTER TABLE constituents ADD COLUMN gender VARCHAR(80) DEFAULT '' NOT NULL",
            "phone": "ALTER TABLE constituents ADD COLUMN phone VARCHAR(80) DEFAULT '' NOT NULL",
            "voting_district": "ALTER TABLE constituents ADD COLUMN voting_district VARCHAR(80) DEFAULT '' NOT NULL",
            "historical_source_file": "ALTER TABLE constituents ADD COLUMN historical_source_file VARCHAR(500) DEFAULT '' NOT NULL",
            "historical_source_year": "ALTER TABLE constituents ADD COLUMN historical_source_year INTEGER",
            "historical_match_status": "ALTER TABLE constituents ADD COLUMN historical_match_status VARCHAR(120) DEFAULT '' NOT NULL",
            "historical_payload": "ALTER TABLE constituents ADD COLUMN historical_payload TEXT DEFAULT '' NOT NULL",
            "historical_enriched_at": "ALTER TABLE constituents ADD COLUMN historical_enriched_at TIMESTAMP",
        }
        for column, statement in constituent_column_defs.items():
            if column not in constituent_columns:
                statements.append(statement)
    columns = {column["name"] for column in inspector.get_columns("constituent_cases")}
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
    if "constituent_id" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN constituent_id INTEGER")
    if "category" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN category VARCHAR(120) DEFAULT '' NOT NULL")
    if "department" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN department VARCHAR(120) DEFAULT '' NOT NULL")
    if "assigned_to" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN assigned_to VARCHAR(255) DEFAULT '' NOT NULL")
    if "ward" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN ward VARCHAR(120) DEFAULT 'South Ward' NOT NULL")
    if "source" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN source VARCHAR(80) DEFAULT 'Phone Call' NOT NULL")
    if "due_at" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN due_at TIMESTAMP")
    if "resolved_at" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN resolved_at TIMESTAMP")
    if "ai_summary" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN ai_summary TEXT DEFAULT '' NOT NULL")
    if "ai_summary_generated_at" not in columns:
        statements.append("ALTER TABLE constituent_cases ADD COLUMN ai_summary_generated_at TIMESTAMP")
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
    if "legislation_items" in table_names:
        legislation_columns = {column["name"] for column in inspector.get_columns("legislation_items")}
        if "source_url" not in legislation_columns:
            statements.append("ALTER TABLE legislation_items ADD COLUMN source_url TEXT DEFAULT '' NOT NULL")
        if "source_id" not in legislation_columns:
            statements.append("ALTER TABLE legislation_items ADD COLUMN source_id VARCHAR(255) DEFAULT '' NOT NULL")
    if "case_notes" in table_names:
        case_note_columns = {column["name"] for column in inspector.get_columns("case_notes")}
        if "edited_at" not in case_note_columns:
            statements.append("ALTER TABLE case_notes ADD COLUMN edited_at TIMESTAMP")
    if not statements:
        statements = []
    statements.extend([
        "CREATE INDEX IF NOT EXISTS ix_constituents_ward_name ON constituents (ward, last_name, first_name)",
        "CREATE INDEX IF NOT EXISTS ix_constituents_subgroup_name ON constituents (subgroup, last_name, first_name)",
        "CREATE INDEX IF NOT EXISTS ix_cases_status_created ON constituent_cases (status, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_cases_constituent_id ON constituent_cases (constituent_id)",
        "CREATE INDEX IF NOT EXISTS ix_case_notes_case_id ON case_notes (case_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_case_communications_case_id ON case_communications (case_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_case_attachments_case_id ON case_attachments (case_id, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_events_type_starts ON events (event_type, starts_at)",
        "CREATE INDEX IF NOT EXISTS ix_media_mentions_topic_published ON media_mentions (topic, published_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_public_safety_ward_occurred ON public_safety_incidents (ward, occurred_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_development_projects_board_status ON development_projects (board, status)",
        "CREATE INDEX IF NOT EXISTS ix_legislation_items_status_hearing ON legislation_items (status, hearing_date)",
        "CREATE INDEX IF NOT EXISTS ix_legislation_items_source_id ON legislation_items (source_id)",
        "CREATE INDEX IF NOT EXISTS ix_audit_logs_entity_created ON audit_logs (entity_type, created_at DESC)",
    ])
    with engine.begin() as connection:
        for statement in statements:
            connection.execute(text(statement))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
