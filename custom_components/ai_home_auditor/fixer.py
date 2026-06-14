from __future__ import annotations

import difflib
import logging
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant

from .backup import BackupManager
from .const import CONF_DRY_RUN, DEFAULT_DRY_RUN
from .validator import ConfigValidator

LOGGER = logging.getLogger(__name__)


class Fixer:
    def __init__(
        self,
        hass: HomeAssistant,
        backup_manager: BackupManager,
        validator: ConfigValidator,
        options: dict[str, Any],
    ) -> None:
        self._hass = hass
        self._backup_manager = backup_manager
        self._validator = validator
        self._dry_run = bool(options.get(CONF_DRY_RUN, DEFAULT_DRY_RUN))

    async def async_preview_file_change(
        self,
        relative_path: str,
        new_content: str,
    ) -> dict[str, Any]:
        current_content = await self._read_file(relative_path)
        await self._validator.async_validate_yaml(new_content)
        diff = "\n".join(
            difflib.unified_diff(
                current_content.splitlines(),
                new_content.splitlines(),
                fromfile=f"a/{relative_path}",
                tofile=f"b/{relative_path}",
                lineterm="",
            )
        )
        return {
            "relative_path": relative_path,
            "valid_yaml": True,
            "diff": diff,
            "dry_run": self._dry_run,
        }

    async def async_apply_file_change(
        self,
        relative_path: str,
        new_content: str,
        confirmed: bool,
    ) -> dict[str, Any]:
        if not confirmed:
            raise PermissionError("Fix application requires explicit confirmation")

        preview = await self.async_preview_file_change(relative_path, new_content)
        backup = await self._backup_manager.async_backup_file(relative_path)

        if self._dry_run:
            return {
                "applied": False,
                "reason": "dry_run_enabled",
                "backup": backup,
                "preview": preview,
            }

        try:
            await self._write_file(relative_path, new_content)
            file_validation = await self._validator.async_validate_file_path(relative_path)
            config_check = await self._validator.async_request_homeassistant_config_check()
        except Exception:
            LOGGER.exception("Applying fix failed, restoring backup")
            await self._backup_manager.async_restore(backup["backup_id"])
            raise

        return {
            "applied": True,
            "backup": backup,
            "preview": preview,
            "validation": file_validation,
            "config_check": config_check,
        }

    async def _read_file(self, relative_path: str) -> str:
        file_path = self._resolve_config_path(relative_path)

        def read() -> str:
            return file_path.read_text(encoding="utf-8")

        return await self._hass.async_add_executor_job(read)

    async def _write_file(self, relative_path: str, content: str) -> None:
        file_path = self._resolve_config_path(relative_path)

        def write() -> None:
            file_path.write_text(content, encoding="utf-8")

        await self._hass.async_add_executor_job(write)

    def _resolve_config_path(self, relative_path: str) -> Path:
        if Path(relative_path).is_absolute() or ".." in Path(relative_path).parts:
            raise ValueError("Only relative Home Assistant config paths are allowed")
        return Path(self._hass.config.path(relative_path))
