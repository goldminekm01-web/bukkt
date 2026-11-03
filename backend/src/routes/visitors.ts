import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();
const FILE = path.join(process.cwd(), 'visitors.json');

function readVisitors(): any[] {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return []; }
}
function writeVisitors(list: any[]) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

router.post('/', (req: Request, res: Response) => {
  const visit = { ...req.body, timestamp: req.body.timestamp || new Date().toISOString() };
  const list = readVisitors();
  list.unshift(visit);
  if (list.length > 1000) list.length = 1000;
  writeVisitors(list);
  res.json({ ok: true });
});

router.get('/', (req: Request, res: Response) => {
  res.json({ visitors: readVisitors() });
});

export default router;
