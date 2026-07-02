from app import council_meetings


def test_parse_council_meetings_extracts_documents():
    html = """
    <html>
      <body>
        <h4>January 7, 2026</h4>
        <p>Regular meeting agenda and materials.</p>
        <a href="/docs/regular-agenda.pdf">Regular Agenda</a>
        <a href="/docs/ord-12-26-parking.pdf">ORD-12-26 Parking Reform Ordinance</a>
      </body>
    </html>
    """

    meetings = council_meetings.parse_council_meetings(html, "https://example.test/meetings/")

    assert len(meetings) == 1
    assert meetings[0]["date"] == "2026-01-07"
    assert meetings[0]["status"] == "posted"
    assert [document["document_type"] for document in meetings[0]["documents"]] == ["agenda", "ordinance"]


def test_extract_legislation_items_uses_stable_source_ids(tmp_path, monkeypatch):
    monkeypatch.setattr(council_meetings, "LEGISLATION_CACHE_PATH", tmp_path / "legislation" / "latest.json")
    payload = {
        "source_url": "https://example.test/meetings/",
        "fetched_at": "2026-01-08T00:00:00",
        "meetings": [
            {
                "date": "2026-01-07",
                "title": "Orange City Council Meeting - January 07, 2026",
                "location": "Orange City Council",
                "source_url": "https://example.test/meetings/",
                "summary": "Ordinances - 1 first reading",
                "documents": [
                    {
                        "title": "ORD-12-26 Parking Reform Ordinance",
                        "url": "https://example.test/docs/ord-12-26-parking.pdf",
                        "document_type": "ordinance",
                    },
                    {
                        "title": "Meeting Minutes",
                        "url": "https://example.test/docs/minutes.pdf",
                        "document_type": "minutes",
                    },
                ],
            }
        ],
    }

    legislation = council_meetings.extract_legislation_items(payload)

    assert legislation["item_count"] == 1
    item = legislation["items"][0]
    assert item["bill_number"] == "ORD-12-26"
    assert item["status"] == "first_reading"
    assert item["hearing_date"] == "2026-01-07"
    assert item["source_id"].startswith("orange-legislation-2026-01-07-")
