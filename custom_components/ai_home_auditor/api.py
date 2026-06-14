from __future__ import annotations

from typing import Any

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .coordinator import AIHomeAuditorCoordinator


def async_setup_api(hass: HomeAssistant) -> None:
    hass.http.register_view(AIHomeAuditorReportView(hass))
    hass.http.register_view(AIHomeAuditorScanView(hass))
    hass.http.register_view(AIHomeAuditorAnalyzeView(hass))
    hass.http.register_view(AIHomeAuditorPreviewFixView(hass))
    hass.http.register_view(AIHomeAuditorApplyFixView(hass))
    hass.http.register_view(AIHomeAuditorBackupsView(hass))
    hass.http.register_view(AIHomeAuditorRollbackView(hass))
    hass.http.register_view(AIHomeAuditorIssueActionView(hass))


def _coordinator(hass: HomeAssistant) -> AIHomeAuditorCoordinator:
    coordinators = hass.data.get(DOMAIN, {})
    for key, value in coordinators.items():
        if not str(key).startswith("_"):
            return value
    raise web.HTTPNotFound(reason="AI Home Auditor is not configured")


class AIHomeAuditorReportView(HomeAssistantView):
    url = "/api/ai_home_auditor/report"
    name = "api:ai_home_auditor:report"

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request) -> web.Response:
        return self.json(await _coordinator(self._hass).async_get_report())


class AIHomeAuditorScanView(HomeAssistantView):
    url = "/api/ai_home_auditor/scan"
    name = "api:ai_home_auditor:scan"

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request) -> web.Response:
        return self.json(await _coordinator(self._hass).async_scan())


class AIHomeAuditorAnalyzeView(HomeAssistantView):
    url = "/api/ai_home_auditor/analyze"
    name = "api:ai_home_auditor:analyze"

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request) -> web.Response:
        return self.json(await _coordinator(self._hass).async_analyze())


class AIHomeAuditorPreviewFixView(HomeAssistantView):
    url = "/api/ai_home_auditor/preview_fix"
    name = "api:ai_home_auditor:preview_fix"

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request) -> web.Response:
        body = await _json(request)
        preview = await _coordinator(self._hass).fixer.async_preview_file_change(
            relative_path=str(body["relative_path"]),
            new_content=str(body["new_content"]),
        )
        return self.json(preview)


class AIHomeAuditorApplyFixView(HomeAssistantView):
    url = "/api/ai_home_auditor/apply_fix"
    name = "api:ai_home_auditor:apply_fix"

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request) -> web.Response:
        body = await _json(request)
        result = await _coordinator(self._hass).fixer.async_apply_file_change(
            relative_path=str(body["relative_path"]),
            new_content=str(body["new_content"]),
            confirmed=bool(body.get("confirmed")),
        )
        return self.json(result)


class AIHomeAuditorBackupsView(HomeAssistantView):
    url = "/api/ai_home_auditor/backups"
    name = "api:ai_home_auditor:backups"

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request) -> web.Response:
        backups = await _coordinator(self._hass).backup_manager.async_list_backups()
        return self.json({"backups": backups})


class AIHomeAuditorRollbackView(HomeAssistantView):
    url = "/api/ai_home_auditor/rollback"
    name = "api:ai_home_auditor:rollback"

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request) -> web.Response:
        body = await _json(request)
        result = await _coordinator(self._hass).backup_manager.async_restore(
            backup_id=str(body["backup_id"])
        )
        return self.json({"restored": True, "backup": result})


class AIHomeAuditorIssueActionView(HomeAssistantView):
    url = "/api/ai_home_auditor/issue_action"
    name = "api:ai_home_auditor:issue_action"

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def post(self, request: web.Request) -> web.Response:
        body = await _json(request)
        try:
            result = await _coordinator(self._hass).async_issue_action(
                issue_id=str(body["issue_id"]),
                action=str(body["action"]),
                note=str(body["note"]) if body.get("note") else None,
            )
        except (KeyError, ValueError) as err:
            raise web.HTTPBadRequest(reason=str(err)) from err
        return self.json(result)


async def _json(request: web.Request) -> dict[str, Any]:
    try:
        body = await request.json()
    except ValueError as err:
        raise web.HTTPBadRequest(reason="Invalid JSON body") from err
    if not isinstance(body, dict):
        raise web.HTTPBadRequest(reason="JSON body must be an object")
    return body
