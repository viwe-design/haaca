from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant import config_entries

from .const import (
    CONF_API_KEY,
    CONF_AUTO_FIX,
    CONF_AUTO_FIX_ALLOWLIST,
    CONF_BASE_URL,
    CONF_DAILY_AUDIT,
    CONF_DRY_RUN,
    CONF_MODEL,
    DEFAULT_AUTO_FIX,
    DEFAULT_AUTO_FIX_ALLOWLIST,
    DEFAULT_BASE_URL,
    DEFAULT_DAILY_AUDIT,
    DEFAULT_DRY_RUN,
    DEFAULT_MODEL,
    DOMAIN,
)


class AIHomeAuditorConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        errors: dict[str, str] = {}

        if user_input is not None:
            api_key = user_input.get(CONF_API_KEY, "").strip()
            if not api_key:
                errors[CONF_API_KEY] = "required"
            else:
                await self.async_set_unique_id(DOMAIN)
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title="AI Home Assistant Auditor",
                    data={
                        CONF_API_KEY: api_key,
                        CONF_BASE_URL: user_input[CONF_BASE_URL].rstrip("/"),
                        CONF_MODEL: user_input[CONF_MODEL],
                    },
                    options={
                        CONF_DRY_RUN: user_input[CONF_DRY_RUN],
                        CONF_DAILY_AUDIT: user_input[CONF_DAILY_AUDIT],
                        CONF_AUTO_FIX: user_input[CONF_AUTO_FIX],
                        CONF_AUTO_FIX_ALLOWLIST: user_input[
                            CONF_AUTO_FIX_ALLOWLIST
                        ],
                    },
                )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_API_KEY): str,
                    vol.Required(CONF_BASE_URL, default=DEFAULT_BASE_URL): str,
                    vol.Required(CONF_MODEL, default=DEFAULT_MODEL): str,
                    vol.Required(CONF_DRY_RUN, default=DEFAULT_DRY_RUN): bool,
                    vol.Required(
                        CONF_DAILY_AUDIT, default=DEFAULT_DAILY_AUDIT
                    ): bool,
                    vol.Required(CONF_AUTO_FIX, default=DEFAULT_AUTO_FIX): bool,
                    vol.Required(
                        CONF_AUTO_FIX_ALLOWLIST,
                        default=list(DEFAULT_AUTO_FIX_ALLOWLIST),
                    ): list[str],
                }
            ),
            errors=errors,
        )

    @staticmethod
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> config_entries.OptionsFlow:
        return AIHomeAuditorOptionsFlow(config_entry)


class AIHomeAuditorOptionsFlow(config_entries.OptionsFlow):
    def __init__(self, config_entry: config_entries.ConfigEntry) -> None:
        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        CONF_DRY_RUN,
                        default=self._config_entry.options.get(
                            CONF_DRY_RUN, DEFAULT_DRY_RUN
                        ),
                    ): bool,
                    vol.Required(
                        CONF_DAILY_AUDIT,
                        default=self._config_entry.options.get(
                            CONF_DAILY_AUDIT, DEFAULT_DAILY_AUDIT
                        ),
                    ): bool,
                    vol.Required(
                        CONF_AUTO_FIX,
                        default=self._config_entry.options.get(
                            CONF_AUTO_FIX, DEFAULT_AUTO_FIX
                        ),
                    ): bool,
                    vol.Required(
                        CONF_AUTO_FIX_ALLOWLIST,
                        default=self._config_entry.options.get(
                            CONF_AUTO_FIX_ALLOWLIST,
                            list(DEFAULT_AUTO_FIX_ALLOWLIST),
                        ),
                    ): list[str],
                }
            ),
        )
