import { AlertTriangle } from "lucide-react";
import { Component, type ReactNode } from "react";

type GraphErrorBoundaryProps = {
  children: ReactNode;
  resetKey: string;
};

type GraphErrorBoundaryState = {
  error: Error | null;
};

export class GraphErrorBoundary extends Component<
  GraphErrorBoundaryProps,
  GraphErrorBoundaryState
> {
  state: GraphErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): GraphErrorBoundaryState {
    return { error };
  }

  componentDidUpdate(previousProps: GraphErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="absolute inset-0 z-20 grid place-items-center bg-white/80 backdrop-blur">
        <div className="w-[420px] rounded-lg border border-red-200 bg-red-50 p-5 text-red-900 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            그래프 렌더링 실패
          </div>
          <p className="text-sm leading-6">{this.state.error.message}</p>
        </div>
      </div>
    );
  }
}
