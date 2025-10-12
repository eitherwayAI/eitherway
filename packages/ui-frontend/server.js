import { createRequestHandler } from '@remix-run/express';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// FORCE PRODUCTION MODE
process.env.NODE_ENV = 'production';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Додаємо заголовки для SharedArrayBuffer для всіх запитів
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// PRODUCTION STATIC FILES
app.use(
  express.static('build/client', {
    maxAge: '1y',
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.wasm')) {
        res.setHeader('Content-Type', 'application/wasm');
      }

      // Додаємо заголовки для SharedArrayBuffer
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    },
  }),
);

// PRODUCTION BUILD - NOT DEV
const build = await import('./build/server/index.js');

// ALL ROUTES TO REMIX
app.all(
  '*',
  createRequestHandler({
    build,
    mode: 'production',
  }),
);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`PRODUCTION Express server on port ${port}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`Static files cached, pre-built pages served`);
});
