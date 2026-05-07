import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const env = globalThis.process?.env ?? {};
const PORT = Number.parseInt(env.PORT || '3001', 10);

function loadRootEnv() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const rootEnvPath = path.resolve(currentDir, '../.env');

  if (!fs.existsSync(rootEnvPath)) {
    return;
  }

  const contents = fs.readFileSync(rootEnvPath, 'utf8');
  const lines = contents.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();

    if (globalThis.process?.env && !globalThis.process.env[key]) {
      globalThis.process.env[key] = value;
    }
  }
}

loadRootEnv();

app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  return next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'seo-excel-generator',
  });
});

app.post('/api/seo-excel/openai', async (req, res) => {
  const apiKey = req.body?.apiKey || env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY;
  const model = req.body?.model || env.OPENAI_MODEL || 'gpt-4o-mini';
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt.trim() : '';

  if (!prompt) {
    return res.status(400).json({ error: 'Missing prompt.' });
  }

  if (!apiKey) {
    return res.status(400).json({ error: 'Missing OpenAI API key.' });
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error?.message || 'OpenAI request failed.';
      return res.status(response.status).json({ error: message });
    }

    const content = payload?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return res.status(502).json({ error: 'Malformed OpenAI response.' });
    }

    return res.json({
      content,
      model,
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Request timeout.'
      : error instanceof Error
        ? error.message
        : 'Unexpected server error.';

    return res.status(500).json({ error: message });
  } finally {
    clearTimeout(timeoutHandle);
  }
});

app.listen(PORT, () => {
  console.log(`[seo-excel-generator] API server listening on http://localhost:${PORT}`);
});
