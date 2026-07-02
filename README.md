# WardOS Office Server

Local-first AI office server for a single Mac mini. It runs n8n, Postgres, and a Python FastAPI backend with folder-based document intake, agent prompt folders, a daily briefing generator, and starter tracker skeletons.

This repo uses sample data only. It does not auto-send emails, publish posts, or contact constituents.

## Protection Layers

WardOS now includes a first hardening pass across these layers:

- Front end foundations: security headers, private route middleware, no-store session responses, logout cookie clearing
- APIs and backend logic: stricter request validation, request IDs, request logging, guarded write routes, safer export handling
- Database and storage: added operational indexes for search and timeline queries, durable Postgres-first persistence, export row caps
- Auth and permissions: staff/admin route dependencies for sensitive reads and writes, bearer-token support for remote API access, local-network allowance for trusted local operation
- Hosting and deployment: health checks in Docker Compose, stricter proxy timeouts, safer nginx defaults
- Security and row protections: app-layer access control around constituent, memory, staff, and audit data
- Rate limiting: fixed-window API throttling plus login throttling on the hosted frontend
- Error tracking and logs: request summaries with request IDs, consistent no-store behavior on sensitive endpoints
- Availability and recovery: health-checked services plus existing backup/export flows for recovery

This is a strong baseline, not the last word. Managed secret rotation, centralized logging, and database-native row-level security are still recommended for a larger production rollout.

## What Is Included

- Docker Compose for local services
- n8n workflow server at `http://localhost:5678`
- Postgres database for office trackers
- FastAPI backend at `http://localhost:8000`
- WardOS dashboard frontend at `http://localhost:3000`
- Ollama integration setting for local Mac models
- Folder-based document intake under `data/`
- Agent prompt folders under `agents/`
- Daily briefing endpoint
- Constituent case tracker skeleton
- Legislation tracker skeleton
- Budget watch skeleton

## Requirements

- macOS on the Mac mini
- Docker Desktop
- Ollama, if you want local model calls later

## Setup

1. Copy and edit secrets:

```bash
cp .env.example .env
```

2. Start Ollama on the Mac mini, if you plan to use local models:

```bash
ollama serve
ollama pull llama3.1
```

3. Start the local office stack:

```bash
docker compose up -d --build
```

4. Set security values before any remote exposure:

```bash
POSTGRES_PASSWORD=replace-with-the-current-local-db-password
API_BEARER_TOKEN=replace-with-a-long-random-token
SECRET_KEY=replace-with-a-different-long-random-secret
ALLOW_LOCAL_UNSAFE_REQUESTS=true
```

Local browser use can keep `ALLOW_LOCAL_UNSAFE_REQUESTS=true`; WardOS now only applies that bypass to loopback/trusted local hosts, not the whole private network. If you expose the FastAPI server beyond the Mac mini, set `ALLOW_LOCAL_UNSAFE_REQUESTS=false`, set `APP_ENV=production`, and require bearer auth for sensitive routes.

Docker Compose binds Postgres, FastAPI, n8n, and the frontend to `127.0.0.1` by default. Change `POSTGRES_BIND`, `API_BIND`, `N8N_BIND`, or `FRONTEND_BIND` only when you intentionally want another machine to reach that service.

4. Optional: seed database sample rows only when intentionally working in sample mode.

First set `SAMPLE_MODE=true` in `.env`, then restart the API container and run:

```bash
docker compose up -d --build api
docker compose exec api python scripts/seed_sample_data.py
```

## Test

```bash
curl http://localhost:8000/health
curl http://localhost:8000/briefing/daily
curl http://localhost:8000/documents
curl http://localhost:8000/cases
curl http://localhost:8000/legislation
curl http://localhost:8000/budget-watch
curl http://localhost:8000/ollama/status
curl http://localhost:8000/weather/today
curl http://localhost:8000/dashboard/overview
curl http://localhost:8000/system/status
curl http://localhost:8000/memory/database
curl -X POST http://localhost:8000/memory/database/export
curl http://localhost:8000/council-meetings
curl http://localhost:8000/city-calendar
curl http://localhost:8000/city-bulletins
```

Remote or scripted writes should include the bearer token once `ALLOW_LOCAL_UNSAFE_REQUESTS=false`:

```bash
curl -H "Authorization: Bearer $API_BEARER_TOKEN" -X POST http://localhost:8000/memory/database/sync
```

Open WardOS:

```text
http://localhost:3000
```

Open n8n:

```text
http://localhost:5678
```

Backups and restore drills are documented in [docs/backup_restore.md](/Users/jamesward/Documents/Codex/2026-06-02/build-me-a-local-ai-office/wardos-office-server/docs/backup_restore.md).

