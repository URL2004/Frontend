// dev 전용 설정(2026-08-28): /blog·/templates 정적 콘텐츠를 SPA 폴백보다 먼저 서빙한다.
// 운영(Vercel)은 원래 정적 파일이 rewrite보다 우선이라, 이 플러그인이 dev를 운영과 동일하게 맞춘다.
// (빌드 스크립트 build-vite-static.mjs는 configFile:false로 이 설정과 무관하게 동작)
import fs from 'node:fs/promises';
import path from 'node:path';

export default {
  appType: 'spa',
  plugins: [
    {
      name: 'gp-static-content-pages',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = String(req.url || '').split('?')[0];
          if (!/^\/(blog|templates)(\/|$)/.test(url)) return next();
          let rel = url.replace(/\/+$/, '');
          if (!/\.[a-z0-9]+$/i.test(rel)) rel += '/index.html';
          const file = path.join(process.cwd(), rel.replace(/^\//, ''));
          fs.readFile(file)
            .then((buf) => {
              res.setHeader('Content-Type', 'text/html; charset=utf-8');
              res.end(buf);
            })
            .catch(() => next());
        });
      }
    }
  ]
};
