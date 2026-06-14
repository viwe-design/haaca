from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

import aiohttp

from .const import CONF_API_KEY, CONF_BASE_URL, CONF_MODEL, DEFAULT_BASE_URL, DEFAULT_MODEL
from .models import AuditIssue, AuditReport

LOGGER = logging.getLogger(__name__)


class AIAnalysisError(Exception):
    pass


class AIAnalyzer:
    def __init__(self, session: aiohttp.ClientSession, options: dict[str, Any]) -> None:
        self._session = session
        self._api_key = options.get(CONF_API_KEY, "")
        self._base_url = options.get(CONF_BASE_URL, DEFAULT_BASE_URL).rstrip("/")
        self._model = options.get(CONF_MODEL, DEFAULT_MODEL)

    async def async_analyze(self, scan: dict[str, Any]) -> AuditReport:
        local_issues = self._local_issues(scan)
        ai_payload = await self._request_llm(scan)
        ai_issues = self._parse_ai_issues(ai_payload)
        suggestions = self._parse_suggestions(ai_payload)
        issues = self._merge_issues(local_issues, ai_issues)

        return AuditReport(
            generated_at=datetime.now(UTC).isoformat(),
            summary={
                **scan.get("summary", {}),
                "issues": len(issues),
                "suggestions": len(suggestions),
                "ai_available": bool(ai_payload),
            },
            issues=issues,
            suggestions=suggestions,
            raw_scan=scan,
        )

    def _local_issues(self, scan: dict[str, Any]) -> list[AuditIssue]:
        issues: list[AuditIssue] = []

        for index, reference in enumerate(scan.get("broken_entity_references", []), start=1):
            entity_id = reference.get("entity_id", "")
            source = reference.get("source", "")
            source_id = reference.get("source_id", "")
            issues.append(
                AuditIssue(
                    issue_id=f"broken-entity-{index}",
                    kind="broken_entity_id",
                    title=f"Missing entity {entity_id}",
                    explanation=(
                        f"{source} {source_id} references {entity_id}, but this "
                        "entity is not present in the entity registry or current states."
                    ),
                    severity="high",
                    risk="medium",
                    source=source,
                    source_id=source_id,
                    entity_id=entity_id,
                    suggested_fix=(
                        "Replace the entity_id with the current entity, remove the "
                        "condition/action, or restore the integration that provides it."
                    ),
                )
            )

        for index, entity_id in enumerate(scan.get("unavailable_entities", []), start=1):
            issues.append(
                AuditIssue(
                    issue_id=f"unavailable-entity-{index}",
                    kind="unavailable_entity",
                    title=f"Unavailable entity {entity_id}",
                    explanation=(
                        f"{entity_id} is currently unavailable or unknown. Automations "
                        "depending on it may not fire correctly."
                    ),
                    severity="medium",
                    risk="low",
                    entity_id=entity_id,
                    suggested_fix=(
                        "Check the device, integration availability, or remove the "
                        "entity from automations if it was intentionally retired."
                    ),
                )
            )

        return issues

    async def _request_llm(self, scan: dict[str, Any]) -> dict[str, Any]:
        if not self._api_key:
            return {}

        body = {
            "model": self._model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You audit Home Assistant configurations. Return strict JSON "
                        "with keys issues and suggestions. Never request secrets. "
                        "Classify severity and risk as low, medium, high, or critical."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "task": "Audit this Home Assistant scan for errors, weak spots, conflicts, and useful automation ideas.",
                            "scan": scan,
                            "required_issue_schema": {
                                "kind": "string",
                                "title": "string",
                                "explanation": "plain language string",
                                "severity": "low|medium|high|critical",
                                "risk": "low|medium|high|critical",
                                "source": "automation|script|entity|integration|null",
                                "source_id": "string|null",
                                "entity_id": "string|null",
                                "suggested_fix": "string|null",
                                "yaml_fix": "string|null",
                                "conflicts": ["string"],
                            },
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
        }

        try:
            async with self._session.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
                timeout=aiohttp.ClientTimeout(total=90),
            ) as response:
                if response.status >= 400:
                    text = await response.text()
                    raise AIAnalysisError(f"AI provider returned {response.status}: {text}")
                data = await response.json()
        except (aiohttp.ClientError, TimeoutError, AIAnalysisError):
            LOGGER.exception("AI analysis request failed")
            return {}

        content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            LOGGER.warning("AI provider returned non-JSON content")
            return {}

        return parsed if isinstance(parsed, dict) else {}

    def _parse_ai_issues(self, payload: dict[str, Any]) -> list[AuditIssue]:
        parsed: list[AuditIssue] = []
        for index, issue in enumerate(payload.get("issues", []), start=1):
            if not isinstance(issue, dict):
                continue
            parsed.append(
                AuditIssue(
                    issue_id=f"ai-{index}",
                    kind=str(issue.get("kind") or "ai_observation"),
                    title=str(issue.get("title") or "AI finding"),
                    explanation=str(issue.get("explanation") or ""),
                    severity=self._level(issue.get("severity"), "medium"),
                    risk=self._level(issue.get("risk"), "medium"),
                    source=issue.get("source"),
                    source_id=issue.get("source_id"),
                    entity_id=issue.get("entity_id"),
                    suggested_fix=issue.get("suggested_fix"),
                    yaml_fix=issue.get("yaml_fix"),
                    conflicts=[
                        str(item)
                        for item in issue.get("conflicts", [])
                        if isinstance(item, str)
                    ],
                )
            )
        return parsed

    def _parse_suggestions(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        suggestions = payload.get("suggestions", [])
        if not isinstance(suggestions, list):
            return []
        return [item for item in suggestions if isinstance(item, dict)]

    def _merge_issues(
        self,
        local_issues: list[AuditIssue],
        ai_issues: list[AuditIssue],
    ) -> list[AuditIssue]:
        seen = {
            (issue.kind, issue.source, issue.source_id, issue.entity_id)
            for issue in local_issues
        }
        merged = list(local_issues)
        for issue in ai_issues:
            key = (issue.kind, issue.source, issue.source_id, issue.entity_id)
            if key not in seen:
                merged.append(issue)
                seen.add(key)
        return merged

    def _level(self, value: Any, fallback: str) -> Any:
        return value if value in {"low", "medium", "high", "critical"} else fallback
