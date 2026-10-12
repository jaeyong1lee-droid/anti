import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const app = <App />;

ReactDOM.createRoot(document.getElementById('root')).render(
  import.meta.env.DEV ? <React.StrictMode>{app}</React.StrictMode> : app
);

// 🛡️ Vercel 신규 배포 시 브라우저에 남은 구버전 캐시/청크 404 발생 시 자동 갱신
window.addEventListener('vite:preloadError', (event) => {
  console.warn('[Vite Preload Error] 신규 배포 에셋 감지됨. 페이지를 최신 버전으로 새로고침합니다...', event);
  window.location.reload();
});

window.addEventListener('error', (e) => {
  if (e && e.message && (
    e.message.includes('Failed to fetch dynamically imported module') ||
    e.message.includes('Loading chunk') ||
    e.message.includes('Loading CSS chunk')
  )) {
    console.warn('[Chunk Load Error] 구버전 번들 에셋 404 감지. 최신 버전으로 자동 갱신합니다...', e.message);
    window.location.reload();
  }
});

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
