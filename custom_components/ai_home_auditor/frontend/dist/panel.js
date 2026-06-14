(function () {
  const tabs = [
    ["overview", "Обзор"],
    ["problems", "Проблемы"],
    ["suggestions", "Рекомендации"],
    ["autoFix", "Исправления"],
    ["backups", "Резервные копии"],
    ["settings", "Настройки"]
  ];

  class AIHomeAuditorPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.activeTab = "overview";
      this.loading = false;
      this.error = "";
      this.report = {};
      this.previewDiff = "";
      this.backups = [];
      this.actionResult = "";
    }

    connectedCallback() {
      this.render();
      this.loadReport();
    }

    setState(nextState) {
      Object.assign(this, nextState);
      this.render();
    }

    render() {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
            min-height: 100%;
            padding: clamp(16px, 3vw, 32px);
            color: var(--primary-text-color);
            background:
              radial-gradient(circle at 18% 8%, rgba(33, 231, 255, 0.16), transparent 28%),
              radial-gradient(circle at 84% 18%, rgba(168, 85, 247, 0.18), transparent 32%),
              linear-gradient(135deg, rgba(2, 6, 23, 0.08), rgba(15, 23, 42, 0.02));
            box-sizing: border-box;
          }

          h1 {
            margin: 0 0 18px;
            font-size: clamp(28px, 4vw, 48px);
            line-height: 1;
            letter-spacing: -0.04em;
            background: linear-gradient(120deg, #22d3ee, #60a5fa 48%, #c084fc);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            text-rendering: geometricPrecision;
          }

          .tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 18px;
            padding: 8px;
            border: 1px solid rgba(148, 163, 184, 0.22);
            border-radius: 18px;
            background: rgba(15, 23, 42, 0.22);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(18px) saturate(145%);
            -webkit-backdrop-filter: blur(18px) saturate(145%);
          }

          button {
            border: 1px solid rgba(148, 163, 184, 0.24);
            border-radius: 999px;
            padding: 10px 16px;
            background: rgba(255, 255, 255, 0.08);
            color: var(--primary-text-color);
            cursor: pointer;
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.12),
              0 10px 24px rgba(2, 6, 23, 0.12);
            backdrop-filter: blur(12px) saturate(140%);
            -webkit-backdrop-filter: blur(12px) saturate(140%);
            transition: transform 140ms ease, border-color 140ms ease, background 140ms ease;
          }

          button:hover {
            transform: translateY(-1px);
            border-color: rgba(34, 211, 238, 0.48);
            background: rgba(34, 211, 238, 0.14);
          }

          button.active {
            border-color: rgba(34, 211, 238, 0.64);
            background: linear-gradient(135deg, rgba(34, 211, 238, 0.28), rgba(168, 85, 247, 0.26));
            color: var(--primary-text-color);
          }

          input,
          textarea {
            width: 100%;
            box-sizing: border-box;
            border-radius: 16px;
            padding: 12px;
            color: var(--primary-text-color);
            background: rgba(15, 23, 42, 0.18);
            border: 1px solid rgba(148, 163, 184, 0.24);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(14px) saturate(130%);
            -webkit-backdrop-filter: blur(14px) saturate(130%);
          }

          textarea {
            min-height: 220px;
            margin-top: 10px;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 14px;
          }

          .card {
            position: relative;
            overflow: hidden;
            border: 1px solid rgba(148, 163, 184, 0.22);
            border-radius: 22px;
            padding: 18px;
            background:
              linear-gradient(135deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.045)),
              rgba(15, 23, 42, 0.18);
            box-shadow:
              0 22px 60px rgba(2, 6, 23, 0.20),
              inset 0 1px 0 rgba(255, 255, 255, 0.16);
            backdrop-filter: blur(22px) saturate(150%);
            -webkit-backdrop-filter: blur(22px) saturate(150%);
          }

          .card::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            background: linear-gradient(135deg, rgba(34, 211, 238, 0.12), transparent 34%, rgba(168, 85, 247, 0.10));
            opacity: 0.75;
          }

          .toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 16px;
          }

          .issue {
            border-left: 1px solid rgba(250, 204, 21, 0.55);
          }

          .issue.high,
          .issue.critical {
            border-left-color: rgba(248, 113, 113, 0.78);
          }

          .error {
            color: var(--error-color);
          }

          .status {
            display: inline-block;
            border-radius: 999px;
            padding: 5px 11px;
            border: 1px solid rgba(148, 163, 184, 0.22);
            background: rgba(255, 255, 255, 0.08);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
          }

          .actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 12px;
          }

          pre {
            overflow: auto;
            white-space: pre-wrap;
            border: 1px solid rgba(148, 163, 184, 0.22);
            border-radius: 16px;
            padding: 12px;
            background: rgba(2, 6, 23, 0.72);
            color: var(--code-editor-text-color, #e5e7eb);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
          }

          @media (min-resolution: 2dppx) {
            .card,
            .tabs,
            button,
            input,
            textarea,
            pre,
            .status {
              border-width: 0.5px;
            }
          }
        </style>
        <h1>AI Аудитор Home Assistant</h1>
        <div class="tabs">
          ${tabs
            .map(
              ([tab, label]) =>
                `<button data-tab="${tab}" class="${this.activeTab === tab ? "active" : ""}">${label}</button>`
            )
            .join("")}
        </div>
        <div class="toolbar">
          <button data-action="scan">Сканировать</button>
          <button data-action="analyze">Анализировать</button>
          <button data-action="refresh">Обновить отчёт</button>
        </div>
        ${this.loading ? "<p>Загрузка...</p>" : ""}
        ${this.error ? `<p class="error">${escapeHtml(this.error)}</p>` : ""}
        ${this.actionResult ? `<p class="card">${escapeHtml(this.actionResult)}</p>` : ""}
        ${this.renderActiveTab()}
      `;

      this.bindEvents();
    }

    bindEvents() {
      this.shadowRoot.querySelectorAll("[data-tab]").forEach((button) => {
        button.addEventListener("click", () => {
          this.setState({ activeTab: button.getAttribute("data-tab") || "overview" });
        });
      });

      const scanButton = this.shadowRoot.querySelector('[data-action="scan"]');
      const analyzeButton = this.shadowRoot.querySelector('[data-action="analyze"]');
      const refreshButton = this.shadowRoot.querySelector('[data-action="refresh"]');
      const previewButton = this.shadowRoot.querySelector('[data-action="previewFix"]');
      const loadBackupsButton = this.shadowRoot.querySelector('[data-action="loadBackups"]');

      if (scanButton) scanButton.addEventListener("click", () => this.scan());
      if (analyzeButton) analyzeButton.addEventListener("click", () => this.analyze());
      if (refreshButton) refreshButton.addEventListener("click", () => this.loadReport());
      if (previewButton) previewButton.addEventListener("click", () => this.previewFix());
      if (loadBackupsButton) loadBackupsButton.addEventListener("click", () => this.loadBackups());

      this.shadowRoot.querySelectorAll("[data-rollback]").forEach((button) => {
        button.addEventListener("click", () => this.rollback(button.getAttribute("data-rollback") || ""));
      });

      this.shadowRoot.querySelectorAll("[data-issue-action]").forEach((button) => {
        button.addEventListener("click", () =>
          this.issueAction(
            button.getAttribute("data-issue-id") || "",
            button.getAttribute("data-issue-action") || ""
          )
        );
      });
    }

    renderActiveTab() {
      if (this.activeTab === "overview") return this.renderOverview();
      if (this.activeTab === "problems") return this.renderProblems();
      if (this.activeTab === "suggestions") return this.renderSuggestions();
      if (this.activeTab === "autoFix") return this.renderAutoFix();
      if (this.activeTab === "backups") return this.renderBackups();
      return this.renderSettings();
    }

    renderOverview() {
      const summary = this.report.summary || {};
      const scheduleStatus = this.report.schedule_status || {};
      const unresolvedCount = Array.isArray(scheduleStatus.unresolved_issues)
        ? scheduleStatus.unresolved_issues.length
        : 0;

      return `
        <div class="card">
          <h2>Ежедневный аудит</h2>
          <p><strong>Статус:</strong> ${escapeHtml(localizeStatus(scheduleStatus.status || "not_run"))}</p>
          ${
            scheduleStatus.updated_at
              ? `<p><strong>Обновлено:</strong> ${escapeHtml(scheduleStatus.updated_at)}</p>`
              : ""
          }
          ${unresolvedCount ? `<p><strong>Блокируется нерешёнными проблемами:</strong> ${unresolvedCount}</p>` : ""}
        </div>
        <br>
        <div class="grid">
          ${Object.entries(summary)
            .map(
              ([key, value]) =>
                `<div class="card"><strong>${escapeHtml(localizeSummaryKey(key))}</strong><p>${escapeHtml(String(value))}</p></div>`
            )
            .join("")}
        </div>
      `;
    }

    renderProblems() {
      const issues = Array.isArray(this.report.issues) ? this.report.issues : [];
      return `
        <div class="grid">
          ${issues
            .map(
              (issue) => `
                <div class="card issue ${escapeAttribute(issue.severity || "")}">
                  <h3>${escapeHtml(issue.title || "Проблема")}</h3>
                  <p>${escapeHtml(issue.explanation || "")}</p>
                  <p><strong>Критичность:</strong> ${escapeHtml(localizeSeverity(issue.severity || "unknown"))}</p>
                  <p><strong>Риск:</strong> ${escapeHtml(localizeSeverity(issue.risk || "unknown"))}</p>
                  <p><strong>Статус:</strong> <span class="status">${escapeHtml(localizeStatus(issue.action_status || "open"))}</span></p>
                  ${issue.entity_id ? `<p><strong>Сущность:</strong> ${escapeHtml(issue.entity_id)}</p>` : ""}
                  ${issue.suggested_fix ? `<p><strong>Исправление:</strong> ${escapeHtml(issue.suggested_fix)}</p>` : ""}
                  ${issue.yaml_fix ? `<pre>${escapeHtml(issue.yaml_fix)}</pre>` : ""}
                  ${this.renderIssueActions(issue)}
                </div>
              `
            )
            .join("")}
        </div>
      `;
    }

    renderIssueActions(issue) {
      const actions = Array.isArray(issue.available_actions) ? issue.available_actions : [];
      return `
        <div class="actions">
          ${actions
            .map(
              (action) => `
                <button
                  data-issue-id="${escapeAttribute(issue.issue_id || "")}"
                  data-issue-action="${escapeAttribute(action.id || "")}"
                >
                  ${escapeHtml(action.label || action.id || "Действие")}
                </button>
              `
            )
            .join("")}
        </div>
      `;
    }

    renderSuggestions() {
      const suggestions = Array.isArray(this.report.suggestions) ? this.report.suggestions : [];
      return `
        <div class="grid">
          ${suggestions
            .map((suggestion) => `<div class="card"><pre>${escapeHtml(JSON.stringify(suggestion, null, 2))}</pre></div>`)
            .join("")}
        </div>
      `;
    }

    renderAutoFix() {
      return `
        <div class="card">
          <h2>Предпросмотр ручного исправления</h2>
          <p>Вставьте полный YAML для замены файла конфигурации Home Assistant. Применение требует подтверждения и сначала создаёт резервную копию.</p>
          <input id="path" placeholder="automations.yaml" value="automations.yaml">
          <textarea id="content" placeholder="Новое содержимое файла"></textarea>
          <div class="toolbar">
            <button data-action="previewFix">Показать diff</button>
          </div>
          ${this.previewDiff ? `<pre>${escapeHtml(this.previewDiff)}</pre>` : ""}
        </div>
      `;
    }

    renderBackups() {
      return `
        <div class="toolbar">
          <button data-action="loadBackups">Загрузить резервные копии</button>
        </div>
        <div class="grid">
          ${this.backups
            .map(
              (backup) => `
                <div class="card">
                  <pre>${escapeHtml(JSON.stringify(backup, null, 2))}</pre>
                  <button data-rollback="${escapeAttribute(String(backup.backup_id || ""))}">Откатить</button>
                </div>
              `
            )
            .join("")}
        </div>
      `;
    }

    renderSettings() {
      return `
        <div class="card">
          <h2>Настройки</h2>
          <p>API-ключ, базовый URL, модель, dry-run режим и список разрешённых автоисправлений настраиваются в параметрах интеграции Home Assistant.</p>
        </div>
      `;
    }

    async loadReport() {
      await this.request("GET", "/api/ai_home_auditor/report", undefined, (data) => {
        this.report = data || {};
      });
    }

    async scan() {
      await this.request("POST", "/api/ai_home_auditor/scan", {}, () => this.analyze());
    }

    async analyze() {
      await this.request("POST", "/api/ai_home_auditor/analyze", {}, (data) => {
        this.report = data || {};
      });
    }

    async previewFix() {
      const pathInput = this.shadowRoot.querySelector("#path");
      const contentInput = this.shadowRoot.querySelector("#content");
      await this.request(
        "POST",
        "/api/ai_home_auditor/preview_fix",
        {
          relative_path: pathInput ? pathInput.value : "",
          new_content: contentInput ? contentInput.value : ""
        },
        (data) => {
          this.previewDiff = data && data.diff ? String(data.diff) : "";
        }
      );
    }

    async loadBackups() {
      await this.request("GET", "/api/ai_home_auditor/backups", undefined, (data) => {
        this.backups = data && Array.isArray(data.backups) ? data.backups : [];
      });
    }

    async rollback(backupId) {
      if (!backupId || !window.confirm(`Откатить резервную копию ${backupId}?`)) return;
      await this.request("POST", "/api/ai_home_auditor/rollback", { backup_id: backupId }, () => this.loadBackups());
    }

    async issueAction(issueId, action) {
      if (!issueId || !action) return;
      await this.request(
        "POST",
        "/api/ai_home_auditor/issue_action",
        { issue_id: issueId, action },
        (data) => {
          this.actionResult = issueActionMessage(data);
          this.loadReport();
        }
      );
    }

    async request(method, url, body, onSuccess) {
      this.setState({ loading: true, error: "" });
      try {
        if (this.hass && typeof this.hass.callApi === "function") {
          const apiPath = url.replace(/^\/api\//, "");
          onSuccess(await this.hass.callApi(method, apiPath, body));
          return;
        }

        const response = await fetch(url, {
          method,
          credentials: "same-origin",
          headers: body === undefined ? undefined : { "Content-Type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        if (!response.ok) throw new Error(await response.text());
        onSuccess(await response.json());
      } catch (err) {
        this.error = err instanceof Error ? err.message : String(err);
      } finally {
        this.loading = false;
        this.render();
      }
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function issueActionMessage(data) {
    if (!data || !data.status) return "Действие сохранено.";
    if (data.status === "ignored") return "Проблема проигнорирована. Она не будет блокировать следующий плановый аудит.";
    if (data.status === "resolved") return "Проблема проверена повторно и больше не обнаружена.";
    if (data.status === "still_present") return "Проблема проверена повторно и всё ещё присутствует.";
    if (data.status === "needs_manual_fix") return "Исправление требует ручной проверки. Используйте предложенное исправление или YAML-фрагмент в карточке проблемы.";
    if (data.status === "needs_review") return "Проблема помечена для ручной проверки.";
    return `Действие сохранено: ${localizeStatus(data.status)}`;
  }

  function localizeSeverity(value) {
    const labels = {
      low: "низкая",
      medium: "средняя",
      high: "высокая",
      critical: "критическая",
      unknown: "неизвестно"
    };
    return labels[value] || value;
  }

  function localizeStatus(value) {
    const labels = {
      open: "открыта",
      ignored: "проигнорирована",
      resolved: "решена",
      still_present: "всё ещё присутствует",
      needs_manual_fix: "нужно ручное исправление",
      needs_review: "нужна проверка",
      not_run: "ещё не запускался",
      disabled: "отключён",
      completed: "завершён",
      blocked_unresolved_previous_issues: "заблокирован нерешёнными проблемами"
    };
    return labels[value] || value;
  }

  function localizeSummaryKey(value) {
    const labels = {
      devices: "Устройства",
      entities: "Сущности",
      states: "Состояния",
      automations: "Автоматизации",
      scripts: "Скрипты",
      issues: "Проблемы",
      suggestions: "Рекомендации",
      ai_available: "AI-анализ доступен",
      broken_entity_references: "Битые ссылки на сущности",
      unavailable_entities: "Недоступные сущности"
    };
    return labels[value] || value;
  }

  if (!customElements.get("ai-home-auditor-panel")) {
    customElements.define("ai-home-auditor-panel", AIHomeAuditorPanel);
  }
})();
