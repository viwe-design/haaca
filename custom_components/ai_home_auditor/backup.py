from __future__ import annotations

import hashlib
import json
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant

from .const import BACKUP_DIR_NAME


class BackupManager:
    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._backup_root = Path(
            hass.config.path(".storage", BACKUP_DIR_NAME, "backups")
        )

    async def async_backup_file(self, relative_path: str) -> dict[str, Any]:
        source = self._resolve_config_path(relative_path)
        if not source.exists():
            raise FileNotFoundError(f"{relative_path} does not exist")

        backup_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        backup_dir = self._backup_root / backup_id
        backup_file = backup_dir / relative_path
        manifest_file = backup_dir / "manifest.json"

        def create_backup() -> dict[str, Any]:
            backup_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, backup_file)
            checksum = self._sha256(source)
            manifest = {
                "backup_id": backup_id,
                "created_at": datetime.now(UTC).isoformat(),
                "source_path": relative_path,
                "backup_path": str(backup_file),
                "sha256": checksum,
            }
            manifest_file.write_text(
                json.dumps(manifest, indent=2),
                encoding="utf-8",
            )
            return manifest

        return await self._hass.async_add_executor_job(create_backup)

    async def async_list_backups(self) -> list[dict[str, Any]]:
        def list_backups() -> list[dict[str, Any]]:
            if not self._backup_root.exists():
                return []
            backups: list[dict[str, Any]] = []
            for manifest_file in sorted(self._backup_root.glob("*/manifest.json")):
                try:
                    backups.append(json.loads(manifest_file.read_text(encoding="utf-8")))
                except (OSError, json.JSONDecodeError):
                    continue
            return backups

        return await self._hass.async_add_executor_job(list_backups)

    async def async_restore(self, backup_id: str) -> dict[str, Any]:
        backup_dir = self._backup_root / backup_id
        manifest_file = backup_dir / "manifest.json"
        if not manifest_file.exists():
            raise FileNotFoundError(f"Backup {backup_id} does not exist")

        def restore() -> dict[str, Any]:
            manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
            source_path = str(manifest["source_path"])
            backup_file = backup_dir / source_path
            target = self._resolve_config_path(source_path)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(backup_file, target)
            return manifest

        return await self._hass.async_add_executor_job(restore)

    def _resolve_config_path(self, relative_path: str) -> Path:
        if Path(relative_path).is_absolute() or ".." in Path(relative_path).parts:
            raise ValueError("Only relative Home Assistant config paths are allowed")
        return Path(self._hass.config.path(relative_path))

    def _sha256(self, path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as file:
            for chunk in iter(lambda: file.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
