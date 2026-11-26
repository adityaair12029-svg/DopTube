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
        <div className="min-h-screen flex items-center justify-center p-6 bg-white dark:bg-black text-[#0f1419] dark:text-[#e7e9ea]">
          <div className="max-w-md w-full rounded-2xl border border-[#e5e7eb] dark:border-[#2f3336] p-6 text-center space-y-3">
            <h1 className="text-lg font-bold">Something went wrong</h1>
            <p className="text-sm text-[#536471] dark:text-[#71767b] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-9 px-5 rounded-full bg-[#0f1419] dark:bg-white text-white dark:text-black text-sm font-bold cursor-pointer"
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
