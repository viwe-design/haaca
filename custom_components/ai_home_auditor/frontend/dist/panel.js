import { LitElement, css, html } from "lit";

class AIHomeAuditorPanel extends LitElement {
  static properties = {
    activeTab: { state: true },
    loading: { state: true },
    error: { state: true },
    report: { state: true },
    previewDiff: { state: true },
    backups: { state: true }
  };

  static styles = css`
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

    pre {
      overflow: auto;
      white-space: pre-wrap;
      border-radius: 10px;
      padding: 12px;
      background: var(--code-editor-background-color, #111827);
      color: var(--code-editor-text-color, #e5e7eb);
    }

    textarea {
      min-height: 220px;
      width: 100%;
      box-sizing: border-box;
      border-radius: 10px;
      padding: 12px;
      color: var(--primary-text-color);
      background: var(--card-background-color);
      border: 1px solid var(--divider-color);
    }
  `;

  constructor() {
    super();
    this.activeTab = "overview";
    this.loading = false;
    this.error = "";
    this.report = {};
    this.previewDiff = "";
    this.backups = [];
  }

  connectedCallback() {
    super.connectedCallback();
    void this.loadReport();
  }

  render() {
    return html`
      <h1>AI Home Assistant Auditor</h1>
      <div class="tabs">
        ${this.tabButton("overview", "Overview")}
        ${this.tabButton("problems", "Problems")}
        ${this.tabButton("suggestions", "Suggestions")}
        ${this.tabButton("autoFix", "Auto Fix")}
        ${this.tabButton("backups", "Backups")}
        ${this.tabButton("settings", "Settings")}
      </div>

      <div class="toolbar">
        <button @click=${this.scan}>Scan</button>
        <button @click=${this.analyze}>Analyze</button>
        <button @click=${this.loadReport}>Refresh report</button>
      </div>

      ${this.loading ? html`<p>Loading...</p>` : ""}
      ${this.error ? html`<p class="error">${this.error}</p>` : ""}
      ${this.renderTab()}
    `;
  }

  tabButton(tab, label) {
    return html`
      <button class=${this.activeTab === tab ? "active" : ""} @click=${() => (this.activeTab = tab)}>
        ${label}
      </button>
    `;
  }

  renderTab() {
    if (this.activeTab === "overview") return this.renderOverview();
    if (this.activeTab === "problems") return this.renderProblems();
    if (this.activeTab === "suggestions") return this.renderSuggestions();
    if (this.activeTab === "autoFix") return this.renderAutoFix();
    if (this.activeTab === "backups") return this.renderBackups();
    return this.renderSettings();
  }

  renderOverview() {
    const summary = this.report.summary ?? {};
    const scheduleStatus = this.report.schedule_status ?? {};
    const unresolvedCount = scheduleStatus.unresolved_issues?.length ?? 0;
    return html`
      <div class="card">
        <h2>Daily audit</h2>
        <p><strong>Status:</strong> ${scheduleStatus.status ?? "not_run"}</p>
        ${scheduleStatus.updated_at ? html`<p><strong>Updated:</strong> ${scheduleStatus.updated_at}</p>` : ""}
        ${unresolvedCount ? html`<p><strong>Blocked by unresolved issues:</strong> ${unresolvedCount}</p>` : ""}
      </div>
      <br />
      <div class="grid">
        ${Object.entries(summary).map(
          ([key, value]) => html`<div class="card"><strong>${key}</strong><p>${String(value)}</p></div>`
        )}
      </div>
    `;
  }

  renderProblems() {
    const issues = this.report.issues ?? [];
    return html`
      <div class="grid">
        ${issues.map(
          (issue) => html`
            <div class="card issue ${issue.severity}">
              <h3>${issue.title}</h3>
              <p>${issue.explanation}</p>
              <p><strong>Severity:</strong> ${issue.severity}</p>
              <p><strong>Risk:</strong> ${issue.risk}</p>
              ${issue.entity_id ? html`<p><strong>Entity:</strong> ${issue.entity_id}</p>` : ""}
              ${issue.suggested_fix ? html`<p><strong>Fix:</strong> ${issue.suggested_fix}</p>` : ""}
              ${issue.yaml_fix ? html`<pre>${issue.yaml_fix}</pre>` : ""}
            </div>
          `
        )}
      </div>
    `;
  }

  renderSuggestions() {
    const suggestions = this.report.suggestions ?? [];
    return html`
      <div class="grid">
        ${suggestions.map((suggestion) => html`<div class="card"><pre>${JSON.stringify(suggestion, null, 2)}</pre></div>`)}
      </div>
    `;
  }

  renderAutoFix() {
    return html`
      <div class="card">
        <h2>Manual fix preview</h2>
        <p>Paste complete replacement YAML for a Home Assistant config file. Applying requires confirmation and creates a backup first.</p>
        <input id="path" placeholder="automations.yaml" value="automations.yaml" />
        <textarea id="content" placeholder="New file content"></textarea>
        <div class="toolbar">
          <button @click=${this.previewFix}>Preview diff</button>
        </div>
        ${this.previewDiff ? html`<pre>${this.previewDiff}</pre>` : ""}
      </div>
    `;
  }

  renderBackups() {
    return html`
      <div class="toolbar"><button @click=${this.loadBackups}>Load backups</button></div>
      <div class="grid">
        ${this.backups.map(
          (backup) => html`
            <div class="card">
              <pre>${JSON.stringify(backup, null, 2)}</pre>
              <button @click=${() => this.rollback(String(backup.backup_id))}>Rollback</button>
            </div>
          `
        )}
      </div>
    `;
  }

  renderSettings() {
    return html`
      <div class="card">
        <h2>Settings</h2>
        <p>Configure API key, base URL, model, dry-run mode, and auto-fix allowlist in the Home Assistant integration options.</p>
      </div>
    `;
  }

  async loadReport() {
    await this.request("GET", "/api/ai_home_auditor/report", undefined, (data) => {
      this.report = data;
    });
  }

  async scan() {
    await this.request("POST", "/api/ai_home_auditor/scan", {}, () => this.analyze());
  }

  async analyze() {
    await this.request("POST", "/api/ai_home_auditor/analyze", {}, (data) => {
      this.report = data;
    });
  }

  async previewFix() {
    const path = this.shadowRoot?.querySelector("#path")?.value ?? "";
    const content = this.shadowRoot?.querySelector("#content")?.value ?? "";
    await this.request("POST", "/api/ai_home_auditor/preview_fix", { relative_path: path, new_content: content }, (data) => {
      this.previewDiff = String(data.diff ?? "");
    });
  }

  async loadBackups() {
    await this.request("GET", "/api/ai_home_auditor/backups", undefined, (data) => {
      this.backups = data.backups ?? [];
    });
  }

  async rollback(backupId) {
    if (!confirm(`Rollback backup ${backupId}?`)) return;
    await this.request("POST", "/api/ai_home_auditor/rollback", { backup_id: backupId }, () => this.loadBackups());
  }

  async request(method, url, body, onSuccess) {
    this.loading = true;
    this.error = "";
    try {
      const response = await fetch(url, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      if (!response.ok) throw new Error(await response.text());
      onSuccess(await response.json());
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.loading = false;
    }
  }
}

customElements.define("ai-home-auditor-panel", AIHomeAuditorPanel);