## Recovery and Safety

- Postgres data persists in `data/postgres/`
- Constituent case CSV exports remain available through `GET /cases/export.csv`
- Unified memory exports remain available through `POST /memory/database/export`
- Google Sheet sync remains a readable recovery layer, not the system of record
- Docker health checks now watch Postgres, the API, and the local frontend

Create a local backup:

```bash
./scripts/backup_postgres.sh
```

## Constituent Imports

WardOS supports local-only constituent imports for voter or outreach subgroups. Voter files should stay in `data/constituents/`, which is ignored by git so personally identifiable voter data is not published with the app.

The citywide Orange active voter file is stored locally as:

```text
data/constituents/orange_active_voters_citywide.xlsx
```

Import or refresh the full citywide active voter file:

```bash
docker compose exec api python scripts/import_citywide_active_voters.py /app/data/constituents/orange_active_voters_citywide.xlsx
```

WardOS keeps the full city list searchable and uses the `Ward` column as the ward marker. South Ward voters are marked as the local constituent list with subgroup `Orange Active Voters - South Ward`; voters in East, North, or West remain searchable and are tagged in notes as outside the local South Ward.

Check the full list and South Ward filter:

```bash
curl http://localhost:8000/constituents/summary
curl "http://localhost:8000/constituents?ward=South&limit=25"
curl "http://localhost:8000/constituents?q=Washington&limit=25"
```

The May 2026 South Ward mail-in voter file is stored locally as:

```text
data/constituents/mailin_voters_may_2026_south_ward.csv
```

Import or refresh it into Postgres:

```bash
./scripts/import_mailin_voters_may_2026.sh
```

Check the imported subgroup:

```bash
curl http://localhost:8000/constituents/summary
curl "http://localhost:8000/constituents?subgroup=May%202026%20Mail-In%20Voters&limit=25"
```

This import creates constituent profile records only. WardOS does not auto-send emails, texts, mail, or social posts.

## WardOS Memory Database

WardOS keeps durable operational memory in Postgres and can export a Google-Sheets-readable memory database for review, recovery, and staff workflows.

The configured Google Sheet is:

```text
https://docs.google.com/spreadsheets/d/1X6RwweEwqRSXII27hlmn8Qed8gSQuahaY40EA32XFE4/edit
```

The memory database covers:

- Constituents
- Constituent needs and cases
- Events
- Reports and documents
- Legislation
- Budget watch items
- Development projects
- Media monitor mentions
- Public safety incidents
- Office actions
- Source connections
- Staff users

Create or refresh the unified memory table:

```bash
curl -X POST http://localhost:8000/memory/database/sync
```

Export Excel-readable CSV files:

```bash
curl -X POST http://localhost:8000/memory/database/export
```

Download exports:

```text
http://localhost:8000/memory/database/export/all_memory_items.csv
http://localhost:8000/memory/database/export/constituent_needs.csv
http://localhost:8000/memory/database/export/events.csv
http://localhost:8000/memory/database/export/legislation.csv
```

Check the Google Sheet connection:

```bash
curl http://localhost:8000/memory/database/google-sheet
```

Write the live Google Sheet through the Google Sheets API:

```bash
curl -X POST http://localhost:8000/memory/database/google-sheet/sync
```

A Google-Sheets-ready workbook template with tabs, headers, formulas, lookups, audit log, and Apps Script macro text is generated at:

```text
../outputs/wardos_memory_workbook/wardos_memory_database_template.xlsx
```

Import it into the blank Google Sheet, then paste the macro text from the `Apps Script Macros` tab into Google Sheets `Extensions > Apps Script` if you want a manual `WardOS > Refresh Memory Exports` menu. Google-side writing requires either a signed-in browser import or service account credentials configured through `WARDOS_GOOGLE_SERVICE_ACCOUNT_JSON` or `WARDOS_GOOGLE_SERVICE_ACCOUNT_FILE`.

Postgres remains the source of truth. The Google Sheet is the readable review and recovery layer. WardOS does not use the sheet to auto-send emails, texts, posts, or external actions.

### Google Sheets API Setup

Use this route for durable live Sheet updates without browser automation:

1. In Google Cloud, enable the Google Sheets API.
2. Create a service account for WardOS.
3. Create and download a JSON key for that service account.
4. Copy the service account email from the JSON, usually the `client_email` value.
5. Share the WardOS Google Sheet with that service account email as `Editor`.
6. Store the credential in `.env` using one of these options:

