import { app, ensureServerReady } from './_app.mjs';

export default async function handler(req, res) {
  try {
    await ensureServerReady();
    if (req.url && req.url.includes('__vercel_path=')) {
      const parsed = new URL(req.url, 'https://doptube.vercel.app');
      const vpath = parsed.searchParams.get('__vercel_path') || '';
      parsed.searchParams.delete('__vercel_path');
      const qs = parsed.searchParams.toString();
      req.url = `/api/${vpath.replace(/^\/+/, '')}${qs ? `?${qs}` : ''}`;
    }
    return app(req, res);
  } catch (err) {
    console.error('Vercel API handler failure:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : 'Server initialization failed.',
        })
      );
    }
  }
}
