from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from homeassistant.core import HomeAssistant


class ValidationError(Exception):
    pass


class ConfigValidator:
    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def async_validate_yaml(self, content: str) -> dict[str, Any]:
        def validate() -> dict[str, Any]:
            try:
                yaml.safe_load(content)
            except yaml.YAMLError as err:
                raise ValidationError(str(err)) from err
            return {"valid": True, "engine": "pyyaml"}

        return await self._hass.async_add_executor_job(validate)

    async def async_validate_file_path(self, relative_path: str) -> dict[str, Any]:
        file_path = self._resolve_config_path(relative_path)

        def read_content() -> str:
            return file_path.read_text(encoding="utf-8")

        content = await self._hass.async_add_executor_job(read_content)
        return await self.async_validate_yaml(content)

    async def async_request_homeassistant_config_check(self) -> dict[str, Any]:
        if not self._hass.services.has_service("homeassistant", "check_config"):
            return {
                "requested": False,
                "status": "service_unavailable",
            }

        await self._hass.services.async_call(
            "homeassistant",
            "check_config",
            blocking=False,
        )
        return {
            "requested": True,
            "status": "started",
        }

    def _resolve_config_path(self, relative_path: str) -> Path:
        if Path(relative_path).is_absolute() or ".." in Path(relative_path).parts:
            raise ValueError("Only relative Home Assistant config paths are allowed")
        return Path(self._hass.config.path(relative_path))
