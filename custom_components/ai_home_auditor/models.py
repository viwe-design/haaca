from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

Severity = Literal["low", "medium", "high", "critical"]
RiskLevel = Literal["low", "medium", "high", "critical"]


@dataclass(slots=True)
class RegistryEntity:
    entity_id: str
    platform: str | None
    device_id: str | None
    disabled: bool
    hidden: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "entity_id": self.entity_id,
            "platform": self.platform,
            "device_id": self.device_id,
            "disabled": self.disabled,
            "hidden": self.hidden,
        }


@dataclass(slots=True)
class BrokenEntityReference:
    source: str
    source_id: str
    entity_id: str
    path: str

    def as_dict(self) -> dict[str, str]:
        return {
            "source": self.source,
            "source_id": self.source_id,
            "entity_id": self.entity_id,
            "path": self.path,
        }


@dataclass(slots=True)
class AuditIssue:
    issue_id: str
    kind: str
    title: str
    explanation: str
    severity: Severity
    risk: RiskLevel
    source: str | None = None
    source_id: str | None = None
    entity_id: str | None = None
    suggested_fix: str | None = None
    yaml_fix: str | None = None
    conflicts: list[str] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "issue_id": self.issue_id,
            "kind": self.kind,
            "title": self.title,
            "explanation": self.explanation,
            "severity": self.severity,
            "risk": self.risk,
            "source": self.source,
            "source_id": self.source_id,
            "entity_id": self.entity_id,
            "suggested_fix": self.suggested_fix,
            "yaml_fix": self.yaml_fix,
            "conflicts": self.conflicts,
        }


@dataclass(slots=True)
class AuditReport:
    generated_at: str
    summary: dict[str, Any]
    issues: list[AuditIssue]
    suggestions: list[dict[str, Any]]
    raw_scan: dict[str, Any]

    def as_dict(self) -> dict[str, Any]:
        return {
            "generated_at": self.generated_at,
            "summary": self.summary,
            "issues": [issue.as_dict() for issue in self.issues],
            "suggestions": self.suggestions,
            "raw_scan": self.raw_scan,
        }
