# WardOS Backup and Restore Runbook

WardOS stores critical operational data in Postgres. Backups should be treated as private records because they can include constituent information, staff notes, events, and public safety details.

## Create a Backup

Run from the `wardos-office-server` directory:

```bash
scripts/backup_postgres.sh
```

The script writes:

- `data/backups/wardos_YYYYMMDD_HHMMSS.sql`
- `data/backups/wardos_YYYYMMDD_HHMMSS.sql.sha256`

Backups older than `BACKUP_RETENTION_DAYS` are pruned. The default is `30` days.

## Verify a Backup

```bash
shasum -a 256 -c data/backups/wardos_YYYYMMDD_HHMMSS.sql.sha256
```

The command should report `OK`.

## Restore Into a Running Local Stack

Pause staff use of WardOS before restoring. Restore is destructive to the target database state.

```bash
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < data/backups/wardos_YYYYMMDD_HHMMSS.sql
```

After restore:

```bash
docker compose restart api frontend
curl http://localhost:8000/health
```

## Restore Drill

At least once per month, restore the newest backup into a disposable database or temporary development machine and confirm:

- `/health` returns `ok: true`
- constituent cases load
- events load
- legislation loads
- audit logs are present

Do not test restores against the live production database unless you intend to replace the live data.
