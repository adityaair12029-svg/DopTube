import type { IncomingMessage, ServerResponse } from 'node:http';
import { app } from '../server/app.ts';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.url && req.url.includes('__vercel_path=')) {
    const parsed = new URL(req.url, 'https://doptube.vercel.app');
    const vpath = parsed.searchParams.get('__vercel_path') || '';
    parsed.searchParams.delete('__vercel_path');
    const qs = parsed.searchParams.toString();
    req.url = `/api/${vpath.replace(/^\/+/, '')}${qs ? `?${qs}` : ''}`;
  }
  return app(req as unknown as Parameters<typeof app>[0], res as unknown as Parameters<typeof app>[1]);
}