```text
WARDOS_GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

or:

```text
WARDOS_GOOGLE_SERVICE_ACCOUNT_FILE=/app/data/secrets/wardos-google-service-account.json
```

The file path option is recommended for local Mac mini use. Put the JSON file under `data/secrets/`; that folder is ignored by git.

If an environment host does not handle multi-line JSON well, base64-encode the JSON and place the encoded value in `WARDOS_GOOGLE_SERVICE_ACCOUNT_JSON`. WardOS accepts either raw JSON or base64 JSON.

7. Rebuild the API container so the Google client libraries are installed:

```bash
docker compose up -d --build api
```

8. Check writer readiness:

```bash
curl http://localhost:8000/memory/database/google-sheet
```

9. Sync WardOS memory into the live Google Sheet:

```bash
curl -X POST http://localhost:8000/memory/database/google-sheet/sync
```

The sync creates and refreshes these WardOS-managed tabs: `README`, `Dashboard`, `Memory Index`, `Constituents`, `Constituent Needs`, `Events`, `Reports Documents`, `Legislation`, `Budget Watch`, `Development`, `Media Monitor`, `Public Safety`, `Office Actions`, `Sources`, `Staff`, `Lookups`, and `Audit Log`.

## Frontend

The dashboard lives in `frontend/` and is served as a local static app by Nginx. It includes:

- Home operations dashboard
- Daily briefing page
- Constituent profile and case timeline
- Manual constituent need entry
- Manual legislation entry
- Budget watch entry
- Media monitor and draft-only response workspace
- Future external interaction slots for staff-approved workflows

The frontend uses same-origin `/api` as its default API URL. Docker Compose routes `/api` through Nginx to the FastAPI container, so every device that opens the Mac mini frontend talks to the same shared Postgres-backed API.

For another device on the same network, open WardOS using the Mac mini address, for example:

```text
http://mac-mini.local:3000
```

Do not use `localhost:3000` on another device unless WardOS is running on that device too.

## Vercel Frontend For `wardos.jw4o.com`

A separate private Next.js frontend for Vercel lives in:

```text
wardos-frontend-vercel/
```

Use it when deploying WardOS to:

```text
https://wardos.jw4o.com
```

This deployment is password protected with `WARDOS_SITE_PASSWORD` and does not change the public Squarespace website at:

```text
https://jw4o.com
```

See `wardos-frontend-vercel/README.md` for Vercel and Squarespace DNS steps.

## Weather

The Home header weather widget reads:

```bash
curl http://localhost:8000/weather/today
```

It uses Open-Meteo for Orange, NJ current conditions and today’s high/low temperatures. WardOS refreshes the live weather reading hourly, caches successful pulls locally in `data/weather_cache`, and shows the latest cache or sample fallback data if the Mac mini is offline.

## Maps

WardOS uses OpenStreetMap tiles through Leaflet for detailed street-level maps. The Home South Ward map and Media Monitor Orange Pulse map both:

- show all four Orange wards as overlays
- default the view into the South Ward
- keep South Ward highlighted
- layer WardOS issue/media markers on top

The current ward polygons load from:

```text
frontend/assets/orange_wards_approx.geojson
```

This file is approximate overlay data derived from the ward reference map. If the City publishes official ward boundary GeoJSON, replace this asset with the official file and keep the ward names in each feature's `ward` property.

## GitHub Data Integrations

WardOS reads these public GitHub repos as local dashboard sources:

- `jameshward3/OrangeBudgetDashboard` -> city budget history from `historical_budget_dataset.json`
- `jameshward3/Progress` -> personal progress in office from `metrics.json`
- `jameshward3/Legislative_tracker` -> ongoing legislation and policy tracker data from `metrics.json`

API endpoints:

```bash
curl http://localhost:8000/integrations/github/sources
curl http://localhost:8000/integrations/github/budget
curl http://localhost:8000/integrations/github/progress
curl http://localhost:8000/integrations/github/legislation
curl http://localhost:8000/integrations/github/office
```

These integrations are read-only. Successful pulls are cached locally in `data/github_cache`, so the dashboard can keep showing the latest cached copy if GitHub is temporarily unavailable.

For higher GitHub API limits, add a token to `.env`:

```text
GITHUB_TOKEN=your_token_here
```

## Orange City Council Meeting Sync

WardOS fetches Orange City Council meeting updates from:

```text
https://orangetwpnjcc.org/meetings/2026-meetings-2/
```

Docker Compose includes a `council_meetings_sync` service that runs the fetch once at startup, then every 24 hours. The interval is controlled by:

```env
WARDOS_COUNCIL_MEETINGS_SYNC_SECONDS=86400
```

The fetcher parses dated meeting sections, agenda/minutes links, and ordinance/resolution document links. It caches normalized source data locally at:

```text
data/council_meetings/latest.json
```

It also upserts the meetings into the WardOS `events` table so the dashboard can show upcoming council meetings. Meeting times are not invented; if the source page does not list a time, WardOS records the meeting date and notes that the time was not listed.

Manual sync:

```bash
docker compose exec api python scripts/fetch_council_meetings.py
```

API endpoints:

```bash
curl http://localhost:8000/council-meetings
curl -X POST http://localhost:8000/council-meetings/sync
curl http://localhost:8000/events
```

## City Calendar Sync

WardOS also checks the City of Orange Township calendar every day:

```text
https://orangenj.gov/Calendar.aspx
```

The `city_calendar_sync` Docker Compose service fetches CivicPlus iCalendar feeds for council meetings, boards and commissions, planning, zoning, city events, recreation, cultural affairs, older adults, library board meetings, and related committees. It runs once at startup and then every 24 hours.

The interval is controlled by:

```env
WARDOS_CITY_CALENDAR_SYNC_SECONDS=86400
```

Normalized calendar data is cached locally at:

```text
data/city_calendar/latest.json
```

The sync also upserts each event into the WardOS `events` table using the CivicPlus event UID, so updates do not create duplicates.

Manual sync:

```bash
docker compose exec api python scripts/fetch_city_calendar.py
```

API endpoints:

```bash
curl http://localhost:8000/city-calendar
curl -X POST http://localhost:8000/city-calendar/sync
curl http://localhost:8000/events
```

## City Homepage Bulletin Sync

WardOS checks the City of Orange Township homepage every day for public bulletins and alerts:

```text
https://orangenj.gov/
```

The `city_bulletins_sync` Docker Compose service captures homepage emergency alerts and CivicAlerts bulletin links, dedupes them, stores a local cache, and upserts them into the `city_bulletins` table. It runs once at startup and then every 24 hours.

The interval is controlled by:

```env
WARDOS_CITY_BULLETINS_SYNC_SECONDS=86400
```

Normalized bulletin data is cached locally at:

```text
data/city_bulletins/latest.json
```

Manual sync:

```bash
docker compose exec api python scripts/fetch_city_bulletins.py
```

API endpoints:

```bash
curl http://localhost:8000/city-bulletins
curl -X POST http://localhost:8000/city-bulletins/sync
```

## Development Watch Sync

WardOS checks the official Planning Board and Zoning Board pages every day for meetings, agendas, notices, applications, resolutions, minutes, and redevelopment records:

```text
https://orangetwpnjcc.org/boards-commissions/planning-board/
https://orangetwpnjcc.org/boards-commissions/zoning-board-of-adjustment/
```

The `development_watch_sync` Docker Compose service runs once at startup and then every 24 hours.

The interval is controlled by:

```env
WARDOS_DEVELOPMENT_WATCH_SYNC_SECONDS=86400
```

Normalized source data is cached locally at:

```text
data/development_watch/latest.json
```

The sync upserts board meetings into the `events` table and source-linked application, notice, resolution, and redevelopment records into the `development_projects` table. WardOS does not invent missing meeting times; if a source page only lists a date, the record keeps the official date and stores a note that no time was listed.

Manual sync:

```bash
docker compose exec api python scripts/fetch_development_watch.py
```

API endpoints:

```bash
curl http://localhost:8000/development-watch
curl -X POST http://localhost:8000/development-watch/sync
curl http://localhost:8000/development-projects
curl http://localhost:8000/events
```

## Folder Intake

Drop documents into these local folders:

- `data/inbox`
- `data/agendas`
- `data/minutes`
- `data/constituent_cases`
- `data/legislation`
- `data/ward_report`
- `data/budget`

The daily briefing endpoint lists what is waiting for review. Summarization and routing can be added in n8n after staff approval rules are defined.

Index dropped files into Postgres:

```bash
curl -X POST http://localhost:8000/documents/index
curl http://localhost:8000/document-records
```

## Operational Mode

By default, WardOS runs with:

```text
SAMPLE_MODE=false
```

In this mode the API and frontend do not inject demo rows. Dashboard panels start empty until real cases, meetings, documents, media mentions, source connections, legislation, budget items, and development projects are added or synced.

Core operational endpoints:

```bash
curl http://localhost:8000/dashboard/overview
curl http://localhost:8000/system/status
curl http://localhost:8000/events
curl http://localhost:8000/development-projects
curl http://localhost:8000/media-mentions
curl http://localhost:8000/source-connections
curl http://localhost:8000/office-actions
curl http://localhost:8000/audit-log
```

## Durable Postgres Database

WardOS uses Postgres as the active shared database. The old temporary SQLite file is kept only as a local archive at:

```text
data/local_dev/wardos-local.db
```

To reconcile archived SQLite data into Postgres, run:

```bash
docker compose exec api python scripts/migrate_sqlite_to_postgres.py
```

The migration is idempotent: existing rows are skipped so it can be safely rerun without duplicating constituents, events, media mentions, or configured sources.

## Staff & Roles

Local staff users live in:

```text
data/config/staff_users.json
```

Configured sample office roles:

- James Ward, `james@jameswardfororange.com`, `admin`
- Jamar Young, `Manager@jameswardfororange.com`, `strategy_advisor`

Import the configured staff users into the local database:

```bash
curl -X POST http://localhost:8000/staff/import-users
curl http://localhost:8000/staff/users
```

This does not send invites or emails. It only creates local role records for future assignment, approval, and authentication work.

## Media Sources

The Media Monitor source plan lives at:

```text
data/config/media_sources.json
```

View the configured source plan:

```bash
curl http://localhost:8000/media-monitor/config
```

Import configured sources into the operational `source_connections` table:

```bash
curl -X POST http://localhost:8000/media-monitor/import-sources
curl http://localhost:8000/source-connections
```

Import behavior:

- public URLs and RSS feeds are marked `configured`
- Facebook, Instagram, Threads, and other login-dependent sources are marked `needs_credentials`
- agenda/minutes sources without a direct URL are marked `manual_intake`
- no source auto-posts, auto-sends, or publishes anything

Current priority source pointers:

- Orange NJ Real Talk: `https://www.facebook.com/groups/OrangeNJRealTalk/`
- Seven Oaks Society: `https://www.facebook.com/sevenoakssociety/`
- Local Talk Weekly: `https://localtalkweekly.com/`
- Essex Review: `https://essexreview.com/`
- East Orange Record Transcript: `https://essexnewsdaily.com/category/news/eastorange/`
- Essex News Daily: `https://essexnewsdaily.com/`
- NJ.com: `https://www.nj.com/`

