import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Auto-detect if backend is using HTTPS
const certsDir = resolve(__dirname, '../../.certs');
const useHttps = existsSync(resolve(certsDir, 'localhost-cert.pem')) &&
                 existsSync(resolve(certsDir, 'localhost-key.pem'));

const backendProtocol = useHttps ? 'https' : 'http';
const backendTarget = `${backendProtocol}://localhost:3001`;

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'configure-response-headers',
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          // Enable Cross-Origin Isolation for WebContainer
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
          res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
          next();
        });
      }
    }
  ],
  server: {
    port: 5173, // Changed from 3000 to avoid conflict with WebContainer
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
        ws: true,
        // Trust self-signed certificates in development
        secure: false
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
