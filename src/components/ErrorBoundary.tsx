import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'An unexpected application error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-[#0f0f0f] text-[#0f0f0f] dark:text-[#f1f1f1]">
          <div className="max-w-md w-full rounded-2xl border border-neutral-200 dark:border-[#303030] p-6 text-center space-y-3">
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="text-sm text-[#606060] dark:text-[#aaaaaa] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-9 px-5 rounded-full bg-[#ff0033] text-white text-sm font-semibold cursor-pointer"
            >
              Reload DopTube
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
