import { Component, type ReactNode } from "react";
import { Icon } from "./icons";

/** Keeps one broken view from blanking the whole overlay. */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.warn(`[nexis] ${this.props.label} view crashed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-state">
        <div className="error-card">
          <span className="error-icon">
            <Icon name="warning" size={22} />
          </span>
          <h2>This tab hit a problem</h2>
          <p>{this.state.error.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      </div>
    );
  }
}
