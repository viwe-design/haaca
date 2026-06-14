import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("ai-home-auditor-problem-card")
export class AIHomeAuditorProblemCard extends LitElement {
  @property({ type: Object }) issue: Record<string, unknown> = {};

  static styles = css`
    :host {
      display: block;
      border: 1px solid var(--divider-color);
      border-left: 4px solid var(--warning-color);
      border-radius: 14px;
      padding: 16px;
      background: var(--card-background-color);
    }
  `;

  protected render() {
    return html`
      <h3>${String(this.issue.title ?? "Problem")}</h3>
      <p>${String(this.issue.explanation ?? "")}</p>
      <p><strong>Severity:</strong> ${String(this.issue.severity ?? "unknown")}</p>
      <p><strong>Risk:</strong> ${String(this.issue.risk ?? "unknown")}</p>
    `;
  }
}
