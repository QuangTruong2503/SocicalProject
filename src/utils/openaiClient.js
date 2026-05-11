const DEFAULT_TIMEOUT_MS = 120000;

function getDefaultApiKey() {
  return import.meta.env.VITE_OPENAI_API_KEY || '';
}

export async function requestSeoTagsFromOpenAI({
  prompt,
  apiKey,
  model,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal,
}) {
  const resolvedApiKey = apiKey?.trim() || getDefaultApiKey();

  if (!resolvedApiKey) {
    throw new Error('Thiếu OpenAI API key. Hãy thêm VITE_OPENAI_API_KEY vào .env hoặc nhập trực tiếp trong form.');
  }

  const controller = new AbortController();
  const timeoutHandle = window.setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${resolvedApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.error || payload?.message || 'Gọi OpenAI thất bại.');
    }

    const content = payload?.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error('OpenAI không trả về nội dung hợp lệ.');
    }

    return content;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Request bị timeout hoặc đã bị dừng.');
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutHandle);
  }
}
