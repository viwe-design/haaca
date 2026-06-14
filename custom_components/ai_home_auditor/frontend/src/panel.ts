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

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
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

    .issue {
      border-left: 1px solid rgba(250, 204, 21, 0.55);
    }

    .issue.high,
    .issue.critical {
      border-left-color: rgba(248, 113, 113, 0.78);
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
  `;

  connectedCallback(): void {
    super.connectedCallback();
    void this.loadReport();
  }

  protected render() {
    return html`
      <h1>AI Аудитор Home Assistant</h1>
      <div class="tabs">
        ${this.tabButton("overview", "Обзор")}
        ${this.tabButton("problems", "Проблемы")}
        ${this.tabButton("suggestions", "Рекомендации")}
        ${this.tabButton("autoFix", "Исправления")}
        ${this.tabButton("backups", "Резервные копии")}
        ${this.tabButton("settings", "Настройки")}
      </div>

      <div class="toolbar">
        <button @click=${this.scan}>Сканировать</button>
        <button @click=${this.analyze}>Анализировать</button>
        <button @click=${this.loadReport}>Обновить отчёт</button>
      </div>

      ${this.loading ? html`<p>Загрузка...</p>` : ""}
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
        <h2>Ежедневный аудит</h2>
        <p><strong>Статус:</strong> ${localizeStatus(scheduleStatus.status ?? "not_run")}</p>
        ${scheduleStatus.updated_at ? html`<p><strong>Обновлено:</strong> ${scheduleStatus.updated_at}</p>` : ""}
        ${unresolvedCount ? html`<p><strong>Блокируется нерешёнными проблемами:</strong> ${unresolvedCount}</p>` : ""}
      </div>
      <br />
      <div class="grid">
        ${Object.entries(summary).map(
          ([key, value]) => html`<div class="card"><strong>${localizeSummaryKey(key)}</strong><p>${String(value)}</p></div>`
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
              <p><strong>Критичность:</strong> ${localizeSeverity(issue.severity)}</p>
              <p><strong>Риск:</strong> ${localizeSeverity(issue.risk)}</p>
              <p><strong>Статус:</strong> <span class="status">${localizeStatus(issue.action_status ?? "open")}</span></p>
              ${issue.entity_id ? html`<p><strong>Сущность:</strong> ${issue.entity_id}</p>` : ""}
              ${issue.suggested_fix ? html`<p><strong>Исправление:</strong> ${issue.suggested_fix}</p>` : ""}
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
        <h2>Предпросмотр ручного исправления</h2>
        <p>Вставьте полный YAML для замены файла конфигурации Home Assistant. Применение требует подтверждения и сначала создаёт резервную копию.</p>
        <input id="path" placeholder="automations.yaml" value="automations.yaml" />
        <textarea id="content" placeholder="Новое содержимое файла"></textarea>
        <div class="toolbar">
          <button @click=${this.previewFix}>Показать diff</button>
        </div>
        ${this.previewDiff ? html`<pre>${this.previewDiff}</pre>` : ""}
      </div>
    `;
  }

  private renderBackups() {
    return html`
      <div class="toolbar"><button @click=${this.loadBackups}>Загрузить резервные копии</button></div>
      <div class="grid">
        ${this.backups.map(
          (backup) => html`
            <div class="card">
              <pre>${JSON.stringify(backup, null, 2)}</pre>
              <button @click=${() => this.rollback(String(backup.backup_id))}>Откатить</button>
            </div>
          `
        )}
      </div>
    `;
  }

  private renderSettings() {
    return html`
      <div class="card">
        <h2>Настройки</h2>
        <p>API-ключ, базовый URL, модель, dry-run режим и список разрешённых автоисправлений настраиваются в параметрах интеграции Home Assistant.</p>
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
    if (!confirm(`Откатить резервную копию ${backupId}?`)) return;
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
  if (data.status === "ignored") return "Проблема проигнорирована. Она не будет блокировать следующий плановый аудит.";
  if (data.status === "resolved") return "Проблема проверена повторно и больше не обнаружена.";
  if (data.status === "still_present") return "Проблема проверена повторно и всё ещё присутствует.";
  if (data.status === "needs_manual_fix") return "Исправление требует ручной проверки. Используйте предложенное исправление или YAML-фрагмент в карточке проблемы.";
  if (data.status === "needs_review") return "Проблема помечена для ручной проверки.";
  return data.status ? `Действие сохранено: ${localizeStatus(data.status)}` : "Действие сохранено.";
}

function localizeSeverity(value: string): string {
  const labels: Record<string, string> = {
    low: "низкая",
    medium: "средняя",
    high: "высокая",
    critical: "критическая",
    unknown: "неизвестно",
  };
  return labels[value] ?? value;
}

function localizeStatus(value: string): string {
  const labels: Record<string, string> = {
    open: "открыта",
    ignored: "проигнорирована",
    resolved: "решена",
    still_present: "всё ещё присутствует",
    needs_manual_fix: "нужно ручное исправление",
    needs_review: "нужна проверка",
    not_run: "ещё не запускался",
    disabled: "отключён",
    completed: "завершён",
    blocked_unresolved_previous_issues: "заблокирован нерешёнными проблемами",
  };
  return labels[value] ?? value;
}

function localizeSummaryKey(value: string): string {
  const labels: Record<string, string> = {
    devices: "Устройства",
    entities: "Сущности",
    states: "Состояния",
    automations: "Автоматизации",
    scripts: "Скрипты",
    issues: "Проблемы",
    suggestions: "Рекомендации",
    ai_available: "AI-анализ доступен",
    broken_entity_references: "Битые ссылки на сущности",
    unavailable_entities: "Недоступные сущности",
  };
  return labels[value] ?? value;
}
