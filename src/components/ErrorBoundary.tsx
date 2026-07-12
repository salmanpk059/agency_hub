import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<Props, State> {
  constructor(p: Props) {
    super(p);
    (this as any).state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    const s: State = (this as any).state;
    const p: Props = (this as any).props;
    if (s.hasError) {
      return (
        <div className="min-h-screen bg-[#0B1628] flex items-center justify-center p-8">
          <div className="bg-[#131E35] border border-brand-border-dark rounded-xl p-8 max-w-md text-center shadow-lg">
            <div className="w-16 h-16 mx-auto mb-4 bg-rose-500/20 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-white mb-2">Something went wrong</h2>
            <p className="text-sm text-slate-400 mb-6">An unexpected error occurred. Please try refreshing the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-brand-accent hover:bg-brand-accent-hover text-white text-sm font-bold rounded transition cursor-pointer"
            >
              Refresh Page
            </button>
            {s.error && (
              <details className="mt-4 text-left">
                <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-300">Error details</summary>
                <pre className="mt-2 text-[10px] text-rose-300 bg-brand-dark/40 p-2 rounded overflow-auto max-h-32">{s.error.message}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return p.children;
  }
}

export default ErrorBoundary;
