import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Read the initial target from environment or use default
const defaultTarget = 'http://provider.gpufarm.xyz:31617';
let proxyTarget = defaultTarget;

// Function to update the proxy target
export const updateProxyTarget = (newTarget) => {
  // Ensure URL has protocol
  if (!newTarget.startsWith('http://') && !newTarget.startsWith('https://')) {
    newTarget = 'http://' + newTarget;
  }
  proxyTarget = newTarget;
  console.log('Updated proxy target:', proxyTarget);
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'proxy-update',
      configureServer(server) {
        server.middlewares.use('/@vite/proxy-update', (req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const { target } = JSON.parse(body);
                updateProxyTarget(target);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error.message }));
              }
            });
          } else {
            res.writeHead(405);
            res.end();
          }
        });
      }
    }
  ],
  server: {
    port: 3000,
    cors: {
      origin: '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true
    },
    proxy: {
      '/api': {
        target: defaultTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('Proxy Error:', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            try {
              if (proxyTarget) {
                // Ensure URL has protocol
                let target = proxyTarget;
                if (!target.startsWith('http://') && !target.startsWith('https://')) {
                  target = 'http://' + target;
                }
                proxy.options.target = target;
                
                console.log('Outgoing Request:', {
                  method: req.method,
                  url: req.url,
                  target: proxy.options.target,
                  headers: proxyReq.getHeaders()
                });
              }
            } catch (error) {
              console.error('Invalid target URL:', error);
            }
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Response:', {
              statusCode: proxyRes.statusCode,
              url: req.url
            });
          });
        }
      }
    }
  }
}) 