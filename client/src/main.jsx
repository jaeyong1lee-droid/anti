import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
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
      let unregisteredAny = false;
      const promises = registrations.map(registration => {
        return registration.unregister().then((success) => {
          if (success) {
            unregisteredAny = true;
            console.log('Successfully unregistered service worker in development mode.');
          }
        });
      });
      Promise.all(promises).then(() => {
        if (unregisteredAny) {
          if (window.caches) {
            caches.keys().then((names) => {
              Promise.all(names.map(name => caches.delete(name))).then(() => {
                window.location.reload();
              });
            });
          } else {
            window.location.reload();
          }
        }
      });
    });
  }
}
