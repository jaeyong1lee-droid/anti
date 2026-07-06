import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME_MS__: Date.now(),
    __BUILD_TIME_STR__: JSON.stringify(
      new Date().toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).replace(/\. /g, '.').replace(/\.$/, '')
    )
  },
  build: {
    // 소스맵 제거로 빌드 output 크기 감소
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // React core — 가장 먼저 캐싱됨
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react';
          }
          // 아이콘 라이브러리 — 크고 잘 변경되지 않음
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-lucide';
          }
          // KaTeX 수식 렌더러 — 크고 잘 변경되지 않음
          if (id.includes('node_modules/katex')) {
            return 'vendor-katex';
          }
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
