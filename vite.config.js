import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleSupportRequest } from './functions/_shared/grok-support.js';

function localSupportEndpoint() {
  return {
    name: 'nargis-local-support-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/customer-support', async (req, res) => {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);
        const request = new Request('http://localhost/api/customer-support', {
          method: req.method,
          headers: { 'content-type': req.headers['content-type'] || 'application/json', 'content-length': String(body.length) },
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
        });
        const env = loadEnv(server.config.mode, process.cwd(), '');
        const response = await handleSupportRequest(request, {
          GROK_API_KEY: env.GROK_API_KEY,
          GROK_MODEL: env.GROK_MODEL,
          SUPABASE_URL: env.SUPABASE_URL || env.VITE_SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY,
        });
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localSupportEndpoint()],
  build: { target: 'es2022' },
});
