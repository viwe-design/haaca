import { LitElement, css, html } from "lit";
import { customElement, state } from "lit/decorators.js";

type Tab = "overview" | "problems" | "suggestions" | "autoFix" | "backups" | "settings";

interface AuditIssue {
  issue_id: string;
  kind: string;
  title: string;
  explanation: string;
  severity: "low" | "medium" | "high" | "critical";
  risk: "low" | "medium" | "high" | "critical";
  source?: string;
  source_id?: string;
  entity_id?: string;
  suggested_fix?: string;
  yaml_fix?: string;
  action_status?: string;
  available_actions?: Array<{ id: string; label: string }>;
}

interface AuditReport {
  generated_at?: string;
  summary?: Record<string, unknown>;
  issues?: AuditIssue[];
  suggestions?: Record<string, unknown>[];
  schedule_status?: {
    status?: string;
    updated_at?: string;
    unresolved_issues?: Record<string, unknown>[];
  };
}

@customElement("ai-home-auditor-panel")
export class AIHomeAuditorPanel extends LitElement {
  public hass?: {
    callApi: (method: string, path: string, body?: unknown) => Promise<unknown>;
  };

  @state() private activeTab: Tab = "overview";
  @state() private loading = false;
  @state() private error = "";
  @state() private report: AuditReport = {};
  @state() private previewDiff = "";
  @state() private backups: Record<string, unknown>[] = [];
  @state() private actionResult = "";

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
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .status {
      display: inline-block;
      border-radius: 999px;
      padding: 4px 10px;
      background: var(--secondary-background-color);
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

  connectedCallback(): void {
    super.connectedCallback();
    void this.loadReport();
  }

  protected render() {
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
      ${this.actionResult ? html`<p class="card">${this.actionResult}</p>` : ""}
      ${this.renderTab()}
    `;
  }

  private tabButton(tab: Tab, label: string) {
    return html`
      <button class=${this.activeTab === tab ? "active" : ""} @click=${() => (this.activeTab = tab)}>
        ${label}
      </button>
    `;
  }

  private renderTab() {
    if (this.activeTab === "overview") return this.renderOverview();
    if (this.activeTab === "problems") return this.renderProblems();
    if (this.activeTab === "suggestions") return this.renderSuggestions();
    if (this.activeTab === "autoFix") return this.renderAutoFix();
    if (this.activeTab === "backups") return this.renderBackups();
    return this.renderSettings();
  }

  private renderOverview() {
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

  private renderProblems() {
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
              <p><strong>Status:</strong> <span class="status">${issue.action_status ?? "open"}</span></p>
              ${issue.entity_id ? html`<p><strong>Entity:</strong> ${issue.entity_id}</p>` : ""}
              ${issue.suggested_fix ? html`<p><strong>Fix:</strong> ${issue.suggested_fix}</p>` : ""}
              ${issue.yaml_fix ? html`<pre>${issue.yaml_fix}</pre>` : ""}
              <div class="actions">
                ${(issue.available_actions ?? []).map(
                  (action) => html`
                    <button @click=${() => this.issueAction(issue.issue_id, action.id)}>
                      ${action.label}
                    </button>
                  `
                )}
              </div>
            </div>
          `
        )}
      </div>
    `;
  }

  private renderSuggestions() {
    const suggestions = this.report.suggestions ?? [];
    return html`
      <div class="grid">
        ${suggestions.map((suggestion) => html`<div class="card"><pre>${JSON.stringify(suggestion, null, 2)}</pre></div>`)}
      </div>
    `;
  }

  private renderAutoFix() {
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

  private renderBackups() {
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

  private renderSettings() {
    return html`
      <div class="card">
        <h2>Settings</h2>
        <p>Configure API key, base URL, model, dry-run mode, and auto-fix allowlist in the Home Assistant integration options.</p>
      </div>
    `;
  }

  private async loadReport() {
    await this.request("GET", "/api/ai_home_auditor/report", undefined, (data) => {
      this.report = data as AuditReport;
    });
  }

  private async scan() {
    await this.request("POST", "/api/ai_home_auditor/scan", {}, () => this.analyze());
  }

  private async analyze() {
    await this.request("POST", "/api/ai_home_auditor/analyze", {}, (data) => {
      this.report = data as AuditReport;
    });
  }

  private async previewFix() {
    const path = this.shadowRoot?.querySelector<HTMLInputElement>("#path")?.value ?? "";
    const content = this.shadowRoot?.querySelector<HTMLTextAreaElement>("#content")?.value ?? "";
    await this.request("POST", "/api/ai_home_auditor/preview_fix", { relative_path: path, new_content: content }, (data) => {
      this.previewDiff = String((data as { diff?: string }).diff ?? "");
    });
  }

  private async loadBackups() {
    await this.request("GET", "/api/ai_home_auditor/backups", undefined, (data) => {
      this.backups = (data as { backups?: Record<string, unknown>[] }).backups ?? [];
    });
  }

  private async rollback(backupId: string) {
    if (!confirm(`Rollback backup ${backupId}?`)) return;
    await this.request("POST", "/api/ai_home_auditor/rollback", { backup_id: backupId }, () => this.loadBackups());
  }

  private async issueAction(issueId: string, action: string) {
    await this.request("POST", "/api/ai_home_auditor/issue_action", { issue_id: issueId, action }, (data) => {
      this.actionResult = issueActionMessage(data as { status?: string });
      void this.loadReport();
    });
  }

  private async request(method: string, url: string, body: unknown, onSuccess: (data: unknown) => void) {
    this.loading = true;
    this.error = "";
    try {
      if (this.hass?.callApi) {
        const apiPath = url.replace(/^\/api\//, "");
        onSuccess(await this.hass.callApi(method, apiPath, body));
        return;
      }

      const response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
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

function issueActionMessage(data: { status?: string }): string {
  if (data.status === "ignored") return "Issue ignored. It will not block the next scheduled audit.";
  if (data.status === "resolved") return "Issue rechecked and no longer present.";
  if (data.status === "still_present") return "Issue rechecked and is still present.";
  if (data.status === "needs_manual_fix") return "Fix requires manual review. Use the suggested fix or YAML snippet shown in the issue.";
  if (data.status === "needs_review") return "Issue marked for review.";
  return data.status ? `Action saved: ${data.status}` : "Action saved.";
}
