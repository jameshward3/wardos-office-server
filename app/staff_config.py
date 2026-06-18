import json
from pathlib import Path


CONTAINER_CONFIG_PATH = Path("/app/data/config/staff_users.json")
LOCAL_CONFIG_PATH = Path("data/config/staff_users.json")


ROLE_LABELS = {
    "admin": "Administrator",
    "strategy_advisor": "Strategy Advisor",
}


def load_staff_config() -> dict:
    path = CONTAINER_CONFIG_PATH if CONTAINER_CONFIG_PATH.exists() else LOCAL_CONFIG_PATH
    if not path.exists():
        return {"staff_users": [], "roles": ROLE_LABELS}
    with path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)
    config.setdefault("staff_users", [])
    config.setdefault("roles", ROLE_LABELS)
    return config
