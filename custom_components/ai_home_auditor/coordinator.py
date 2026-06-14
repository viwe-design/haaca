from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.storage import Store

from .ai_analyzer import AIAnalyzer
from .backup import BackupManager
from .const import CONF_API_KEY, CONF_DAILY_AUDIT, REPORT_STORE_KEY, STORAGE_VERSION
from .fixer import Fixer
from .scanner import HomeAssistantScanner
from .validator import ConfigValidator

LOGGER = logging.getLogger(__name__)


class AIHomeAuditorCoordinator:
    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self.entry = entry
        self.store = Store(hass, STORAGE_VERSION, REPORT_STORE_KEY)
        self.scanner = HomeAssistantScanner(hass)
        self.backup_manager = BackupManager(hass)
        self.validator = ConfigValidator(hass)
        options = self.options
        self.fixer = Fixer(hass, self.backup_manager, self.validator, options)
        self._last_scan: dict[str, Any] | None = None
        self._last_report: dict[str, Any] | None = None
        self._schedule_status: dict[str, Any] = {}
        self._issue_actions: dict[str, dict[str, Any]] = {}

    @property
    def options(self) -> dict[str, Any]:
        return {
            **self.entry.data,
            **self.entry.options,
        }

    async def async_load(self) -> None:
        data = await self.store.async_load()
        if isinstance(data, dict):
            self._last_report = data.get("last_report")
            schedule_status = data.get("schedule_status")
            if isinstance(schedule_status, dict):
                self._schedule_status = schedule_status
            issue_actions = data.get("issue_actions")
            if isinstance(issue_actions, dict):
                self._issue_actions = issue_actions

    async def async_scan(self) -> dict[str, Any]:
        self._last_scan = await self.scanner.async_scan()
        return self._last_scan

    async def async_analyze(self) -> dict[str, Any]:
        if self._last_scan is None:
            await self.async_scan()
        session = async_get_clientsession(self.hass)
        analyzer = AIAnalyzer(
            session=session,
            options={
                **self.options,
                CONF_API_KEY: self.entry.data.get(CONF_API_KEY, ""),
            },
        )
        report = await analyzer.async_analyze(self._last_scan or {})
        self._last_report = report.as_dict()
        await self._async_save_state()
        return self._last_report

    async def async_issue_action(
        self, issue_id: str, action: str, note: str | None = None
    ) -> dict[str, Any]:
        if action not in {"ignore", "fix", "recheck", "review"}:
            raise ValueError("Unsupported issue action")

        issue = self._find_issue(issue_id)
        if issue is None:
            raise ValueError("Issue not found")

        result: dict[str, Any] = {
            "issue_id": issue_id,
            "action": action,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        if note:
            result["note"] = note

        if action == "ignore":
            result["status"] = "ignored"
        elif action == "review":
            result["status"] = "needs_review"
        elif action == "fix":
            result["status"] = "needs_manual_fix"
            result["suggested_fix"] = issue.get("suggested_fix")
            result["yaml_fix"] = issue.get("yaml_fix")
        else:
            scan = await self.async_scan()
            issue_key = self._issue_key(issue)
            current_issue_keys = self._current_issue_keys(scan)
            is_resolved = issue_key is not None and issue_key not in current_issue_keys
            result["status"] = "resolved" if is_resolved else "still_present"

        self._issue_actions[issue_id] = result
        await self._async_save_state()
        return result

    async def async_run_scheduled_audit(self) -> dict[str, Any]:
        if not self.options.get(CONF_DAILY_AUDIT, True):
            self._schedule_status = self._scheduled_status("disabled")
            await self._async_save_state()
            return self._schedule_status

        scan = await self.async_scan()
        unresolved = self._unresolved_previous_issues(scan)
        if unresolved:
            self._schedule_status = self._scheduled_status(
                status="blocked_unresolved_previous_issues",
                unresolved_issues=unresolved,
            )
            await self._async_save_state()
            LOGGER.info(
                "Daily AI Home Auditor run skipped because previous issues remain unresolved"
            )
            return self._schedule_status

        report = await self.async_analyze()
        self._schedule_status = self._scheduled_status(
            status="completed",
            issues=len(report.get("issues", [])),
            suggestions=len(report.get("suggestions", [])),
        )
        await self._async_save_state()
        return self._schedule_status

    async def async_get_report(self) -> dict[str, Any]:
        if self._last_report is not None:
            return self._report_with_schedule_status(self._last_report)
        data = await self.store.async_load()
        if isinstance(data, dict) and isinstance(data.get("last_report"), dict):
            self._last_report = data["last_report"]
            return self._report_with_schedule_status(self._last_report)
        return self._report_with_schedule_status({})

    async def _async_save_state(self) -> None:
        await self.store.async_save(
            {
                "last_report": self._last_report,
                "schedule_status": self._schedule_status,
                "issue_actions": self._issue_actions,
            }
        )

    def _report_with_schedule_status(self, report: dict[str, Any]) -> dict[str, Any]:
        report_with_actions = {
            **report,
            "issues": self._issues_with_actions(report.get("issues", [])),
        }
        return {
            **report_with_actions,
            "schedule_status": self._schedule_status,
            "issue_actions": self._issue_actions,
        }

    def _issues_with_actions(self, issues: Any) -> list[dict[str, Any]]:
        if not isinstance(issues, list):
            return []
        enriched: list[dict[str, Any]] = []
        for issue in issues:
            if not isinstance(issue, dict):
                continue
            issue_id = str(issue.get("issue_id") or "")
            action = self._issue_actions.get(issue_id, {})
            enriched.append(
                {
                    **issue,
                    "action_status": action.get("status", "open"),
                    "last_action": action,
                    "available_actions": self._available_actions(issue),
                }
            )
        return enriched

    def _available_actions(self, issue: dict[str, Any]) -> list[dict[str, str]]:
        actions = [
            {"id": "ignore", "label": "Ignore"},
            {"id": "recheck", "label": "Recheck"},
            {"id": "review", "label": "Review"},
        ]
        if issue.get("suggested_fix") or issue.get("yaml_fix"):
            actions.insert(1, {"id": "fix", "label": "Fix"})
        return actions

    def _scheduled_status(self, status: str, **extra: Any) -> dict[str, Any]:
        return {
            "status": status,
            "updated_at": datetime.now(UTC).isoformat(),
            **extra,
        }

    def _unresolved_previous_issues(self, scan: dict[str, Any]) -> list[dict[str, Any]]:
        if not self._last_report:
            return []

        current_issue_keys = self._current_issue_keys(scan)
        unresolved: list[dict[str, Any]] = []

        for issue in self._last_report.get("issues", []):
            if not isinstance(issue, dict):
                continue
            issue_id = str(issue.get("issue_id") or "")
            action_status = self._issue_actions.get(issue_id, {}).get("status")
            if action_status in {"ignored", "resolved"}:
                continue
            issue_key = self._issue_key(issue)
            if issue_key is not None and issue_key in current_issue_keys:
                unresolved.append(
                    {
                        "issue_id": issue.get("issue_id"),
                        "kind": issue.get("kind"),
                        "title": issue.get("title"),
                        "entity_id": issue.get("entity_id"),
                        "source": issue.get("source"),
                        "source_id": issue.get("source_id"),
                    }
                )

        return unresolved

    def _current_issue_keys(self, scan: dict[str, Any]) -> set[tuple[str, str, str, str]]:
        keys: set[tuple[str, str, str, str]] = set()

        for reference in scan.get("broken_entity_references", []):
            if not isinstance(reference, dict):
                continue
            keys.add(
                (
                    "broken_entity_id",
                    str(reference.get("source") or ""),
                    str(reference.get("source_id") or ""),
                    str(reference.get("entity_id") or ""),
                )
            )

        for entity_id in scan.get("unavailable_entities", []):
            keys.add(("unavailable_entity", "", "", str(entity_id)))

        return keys

    def _issue_key(self, issue: dict[str, Any]) -> tuple[str, str, str, str] | None:
        kind = str(issue.get("kind") or "")
        if kind == "broken_entity_id":
            return (
                kind,
                str(issue.get("source") or ""),
                str(issue.get("source_id") or ""),
                str(issue.get("entity_id") or ""),
            )
        if kind == "unavailable_entity":
            return (kind, "", "", str(issue.get("entity_id") or ""))
        return None

    def _find_issue(self, issue_id: str) -> dict[str, Any] | None:
        if not self._last_report:
            return None
        for issue in self._last_report.get("issues", []):
            if isinstance(issue, dict) and issue.get("issue_id") == issue_id:
                return issue
        return None
