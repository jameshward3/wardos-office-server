from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, Index, Integer, String, Text, UniqueConstraint

from app.database import Base


class ConstituentCase(Base):
    __tablename__ = "constituent_cases"
    __table_args__ = (
        Index("ix_constituent_cases_status_created_at", "status", "created_at"),
        Index("ix_constituent_cases_name_topic", "constituent_name", "topic"),
    )

    id = Column(Integer, primary_key=True, index=True)
    constituent_name = Column(String(255), nullable=False)
    address_line = Column(String(500), default="", nullable=False)
    phone = Column(String(80), default="", nullable=False)
    email = Column(String(255), default="", nullable=False)
    topic = Column(String(255), nullable=False)
    status = Column(String(80), default="open", nullable=False)
    priority = Column(String(80), default="normal", nullable=False)
    notes = Column(Text, default="", nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Constituent(Base):
    __tablename__ = "constituents"
    __table_args__ = (
        Index("ix_constituents_ward_subgroup", "ward", "subgroup"),
        Index("ix_constituents_full_name", "full_name"),
        Index("ix_constituents_street_lookup", "street", "street_no", "zip_code"),
    )

    id = Column(Integer, primary_key=True, index=True)
    voter_id = Column(String(120), unique=True, index=True, nullable=True)
    first_name = Column(String(255), default="", nullable=False)
    last_name = Column(String(255), default="", nullable=False)
    full_name = Column(String(500), nullable=False)
    street_no = Column(String(80), default="", nullable=False)
    street = Column(String(255), default="", nullable=False)
    apt = Column(String(80), default="", nullable=False)
    city = Column(String(120), default="", nullable=False)
    state = Column(String(20), default="", nullable=False)
    zip_code = Column(String(20), default="", nullable=False)
    ward = Column(String(120), default="", nullable=False)
    subgroup = Column(String(255), default="", nullable=False)
    voter_status = Column(String(120), default="", nullable=False)
    mailin_request_date = Column(Date, nullable=True)
    mailin_sent_date = Column(Date, nullable=True)
    mailin_received_date = Column(Date, nullable=True)
    days_to_return = Column(Integer, nullable=True)
    source_file = Column(String(500), default="", nullable=False)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class LegislationItem(Base):
    __tablename__ = "legislation_items"
    __table_args__ = (
        Index("ix_legislation_items_status_hearing_date", "status", "hearing_date"),
        Index("ix_legislation_items_bill_number", "bill_number"),
    )

    id = Column(Integer, primary_key=True, index=True)
    bill_number = Column(String(120), nullable=False)
    title = Column(String(500), nullable=False)
    status = Column(String(120), default="tracking", nullable=False)
    hearing_date = Column(Date, nullable=True)
    source_url = Column(Text, default="", nullable=False)
    source_id = Column(String(255), default="", nullable=False, index=True)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class BudgetWatchItem(Base):
    __tablename__ = "budget_watch_items"

    id = Column(Integer, primary_key=True, index=True)
    department = Column(String(255), nullable=False)
    line_item = Column(String(255), nullable=False)
    fiscal_year = Column(String(20), nullable=False)
    concern = Column(Text, default="", nullable=False)
    status = Column(String(120), default="watching", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_status_starts_at", "status", "starts_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    starts_at = Column(DateTime, nullable=True)
    location = Column(String(255), default="", nullable=False)
    event_type = Column(String(120), default="meeting", nullable=False)
    status = Column(String(120), default="scheduled", nullable=False)
    notes = Column(Text, default="", nullable=False)
    source_url = Column(Text, default="", nullable=False)
    source_id = Column(String(255), default="", nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class DevelopmentProject(Base):
    __tablename__ = "development_projects"
    __table_args__ = (
        Index("ix_development_projects_status_created_at", "status", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    address = Column(String(255), default="", nullable=False)
    project_type = Column(String(120), default="", nullable=False)
    status = Column(String(120), default="tracking", nullable=False)
    board = Column(String(120), default="", nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    notes = Column(Text, default="", nullable=False)
    source_url = Column(Text, default="", nullable=False)
    source_id = Column(String(255), default="", nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class MediaMention(Base):
    __tablename__ = "media_mentions"
    __table_args__ = (
        Index("ix_media_mentions_source_type_published", "source_type", "published_at"),
        Index("ix_media_mentions_sentiment_topic", "sentiment", "topic"),
    )

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(255), nullable=False)
    source_type = Column(String(120), default="news", nullable=False)
    headline = Column(String(500), nullable=False)
    summary = Column(Text, default="", nullable=False)
    url = Column(Text, default="", nullable=False)
    sentiment = Column(String(80), default="neutral", nullable=False)
    topic = Column(String(120), default="", nullable=False)
    geographic_tag = Column(String(120), default="", nullable=False)
    engagement_score = Column(Integer, default=0, nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class PublicSafetyIncident(Base):
    __tablename__ = "public_safety_incidents"
    __table_args__ = (
        Index("ix_public_safety_status_occurred", "status", "occurred_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    incident_type = Column(String(120), default="incident", nullable=False)
    category = Column(String(120), default="other", nullable=False)
    title = Column(String(255), nullable=False)
    location = Column(String(255), default="", nullable=False)
    occurred_at = Column(DateTime, nullable=True)
    status = Column(String(120), default="reported", nullable=False)
    severity = Column(String(80), default="medium", nullable=False)
    ward = Column(String(120), default="South Ward", nullable=False)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    source_file = Column(String(500), default="", nullable=False)
    source_url = Column(Text, default="", nullable=False)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CityBulletin(Base):
    __tablename__ = "city_bulletins"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(String(255), unique=True, index=True, nullable=False)
    title = Column(String(500), nullable=False)
    bulletin_type = Column(String(120), default="homepage", nullable=False)
    url = Column(Text, default="", nullable=False)
    summary = Column(Text, default="", nullable=False)
    status = Column(String(120), default="posted", nullable=False)
    source_url = Column(Text, default="", nullable=False)
    first_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class OfficeAction(Base):
    __tablename__ = "office_actions"
    __table_args__ = (
        Index("ix_office_actions_status_due_at", "status", "due_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    action_type = Column(String(120), default="follow_up", nullable=False)
    status = Column(String(120), default="draft", nullable=False)
    priority = Column(String(80), default="normal", nullable=False)
    owner = Column(String(255), default="", nullable=False)
    due_at = Column(DateTime, nullable=True)
    source_type = Column(String(120), default="", nullable=False)
    source_id = Column(String(120), default="", nullable=False)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class DocumentRecord(Base):
    __tablename__ = "document_records"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    folder = Column(String(120), nullable=False)
    file_name = Column(String(500), nullable=False)
    doc_type = Column(String(120), default="", nullable=False)
    status = Column(String(120), default="new", nullable=False)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class SourceConnection(Base):
    __tablename__ = "source_connections"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    source_type = Column(String(120), nullable=False)
    url = Column(Text, default="", nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    last_sync_at = Column(DateTime, nullable=True)
    status = Column(String(120), default="not_configured", nullable=False)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class StaffUser(Base):
    __tablename__ = "staff_users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(255), nullable=False)
    email = Column(String(255), nullable=False, unique=True, index=True)
    role = Column(String(120), nullable=False)
    title = Column(String(255), default="", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    notes = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (
        Index("ix_audit_logs_actor_created", "actor", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    actor = Column(String(255), default="system", nullable=False)
    action = Column(String(120), nullable=False)
    entity_type = Column(String(120), nullable=False)
    entity_id = Column(String(120), default="", nullable=False)
    detail = Column(Text, default="", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class WardOSMemoryItem(Base):
    __tablename__ = "wardos_memory_items"
    __table_args__ = (
        UniqueConstraint("memory_key", name="uq_wardos_memory_items_memory_key"),
        Index("ix_wardos_memory_items_category_updated", "category", "updated_at"),
        Index("ix_wardos_memory_items_source", "source_table", "source_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    memory_key = Column(String(255), nullable=False)
    category = Column(String(120), nullable=False, index=True)
    source_table = Column(String(120), nullable=False, index=True)
    source_id = Column(String(120), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    summary = Column(Text, default="", nullable=False)
    status = Column(String(120), default="", nullable=False)
    priority = Column(String(80), default="", nullable=False)
    owner = Column(String(255), default="", nullable=False)
    event_date = Column(DateTime, nullable=True, index=True)
    url = Column(Text, default="", nullable=False)
    tags = Column(Text, default="", nullable=False)
    payload_json = Column(Text, default="{}", nullable=False)
    sheet_name = Column(String(120), default="", nullable=False)
    row_hash = Column(String(120), default="", nullable=False)
    last_seen_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
