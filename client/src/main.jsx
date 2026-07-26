import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

class GlobalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[Global ErrorBoundary Caught Exception]:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-6 font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-rose-500/40 rounded-2xl p-6 shadow-2xl text-center space-y-4">
            <h2 className="text-lg font-black text-rose-400">⚠️ 예기치 않은 오류가 발생했습니다</h2>
            <p className="text-xs text-slate-400">앱 세션 데이터를 보호하기 위해 동기화 복구를 준비했습니다.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold text-xs shadow-md cursor-pointer transition-all"
            >
              앱 새로고침
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Global unhandled promise rejection safeguard
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[Global Safeguard] Prevented unhandled promise rejection crash:', event.reason);
    event.preventDefault();
  });
}

const app = (
  <GlobalErrorBoundary>
    <App />
  </GlobalErrorBoundary>
);

ReactDOM.createRoot(document.getElementById('root')).render(
  import.meta.env.DEV ? <React.StrictMode>{app}</React.StrictMode> : app
);

if (import.meta.env.PROD) {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(reg => console.log('Service Worker registered', reg))
        .catch(err => console.warn('Service Worker registration failed', err));
    });
  }
} else {
  // 개발 환경(localhost 등)에서는 이미 등록된 서비스 워커가 캐시 문제를 일으킬 수 있으므로 강제 해제합니다.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('Successfully unregistered service worker in development mode.');
          }
        });
      }
    });
    if (window.caches) {
      caches.keys().then((names) => {
        for (const name of names) {
          caches.delete(name);
        }
      });
    }
  }
}
