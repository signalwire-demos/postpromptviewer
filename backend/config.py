import os
from pathlib import Path

# Database file lives in the project root
BASE_DIR = Path(__file__).resolve().parent.parent
DB_PATH = os.environ.get("PIE_DB_PATH", str(BASE_DIR / "pie.db"))
DATABASE_URL = f"sqlite+aiosqlite:///{DB_PATH}"

# Webhook HTTP Basic Auth (optional, format: "user:password")
# Set PIE_WEBHOOK_AUTH="myuser:mypassword" to require auth on ingest endpoints.
# When set, SignalWire post_url should use: https://myuser:mypassword@yourdomain/api/v1/ingest/webhook
WEBHOOK_AUTH = os.environ.get("PIE_WEBHOOK_AUTH", "")
