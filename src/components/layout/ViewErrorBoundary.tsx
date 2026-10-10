import { Component, type ErrorInfo, type ReactNode } from "react";
import { ErrorState } from "@/components/data/parts";
import { reportError } from "../../lib/log";

/**
 * One tab's crash stays in that tab: the rest of the window, and every
 * other tab, keeps working. "Try again" remounts the view.
 */
export class ViewErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportError("View crash", error, info.componentStack ?? undefined);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex h-full flex-col">
        <ErrorState error={`This view hit an error: ${error.message || error.name}`} onRetry={() => this.setState({ error: null })} />
      </div>
    );
  }
}
