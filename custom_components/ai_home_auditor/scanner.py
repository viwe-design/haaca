from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Any

import yaml

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .models import BrokenEntityReference, RegistryEntity

LOGGER = logging.getLogger(__name__)

ENTITY_ID_RE = re.compile(r"\b[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z0-9_]+\b")
SENSITIVE_KEY_RE = re.compile(
    r"(api[_-]?key|token|secret|password|passwd|authorization|bearer|client_secret)",
    re.IGNORECASE,
)


class HomeAssistantScanner:
    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def async_scan(self) -> dict[str, Any]:
        entity_registry = er.async_get(self._hass)
        device_registry = dr.async_get(self._hass)
        entities = self._entities(entity_registry)
        states = self._states()
        automations = await self._load_yaml_file("automations.yaml")
        scripts = await self._load_yaml_file("scripts.yaml")
        known_entity_ids = set(entities) | set(states)
        broken_references = self._find_broken_references(
            automations=automations,
            scripts=scripts,
            known_entity_ids=known_entity_ids,
        )

        unavailable_entities = [
            entity_id
            for entity_id, state in states.items()
            if state.get("state") in {"unavailable", "unknown"}
        ]

        return {
            "devices": [
                {
                    "id": device.id,
                    "name": device.name_by_user or device.name,
                    "manufacturer": device.manufacturer,
                    "model": device.model,
                    "disabled": bool(device.disabled_by),
                }
                for device in device_registry.devices.values()
            ],
            "entities": [entity.as_dict() for entity in entities.values()],
            "states": states,
            "integrations": self._integrations(),
            "automations": self._redact(automations),
            "scripts": self._redact(scripts),
            "broken_entity_references": [
                item.as_dict() for item in broken_references
            ],
            "unavailable_entities": unavailable_entities,
            "summary": {
                "devices": len(device_registry.devices),
                "entities": len(entities),
                "states": len(states),
                "automations": len(automations) if isinstance(automations, list) else 0,
                "scripts": len(scripts) if isinstance(scripts, dict) else 0,
                "broken_entity_references": len(broken_references),
                "unavailable_entities": len(unavailable_entities),
            },
        }

    def _entities(self, registry: er.EntityRegistry) -> dict[str, RegistryEntity]:
        return {
            entry.entity_id: RegistryEntity(
                entity_id=entry.entity_id,
                platform=entry.platform,
                device_id=entry.device_id,
                disabled=entry.disabled_by is not None,
                hidden=entry.hidden_by is not None,
            )
            for entry in registry.entities.values()
        }

    def _states(self) -> dict[str, dict[str, Any]]:
        return {
            state.entity_id: {
                "state": state.state,
                "last_changed": state.last_changed.isoformat(),
                "last_updated": state.last_updated.isoformat(),
            }
            for state in self._hass.states.async_all()
        }

    def _integrations(self) -> list[dict[str, Any]]:
        return [
            {
                "entry_id": entry.entry_id,
                "domain": entry.domain,
                "title": entry.title,
                "state": entry.state.value,
                "disabled": entry.disabled_by is not None,
            }
            for entry in self._hass.config_entries.async_entries()
        ]

    async def _load_yaml_file(self, relative_path: str) -> Any:
        file_path = Path(self._hass.config.path(relative_path))

        if not file_path.exists():
            return [] if relative_path == "automations.yaml" else {}

        def read_yaml() -> Any:
            with file_path.open("r", encoding="utf-8") as config_file:
                data = yaml.safe_load(config_file)
            return data or ([] if relative_path == "automations.yaml" else {})

        try:
            return await self._hass.async_add_executor_job(read_yaml)
        except (OSError, yaml.YAMLError) as err:
            LOGGER.exception("Failed to read %s", relative_path)
            return {"error": str(err)}

    def _find_broken_references(
        self,
        automations: Any,
        scripts: Any,
        known_entity_ids: set[str],
    ) -> list[BrokenEntityReference]:
        references: list[BrokenEntityReference] = []
        references.extend(
            self._scan_source_for_entity_refs(
                source="automation",
                data=automations,
                known_entity_ids=known_entity_ids,
            )
        )
        references.extend(
            self._scan_source_for_entity_refs(
                source="script",
                data=scripts,
                known_entity_ids=known_entity_ids,
            )
        )
        return references

    def _scan_source_for_entity_refs(
        self,
        source: str,
        data: Any,
        known_entity_ids: set[str],
    ) -> list[BrokenEntityReference]:
        references: list[BrokenEntityReference] = []

        for path, value in self._walk(data):
            for entity_id in self._extract_entity_ids(value):
                if entity_id not in known_entity_ids:
                    references.append(
                        BrokenEntityReference(
                            source=source,
                            source_id=self._source_id(data, path),
                            entity_id=entity_id,
                            path=path,
                        )
                    )

        return references

    def _source_id(self, data: Any, path: str) -> str:
        first_segment = path.split(".", 1)[0]
        if first_segment.startswith("[") and isinstance(data, list):
            try:
                index = int(first_segment.strip("[]"))
                item = data[index]
                if isinstance(item, dict):
                    return str(item.get("id") or item.get("alias") or index)
            except (ValueError, IndexError):
                return first_segment
        return first_segment

    def _walk(self, value: Any, path: str = "") -> list[tuple[str, Any]]:
        if isinstance(value, dict):
            items: list[tuple[str, Any]] = []
            for key, child in value.items():
                child_path = f"{path}.{key}" if path else str(key)
                items.extend(self._walk(child, child_path))
            return items
        if isinstance(value, list):
            items = []
            for index, child in enumerate(value):
                child_path = f"{path}.[{index}]" if path else f"[{index}]"
                items.extend(self._walk(child, child_path))
            return items
        return [(path, value)]

    def _extract_entity_ids(self, value: Any) -> set[str]:
        if isinstance(value, str):
            return set(ENTITY_ID_RE.findall(value))
        if isinstance(value, list):
            return {
                entity_id
                for item in value
                if isinstance(item, str)
                for entity_id in ENTITY_ID_RE.findall(item)
            }
        return set()

    def _redact(self, value: Any) -> Any:
        if isinstance(value, dict):
            redacted: dict[str, Any] = {}
            for key, child in value.items():
                if SENSITIVE_KEY_RE.search(str(key)):
                    redacted[key] = "[REDACTED]"
                else:
                    redacted[key] = self._redact(child)
            return redacted
        if isinstance(value, list):
            return [self._redact(item) for item in value]
        if isinstance(value, str) and SENSITIVE_KEY_RE.search(value):
            return "[REDACTED]"
        return value


async def scan_home_assistant(hass: HomeAssistant) -> dict[str, Any]:
    await asyncio.sleep(0)
    return await HomeAssistantScanner(hass).async_scan()
