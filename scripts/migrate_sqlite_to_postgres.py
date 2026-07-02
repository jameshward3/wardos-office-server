from __future__ import annotations

import os
import sqlite3
import sys
from pathlib import Path
from urllib.parse import urlparse

import psycopg2
from psycopg2.extras import RealDictCursor

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.settings import get_settings


SQLITE_PATH = Path(os.environ.get("SQLITE_PATH", "/app/data/local_dev/wardos-local.db"))
DATABASE_URL = os.environ.get("DATABASE_URL") or get_settings().resolved_database_url

TABLES = [
    "audit_logs",
    "budget_watch_items",
    "city_bulletins",
    "constituent_cases",
    "constituents",
    "development_projects",
    "document_records",
    "events",
    "legislation_items",
    "media_mentions",
    "office_actions",
    "source_connections",
    "staff_users",
    "public_safety_incidents",
]

DEDUP_KEYS = {
    "audit_logs": ["actor", "action", "entity_type", "entity_id", "detail", "created_at"],
    "budget_watch_items": ["department", "line_item", "fiscal_year"],
    "city_bulletins": ["source_id"],
    "constituent_cases": ["constituent_name", "topic", "created_at"],
    "constituents": ["voter_id"],
    "development_projects": ["source_id"],
    "document_records": ["folder", "file_name"],
    "events": ["source_id"],
    "legislation_items": ["bill_number", "title"],
    "media_mentions": ["url", "headline"],
    "office_actions": ["title", "action_type", "created_at"],
    "source_connections": ["name", "source_type", "url"],
    "staff_users": ["email"],
    "public_safety_incidents": ["title", "location", "source_file"],
}

FALLBACK_DEDUP_KEYS = {
    "constituents": ["full_name", "street_no", "street", "apt", "subgroup"],
    "development_projects": ["name", "address", "board", "source_url"],
    "events": ["title", "starts_at", "location", "source_url"],
    "city_bulletins": ["title", "url", "source_url"],
}

BOOLEAN_COLUMNS = {
    "source_connections": ["enabled"],
    "staff_users": ["is_active"],
}


def postgres_connect_args(database_url: str) -> dict:
    parsed = urlparse(database_url.replace("postgresql+psycopg2://", "postgresql://", 1))
    return {
        "dbname": parsed.path.lstrip("/"),
        "user": parsed.username,
        "password": parsed.password,
        "host": parsed.hostname,
        "port": parsed.port or 5432,
    }


def sqlite_tables(connection: sqlite3.Connection) -> set[str]:
    rows = connection.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'").fetchall()
    return {row[0] for row in rows}


def postgres_columns(connection, table: str) -> list[str]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            select column_name
            from information_schema.columns
            where table_schema = 'public' and table_name = %s
            order by ordinal_position
            """,
            (table,),
        )
        return [row[0] for row in cursor.fetchall()]


def exists(connection, table: str, row: dict, keys: list[str]) -> bool:
    if not keys or any(row.get(key) is None for key in keys):
        return False
    if table == "source_connections":
        where_parts = []
        values = []
        for key in keys:
            value = row.get(key)
            if key in {"name", "source_type"}:
                where_parts.append(f"lower(trim({key})) = lower(trim(%s))")
                values.append(value)
            elif key == "url":
                where_parts.append("coalesce(nullif(trim(url), ''), '__blank__') = coalesce(nullif(trim(%s), ''), '__blank__')")
                values.append(value)
            else:
                where_parts.append(f"{key} = %s")
                values.append(value)
        where = " and ".join(where_parts)
    else:
        where = " and ".join(f"{key} = %s" for key in keys)
        values = [row.get(key) for key in keys]
    with connection.cursor() as cursor:
        cursor.execute(f"select 1 from {table} where {where} limit 1", values)
        return cursor.fetchone() is not None


def insert_row(connection, table: str, row: dict, columns: list[str]) -> None:
    insert_columns = [column for column in columns if column != "id" and column in row]
    if not insert_columns:
        return
    placeholders = ", ".join(["%s"] * len(insert_columns))
    column_sql = ", ".join(insert_columns)
    values = []
    for column in insert_columns:
        value = row[column]
        if column in BOOLEAN_COLUMNS.get(table, []) and value is not None:
            value = bool(value)
        values.append(value)
    with connection.cursor() as cursor:
        cursor.execute(
            f"insert into {table} ({column_sql}) values ({placeholders})",
            values,
        )


def migrate_table(sqlite_connection, postgres_connection, table: str) -> dict:
    sqlite_connection.row_factory = sqlite3.Row
    rows = [dict(row) for row in sqlite_connection.execute(f'select * from "{table}"').fetchall()]
    columns = postgres_columns(postgres_connection, table)
    if not rows or not columns:
        return {"table": table, "read": len(rows), "inserted": 0, "skipped": len(rows)}

    inserted = 0
    skipped = 0
    primary_keys = [key for key in DEDUP_KEYS.get(table, []) if key in columns and key in rows[0]]
    fallback_keys = [key for key in FALLBACK_DEDUP_KEYS.get(table, []) if key in columns and key in rows[0]]

    for row in rows:
        if exists(postgres_connection, table, row, primary_keys) or exists(postgres_connection, table, row, fallback_keys):
            skipped += 1
            continue
        insert_row(postgres_connection, table, row, columns)
        inserted += 1

    return {"table": table, "read": len(rows), "inserted": inserted, "skipped": skipped}


def main() -> None:
    if not SQLITE_PATH.exists():
        raise SystemExit(f"SQLite source not found: {SQLITE_PATH}")

    sqlite_connection = sqlite3.connect(SQLITE_PATH)
    postgres_connection = psycopg2.connect(**postgres_connect_args(DATABASE_URL))
    postgres_connection.autocommit = False

    available_tables = sqlite_tables(sqlite_connection)
    results = []
    try:
        for table in TABLES:
            if table not in available_tables:
                continue
            results.append(migrate_table(sqlite_connection, postgres_connection, table))
        postgres_connection.commit()
    except Exception:
        postgres_connection.rollback()
        raise
    finally:
        sqlite_connection.close()
        postgres_connection.close()

    for result in results:
        print(f"{result['table']}: read={result['read']} inserted={result['inserted']} skipped={result['skipped']}")


if __name__ == "__main__":
    main()
