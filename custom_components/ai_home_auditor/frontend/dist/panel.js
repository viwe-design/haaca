(function () {
  const tabs = [
    ["overview", "Overview"],
    ["problems", "Problems"],
    ["suggestions", "Suggestions"],
    ["autoFix", "Auto Fix"],
    ["backups", "Backups"],
    ["settings", "Settings"]
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
            padding: 24px;
            color: var(--primary-text-color);
          }

          .tabs {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 20px;
          }

          button {
            border: 1px solid var(--divider-color);
            border-radius: 10px;
            padding: 10px 14px;
            background: var(--card-background-color);
            color: var(--primary-text-color);
            cursor: pointer;
          }

          button.active {
            background: var(--primary-color);
            color: var(--text-primary-color);
          }

          input,
          textarea {
            width: 100%;
            box-sizing: border-box;
            border-radius: 10px;
            padding: 12px;
            color: var(--primary-text-color);
            background: var(--card-background-color);
            border: 1px solid var(--divider-color);
          }

          textarea {
            min-height: 220px;
            margin-top: 10px;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            gap: 12px;
          }

          .card {
            border: 1px solid var(--divider-color);
            border-radius: 14px;
            padding: 16px;
            background: var(--card-background-color);
            box-shadow: var(--ha-card-box-shadow, none);
          }

          .toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 16px;
          }

          .issue {
            border-left: 4px solid var(--warning-color);
          }

          .issue.high,
          .issue.critical {
            border-left-color: var(--error-color);
          }

          .error {
            color: var(--error-color);
          }

          pre {
            overflow: auto;
            white-space: pre-wrap;
            border-radius: 10px;
            padding: 12px;
            background: var(--code-editor-background-color, #111827);
            color: var(--code-editor-text-color, #e5e7eb);
          }
        </style>
        <h1>AI Home Assistant Auditor</h1>
        <div class="tabs">
          ${tabs
            .map(
              ([tab, label]) =>
                `<button data-tab="${tab}" class="${this.activeTab === tab ? "active" : ""}">${label}</button>`
            )
            .join("")}
        </div>
        <div class="toolbar">
          <button data-action="scan">Scan</button>
          <button data-action="analyze">Analyze</button>
          <button data-action="refresh">Refresh report</button>
        </div>
        ${this.loading ? "<p>Loading...</p>" : ""}
        ${this.error ? `<p class="error">${escapeHtml(this.error)}</p>` : ""}
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
          <h2>Daily audit</h2>
          <p><strong>Status:</strong> ${escapeHtml(scheduleStatus.status || "not_run")}</p>
          ${
            scheduleStatus.updated_at
              ? `<p><strong>Updated:</strong> ${escapeHtml(scheduleStatus.updated_at)}</p>`
              : ""
          }
          ${unresolvedCount ? `<p><strong>Blocked by unresolved issues:</strong> ${unresolvedCount}</p>` : ""}
        </div>
        <br>
        <div class="grid">
          ${Object.entries(summary)
            .map(
              ([key, value]) =>
                `<div class="card"><strong>${escapeHtml(key)}</strong><p>${escapeHtml(String(value))}</p></div>`
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
                  <h3>${escapeHtml(issue.title || "Problem")}</h3>
                  <p>${escapeHtml(issue.explanation || "")}</p>
                  <p><strong>Severity:</strong> ${escapeHtml(issue.severity || "unknown")}</p>
                  <p><strong>Risk:</strong> ${escapeHtml(issue.risk || "unknown")}</p>
                  ${issue.entity_id ? `<p><strong>Entity:</strong> ${escapeHtml(issue.entity_id)}</p>` : ""}
                  ${issue.suggested_fix ? `<p><strong>Fix:</strong> ${escapeHtml(issue.suggested_fix)}</p>` : ""}
                  ${issue.yaml_fix ? `<pre>${escapeHtml(issue.yaml_fix)}</pre>` : ""}
                </div>
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
          <h2>Manual fix preview</h2>
          <p>Paste complete replacement YAML for a Home Assistant config file. Applying requires confirmation and creates a backup first.</p>
          <input id="path" placeholder="automations.yaml" value="automations.yaml">
          <textarea id="content" placeholder="New file content"></textarea>
          <div class="toolbar">
            <button data-action="previewFix">Preview diff</button>
          </div>
          ${this.previewDiff ? `<pre>${escapeHtml(this.previewDiff)}</pre>` : ""}
        </div>
      `;
    }

    renderBackups() {
      return `
        <div class="toolbar">
          <button data-action="loadBackups">Load backups</button>
        </div>
        <div class="grid">
          ${this.backups
            .map(
              (backup) => `
                <div class="card">
                  <pre>${escapeHtml(JSON.stringify(backup, null, 2))}</pre>
                  <button data-rollback="${escapeAttribute(String(backup.backup_id || ""))}">Rollback</button>
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
          <h2>Settings</h2>
          <p>Configure API key, base URL, model, dry-run mode, and auto-fix allowlist in the Home Assistant integration options.</p>
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
      if (!backupId || !window.confirm(`Rollback backup ${backupId}?`)) return;
      await this.request("POST", "/api/ai_home_auditor/rollback", { backup_id: backupId }, () => this.loadBackups());
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

  if (!customElements.get("ai-home-auditor-panel")) {
    customElements.define("ai-home-auditor-panel", AIHomeAuditorPanel);
  }
})();
