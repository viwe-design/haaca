from __future__ import annotations

from typing import Final

DOMAIN: Final = "ai_home_auditor"

CONF_API_KEY: Final = "api_key"
CONF_BASE_URL: Final = "base_url"
CONF_MODEL: Final = "model"
CONF_DRY_RUN: Final = "dry_run"
CONF_AUTO_FIX: Final = "auto_fix"
CONF_AUTO_FIX_ALLOWLIST: Final = "auto_fix_allowlist"
CONF_DAILY_AUDIT: Final = "daily_audit"

DEFAULT_BASE_URL: Final = "https://api.openai.com/v1"
DEFAULT_MODEL: Final = "gpt-4o-mini"
DEFAULT_DRY_RUN: Final = True
DEFAULT_AUTO_FIX: Final = False
DEFAULT_DAILY_AUDIT: Final = True
DEFAULT_AUTO_FIX_ALLOWLIST: Final = [
    "broken_entity_id",
    "deprecated_syntax",
    "invalid_service_call",
]

STORAGE_VERSION: Final = 1
REPORT_STORE_KEY: Final = f"{DOMAIN}.reports"
BACKUP_DIR_NAME: Final = DOMAIN

SERVICE_SCAN: Final = "scan"
SERVICE_ANALYZE: Final = "analyze"
SERVICE_PREVIEW_FIX: Final = "preview_fix"
SERVICE_APPLY_FIX: Final = "apply_fix"
SERVICE_ROLLBACK: Final = "rollback"
SERVICE_ISSUE_ACTION: Final = "issue_action"