Highlighted Media Monitor stories are ranked toward Orange, NJ, South Ward, and City of Orange Township terms before broader Essex County stories.

The `media_mentions_sync` Docker Compose service checks configured public RSS feeds once at startup and then every hour by default. The interval is controlled by:

```env
WARDOS_MEDIA_SYNC_SECONDS=3600
```

Normalized RSS media data is cached locally at:

```text
data/media_monitor/latest.json
```

Manual media sync:

```bash
docker compose exec api python scripts/fetch_media_mentions.py
```

API endpoints:

```bash
curl http://localhost:8000/media-monitor
curl http://localhost:8000/media-monitor/latest-rss
curl -X POST http://localhost:8000/media-monitor/sync
curl http://localhost:8000/media-mentions
```

The Media Monitor page includes an `Import Sources` control that calls the same import endpoint.

Create examples:

```bash
curl -X POST http://localhost:8000/events \
  -H "Content-Type: application/json" \
  -d '{"title":"Council Meeting","location":"Council Chambers","event_type":"meeting"}'

curl -X POST http://localhost:8000/media-mentions \
  -H "Content-Type: application/json" \
  -d '{"source":"Local Source","source_type":"news","headline":"Headline","summary":"Summary","topic":"Traffic","sentiment":"neutral"}'
```

## Agent Prompts

Agent prompt folders live in `agents/`:

- `chief_of_staff`
- `legislative_director`
- `constituent_services`
- `communications_director`
- `budget_analyst`
- `development_watchdog`
- `research_assistant`

These are prompts only. They do not send emails or take outside action.

## Local-First Rules

- Store secrets in `.env`.
- Keep real documents in local `data/` folders.
- Use `America/New_York` timezone.
- Treat generated communications as drafts only.
- Do not add auto-send email workflows without explicit staff approval.
- Use sample data until real office data is intentionally added.

## Ollama Notes

The API container is configured with:

```text
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

That lets containers reach Ollama running on the Mac mini host. n8n can use the same base URL in HTTP Request nodes or Ollama community nodes.

## Backup

Create a local Postgres backup:

```bash
./scripts/backup_postgres.sh
```

Backups are written to `data/backups/`.

## Recreate Scaffold

The requested command file is included at:

```text
setup_scaffold.sh
```

Run it from the parent directory if you ever want to recreate the initial empty folder structure.

## Notes

n8n recommends Docker for self-hosting, Ollama supports macOS local models, and Codex can read, edit, and run code locally in the selected directory.
