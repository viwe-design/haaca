from __future__ import annotations

import logging
from datetime import timedelta
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import frontend
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.event import async_track_time_interval

from .api import async_setup_api
from .const import (
    CONF_DAILY_AUDIT,
    DEFAULT_DAILY_AUDIT,
    DOMAIN,
    SERVICE_ANALYZE,
    SERVICE_APPLY_FIX,
    SERVICE_PREVIEW_FIX,
    SERVICE_ROLLBACK,
    SERVICE_SCAN,
)
from .coordinator import AIHomeAuditorCoordinator

LOGGER = logging.getLogger(__name__)

SERVICE_SCHEMA_FILE_CHANGE = vol.Schema(
    {
        vol.Required("relative_path"): cv.string,
        vol.Required("new_content"): cv.string,
    }
)

SERVICE_SCHEMA_APPLY_FIX = SERVICE_SCHEMA_FILE_CHANGE.extend(
    {vol.Required("confirmed", default=False): cv.boolean}
)

SERVICE_SCHEMA_ROLLBACK = vol.Schema({vol.Required("backup_id"): cv.string})


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coordinator = AIHomeAuditorCoordinator(hass, entry)
    await coordinator.async_load()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = coordinator

    if not hass.data[DOMAIN].get("_api_registered"):
        async_setup_api(hass)
        await _async_register_panel(hass)
        _async_register_services(hass)
        hass.data[DOMAIN]["_api_registered"] = True

    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    _async_register_daily_audit(entry, coordinator)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    remaining_entries = [
        key for key in hass.data.get(DOMAIN, {}) if not str(key).startswith("_")
    ]
    if not remaining_entries:
        hass.data.pop(DOMAIN, None)
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


def _async_register_services(hass: HomeAssistant) -> None:
    async def scan(call: ServiceCall) -> dict[str, Any]:
        return await _coordinator(hass).async_scan()

    async def analyze(call: ServiceCall) -> dict[str, Any]:
        return await _coordinator(hass).async_analyze()

    async def preview_fix(call: ServiceCall) -> dict[str, Any]:
        return await _coordinator(hass).fixer.async_preview_file_change(
            relative_path=call.data["relative_path"],
            new_content=call.data["new_content"],
        )

    async def apply_fix(call: ServiceCall) -> dict[str, Any]:
        return await _coordinator(hass).fixer.async_apply_file_change(
            relative_path=call.data["relative_path"],
            new_content=call.data["new_content"],
            confirmed=call.data["confirmed"],
        )

    async def rollback(call: ServiceCall) -> dict[str, Any]:
        backup = await _coordinator(hass).backup_manager.async_restore(
            call.data["backup_id"]
        )
        return {"restored": True, "backup": backup}

    hass.services.async_register(
        DOMAIN,
        SERVICE_SCAN,
        scan,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_ANALYZE,
        analyze,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_PREVIEW_FIX,
        preview_fix,
        schema=SERVICE_SCHEMA_FILE_CHANGE,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_APPLY_FIX,
        apply_fix,
        schema=SERVICE_SCHEMA_APPLY_FIX,
        supports_response=SupportsResponse.ONLY,
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_ROLLBACK,
        rollback,
        schema=SERVICE_SCHEMA_ROLLBACK,
        supports_response=SupportsResponse.ONLY,
    )


def _async_register_daily_audit(
    entry: ConfigEntry, coordinator: AIHomeAuditorCoordinator
) -> None:
    if not coordinator.options.get(CONF_DAILY_AUDIT, DEFAULT_DAILY_AUDIT):
        return

    async def run_daily_audit(now: Any) -> None:
        try:
            await coordinator.async_run_scheduled_audit()
        except Exception:
            LOGGER.exception("Scheduled AI Home Auditor analysis failed")

    entry.async_on_unload(
        async_track_time_interval(
            coordinator.hass,
            run_daily_audit,
            timedelta(days=1),
        )
    )


async def _async_register_panel(hass: HomeAssistant) -> None:
    dist_dir = Path(__file__).parent / "frontend" / "dist"
    module_path = dist_dir / "panel.js"
    if not module_path.exists():
        LOGGER.warning("AI Home Auditor frontend bundle is missing at %s", module_path)
        return

    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(
                url_path="/ai_home_auditor_static",
                path=str(dist_dir),
                cache_headers=False,
            )
        ]
    )

    frontend.async_register_built_in_panel(
        hass,
        component_name="custom",
        sidebar_title="AI Аудитор",
        sidebar_icon="mdi:brain",
        frontend_url_path=DOMAIN,
        require_admin=True,
        config={
            "_panel_custom": {
                "name": "ai-home-auditor-panel",
                "js_url": "/ai_home_auditor_static/panel.js",
                "embed_iframe": False,
                "trust_external_script": True,
            }
        },
    )


def _coordinator(hass: HomeAssistant) -> AIHomeAuditorCoordinator:
    for key, value in hass.data.get(DOMAIN, {}).items():
        if not str(key).startswith("_"):
            return value
    raise RuntimeError("AI Home Auditor is not configured")
