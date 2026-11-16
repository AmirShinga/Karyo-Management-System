import { Component } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface details in the console for debugging; swap for a logger in production.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="error-boundary">
        <div className="error-boundary-card" role="alert">
          <span className="error-boundary-icon" aria-hidden="true">
            <AlertTriangle size={28} />
          </span>
          <h1>Something went wrong</h1>
          <p className="text-muted">
            An unexpected error interrupted this screen. You can try again, or reload the page.
          </p>
          {import.meta.env.DEV && error?.message && (
            <pre className="error-boundary-detail">{error.message}</pre>
          )}
          <div className="error-boundary-actions">
            <button type="button" className="btn btn-secondary" onClick={this.handleReset}>
              Try again
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              <RotateCcw size={16} aria-hidden="true" />
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
