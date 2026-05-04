import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex items-start justify-center min-h-[200px] p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-lg w-full">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-shrink-0 w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-600" />
            </div>
            <h3 className="text-sm font-semibold text-red-800">
              {this.props.label ?? 'Something went wrong'}
            </h3>
          </div>
          <p className="text-xs text-red-600 mb-1 ml-11">
            This section encountered an unexpected error. The rest of the app is still usable.
          </p>
          {this.state.error?.message && (
            <p className="text-xs text-red-400 font-mono ml-11 mb-4 break-all">
              {this.state.error.message}
            </p>
          )}
          <div className="ml-11">
            <button
              onClick={this.handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
            >
              <RefreshCw size={12} />
              Reload Section
            </button>
          </div>
        </div>
      </div>
    );
  }
}
