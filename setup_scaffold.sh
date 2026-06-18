#!/bin/bash
set -e

mkdir -p wardos-office-server
cd wardos-office-server

mkdir -p app
mkdir -p data/inbox
mkdir -p data/agendas
mkdir -p data/minutes
mkdir -p data/constituent_cases
mkdir -p data/ward_report
mkdir -p data/budget
mkdir -p data/backups

mkdir -p agents/chief_of_staff
mkdir -p agents/legislative_director
mkdir -p agents/constituent_services
mkdir -p agents/communications_director
mkdir -p agents/budget_analyst
mkdir -p agents/development_watchdog
mkdir -p agents/research_assistant

touch .env
touch README.md
touch docker-compose.yml
touch app/main.py
touch app/requirements.txt
touch app/briefing.py
touch app/database.py
touch app/models.py
touch app/settings.py

