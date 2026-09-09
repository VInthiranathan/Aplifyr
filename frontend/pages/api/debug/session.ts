import type { NextApiRequest, NextApiResponse } from 'next';

// Never echo cookies, tokens or auth user objects, including in development.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(404).json({ error: 'Not found' });
}
