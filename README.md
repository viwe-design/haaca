# AI Home Assistant Auditor

![AI Home Assistant Auditor brain cover](assets/ai-home-auditor-brain.png)

AI Home Assistant Auditor is a Home Assistant custom integration that scans local configuration, detects broken entity references in automations and scripts, asks an OpenAI-compatible model for additional audit findings, and safely previews or applies manual YAML fixes.

## MVP Scope

Implemented now:

- Home Assistant `custom_component`
- config flow for OpenAI-compatible API settings
- scanner for entity registry, device registry, config entries, states, `automations.yaml`, and `scripts.yaml`
- local detection of missing `entity_id` references in automations and scripts
- AI analysis report with severity, risk, suggested fixes, YAML snippets, and automation suggestions
- REST API and Home Assistant services
- diff preview before applying changes
- backup before every apply attempt
- YAML validation before applying changes
- dry-run mode
- rollback from stored backups
- minimal Lovelace custom panel
- daily scheduled audit with unresolved previous issue blocking

Not implemented yet:

- full history analysis
- unused entity detection across every dashboard/view
- duplicate or conflicting automation detection beyond AI recommendations
- automatic safe auto-fix execution
- full auto-fix scheduling
- complete UI for applying AI-generated fixes

## Installation

### HACS

1. Open HACS.
2. Add `https://github.com/viwe-design/haaca` as a custom repository.
3. Select category `Integration`.
4. Install the latest release.
5. Restart Home Assistant.

HACS should install a tagged release such as `v0.1.1`, not a raw commit SHA.

### Manual

Copy `custom_components/ai_home_auditor` into your Home Assistant `config/custom_components/` directory.

Restart Home Assistant, then add the integration:

1. Open Settings.
2. Open Devices & services.
3. Add Integration.
4. Search for `AI Home Assistant Auditor`.
5. Enter your OpenAI-compatible API key, base URL, and model.

Default provider values:

- Base URL: `https://api.openai.com/v1`
- Model: `gpt-4o-mini`
- Dry-run: enabled

## OpenAI-Compatible Providers

Any provider that supports `POST /chat/completions` with bearer auth can be used.

Example local or proxy config:

```yaml
base_url: "https://your-provider.example/v1"
model: "your-model-name"
dry_run: true
auto_fix: false
daily_audit: true
auto_fix_allowlist:
  - broken_entity_id
  - deprecated_syntax
  - invalid_service_call
```

API keys are stored in the Home Assistant config entry. Scanner output is redacted before it is sent to the model. Keys matching token, secret, password, authorization, bearer, client_secret, or api_key patterns are replaced with `[REDACTED]`.

## Services

### `ai_home_auditor.scan`

Runs local scan and returns raw structured scan output.

### `ai_home_auditor.analyze`

Runs scan if needed, sends redacted data to the LLM, merges local and AI findings, and stores the latest report.

### `ai_home_auditor.preview_fix`

Validates replacement YAML and returns unified diff.

```yaml
relative_path: automations.yaml
new_content: |
  - id: example
    alias: Example
    trigger: []
    condition: []
    action: []
```

### `ai_home_auditor.apply_fix`

Requires `confirmed: true`. The integration always creates a backup before writing. If dry-run is enabled, it creates the backup and returns without modifying the file.

```yaml
relative_path: automations.yaml
confirmed: true
new_content: |
  - id: example
    alias: Example
    trigger: []
    condition: []
    action: []
```

### `ai_home_auditor.rollback`

Restores a file from a backup manifest.

```yaml
backup_id: "20260614T143000Z"
```

## REST API

Authenticated Home Assistant endpoints:

- `GET /api/ai_home_auditor/report`
- `POST /api/ai_home_auditor/scan`
- `POST /api/ai_home_auditor/analyze`
- `POST /api/ai_home_auditor/preview_fix`
- `POST /api/ai_home_auditor/apply_fix`
- `GET /api/ai_home_auditor/backups`
- `POST /api/ai_home_auditor/rollback`

## Safety Model

- No file writes happen without a backup.
- `apply_fix` requires explicit confirmation.
- Dry-run is enabled by default.
- Only relative Home Assistant config paths are accepted.
- YAML is validated before writes.
- Home Assistant config check is requested after writes when the `homeassistant.check_config` service is available.
- If writing or validation fails, the integration restores the backup.
- Critical-risk changes are not auto-applied in this MVP because auto-fix execution is intentionally not implemented yet.
- The scheduled daily audit scans first and skips new AI analysis when previous broken entity or unavailable entity issues are still present.

## Daily Audit Blocking

When `daily_audit` is enabled, the integration schedules one audit every 24 hours after Home Assistant loads the config entry.

The scheduled run follows this order:

1. Scan the current Home Assistant state and YAML files.
2. Compare the previous report's broken entity and unavailable entity issues with the current scan.
3. If previous issues still exist, stop and store `blocked_unresolved_previous_issues`.
4. If previous issues are no longer present, run AI analysis and store a new report.

The status is exposed in `GET /api/ai_home_auditor/report` under `schedule_status` and shown in the Overview panel.

## Files

- `custom_components/ai_home_auditor/__init__.py` wires lifecycle, services, API, and panel registration.
- `custom_components/ai_home_auditor/scanner.py` collects Home Assistant registry/config data and local broken entity findings.
- `custom_components/ai_home_auditor/ai_analyzer.py` calls an OpenAI-compatible LLM and merges findings with local checks.
- `custom_components/ai_home_auditor/fixer.py` previews and applies full-file YAML replacements.
- `custom_components/ai_home_auditor/backup.py` stores backup manifests and file copies.
- `custom_components/ai_home_auditor/validator.py` validates YAML and requests Home Assistant config check.
- `custom_components/ai_home_auditor/frontend/src/panel.ts` contains the editable Lit panel source.
- `custom_components/ai_home_auditor/frontend/dist/panel.js` is the minimal runtime panel bundle.

## Next Implementation Units

Recommended next commits:

1. Add automation/script AST patch generation for specific broken entity replacements.
2. Add dashboard and `.storage/lovelace` scanning for unused entities.
3. Add recorder/history queries for behavior-based automation suggestions.
4. Add allowlisted auto-fix executor with critical-risk hard block.
5. Add scheduled audit coordinator and persistent audit history.
