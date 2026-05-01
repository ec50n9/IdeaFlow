import { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

function clearStorageAndReload() {
  try {
    localStorage.removeItem('mindflow-storage');
  } catch {
    // ignore
  }
  window.location.reload();
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-screen h-screen flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-md w-full flex flex-col gap-6 text-center">
            <div className="mx-auto p-4 rounded-2xl bg-destructive/10 text-destructive">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">页面加载出错</h1>
              <p className="text-muted-foreground text-sm mt-2">
                本地数据可能已损坏，导致应用无法正常启动。
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button onClick={this.handleReset} variant="outline" className="gap-2">
                <RotateCcw className="w-4 h-4" />
                尝试重新渲染
              </Button>
              <Button onClick={clearStorageAndReload} variant="destructive" className="gap-2">
                <Trash2 className="w-4 h-4" />
                清除本地数据并刷新
              </Button>
            </div>
            {this.state.error && (
              <pre className="text-left text-xs text-muted-foreground bg-muted p-3 rounded-lg overflow-auto">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
