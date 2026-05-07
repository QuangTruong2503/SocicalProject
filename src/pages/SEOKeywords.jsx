import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../hooks/useAuth.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { createSeoHistory, deleteSeoHistory, getSeoHistories } from '../services/seoService.js';
import '../styles/SEOKeywords.css';
import seoprompt from '../asset/SKPrompt.txt?raw';
import SEOGenerator from '../components/seo/SEOGenerator.jsx';
import SEOHistory from '../components/seo/SEOHistory.jsx';

const OPENAI_MODEL = 'gpt-5.4-mini';
const HISTORY_LOAD_LIMIT = 100;

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function dedupeKeywords(keywords) {
  const seen = new Set();
  const output = [];

  for (const keyword of keywords) {
    const normalized = normalizeText(keyword)
      .replace(/^[-–—\d.\s]+/, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ');

    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      output.push(normalized);
    }
  }

  return output;
}

function parseKeywordResponse(content) {
  if (!content) {
    return [];
  }

  const normalized = content
    .replace(/\r\n/g, '\n')
    .replace(/[•·]/g, ',')
    .replace(/\n+/g, ',')
    .replace(/^\s*\d+[).:-]\s*/gm, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const tokens = normalized
    .split(/[,;|]/)
    .map((token) => token.trim())
    .filter(Boolean);

  return dedupeKeywords(tokens);
}

function buildPrompt({ title, details, historyTags }) {
  return seoprompt
    .replace(/\$\{title\}/g, title)
    .replace(/\$\{details\}/g, details || 'Không có mô tả bổ sung.')
    .replace(/\$\{historyTags\}/g, historyTags || 'Không có lịch sử tham chiếu.');
}

async function requestSeoKeywords({ title, details, historyTags }) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('Thiếu VITE_OPENAI_API_KEY trong file .env.');
  }

  const prompt = buildPrompt({ title, details, historyTags });

  console.debug('[SEOKeywords] Requesting SEO keywords', {
    model: OPENAI_MODEL,
    title,
    hasDetails: Boolean(details),
    hasHistoryTags: Boolean(historyTags),
  });

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.35,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error?.message || 'Không thể tạo SEO keywords.');
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content?.trim() || '';

  if (!content) {
    throw new Error('AI không trả về nội dung hợp lệ.');
  }

  return content;
}

function normalizeDraft(draft) {
  return {
    title: normalizeText(draft?.title),
    details: normalizeText(draft?.details),
  };
}

export default function SEOKeywords() {
  const { user } = useAuth();
  const [draft, setDraft] = useState({ title: '', details: '' });
  const [lastGeneratedDraft, setLastGeneratedDraft] = useState(null);
  const [seoResult, setSeoResult] = useState(null);
  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [generatorLoading, setGeneratorLoading] = useState(false);
  const [historySaving, setHistorySaving] = useState(false);
  const [pageError, setPageError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedKey, setCopiedKey] = useState('');
  const copyResetTimerRef = useRef(null);

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 180);

  const loadHistories = useCallback(async () => {
    if (!user?.id) {
      setHistoryItems([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    setHistoryError('');

    const result = await getSeoHistories({
      userId: user.id,
      limit: HISTORY_LOAD_LIMIT,
    });

    if (result.error) {
      console.error('[SEOKeywords] loadHistories failed', {
        userId: user.id,
        error: result.error,
      });
      setHistoryError(result.error);
      setHistoryItems([]);
      setHistoryLoading(false);
      return;
    }

    const nextItems = result.data || [];
    setHistoryItems(nextItems);
    setExpandedHistoryId((current) => {
      if (current && nextItems.some((item) => item.id === current)) {
        return current;
      }

      return nextItems[0]?.id || null;
    });
    setHistoryLoading(false);
  }, [user?.id]);

  useEffect(() => {
    void loadHistories();
  }, [loadHistories]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  const filteredHistoryItems = useMemo(() => {
    const query = debouncedSearchTerm.toLowerCase().trim();

    if (!query) {
      return historyItems;
    }

    return historyItems.filter((item) => {
      const haystack = [
        item.title,
        item.seo_count,
        ...(item.seo_tags || []),
        item.created_at,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [debouncedSearchTerm, historyItems]);

  const historyStats = useMemo(() => {
    return {
      total: historyItems.length,
      visible: filteredHistoryItems.length,
      latestTitle: historyItems[0]?.title || 'Chưa có dữ liệu',
    };
  }, [filteredHistoryItems.length, historyItems]);

  const copyToClipboard = useCallback(async (text, copiedValue) => {
    if (!text) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(copiedValue || text);

      if (copyResetTimerRef.current) {
        window.clearTimeout(copyResetTimerRef.current);
      }

      copyResetTimerRef.current = window.setTimeout(() => {
        setCopiedKey('');
      }, 1600);

      return true;
    } catch (error) {
      console.error('[SEOKeywords] copyToClipboard failed', { error });
      setPageError('Không thể sao chép vào clipboard ở trình duyệt này.');
      return false;
    }
  }, []);

  const persistHistory = useCallback(async (payload) => {
    if (!user?.id) {
      throw new Error('Bạn cần đăng nhập để lưu lịch sử SEO.');
    }

    setHistorySaving(true);
    setHistoryError('');

    const result = await createSeoHistory({
      userId: user.id,
      title: payload.title,
      seoCount: payload.seoTags.length,
      seoTags: payload.seoTags,
    });

    if (result.error) {
      setHistoryError(result.error);
      console.error('[SEOKeywords] persistHistory failed', {
        userId: user.id,
        title: payload.title,
        error: result.error,
      });
      setHistorySaving(false);
      return null;
    }

    if (result.data) {
      setHistoryItems((current) => [
        result.data,
        ...current.filter((item) => item.id !== result.data.id),
      ]);
      setExpandedHistoryId(result.data.id);
    }

    setHistorySaving(false);
    return result.data;
  }, [user?.id]);

  const generateSeoKeywords = useCallback(async (inputDraft, historyTags = '') => {
    const normalizedDraft = normalizeDraft(inputDraft);

    if (!normalizedDraft.title) {
      setPageError('Vui lòng nhập title, product hoặc topic để tạo SEO keywords.');
      return null;
    }

    setPageError('');
    setGeneratorLoading(true);

    try {
      const rawKeywords = await requestSeoKeywords({
        title: normalizedDraft.title,
        details: normalizedDraft.details,
        historyTags,
      });
      const seoTags = parseKeywordResponse(rawKeywords);

      if (!seoTags.length) {
        throw new Error('AI không tạo ra danh sách keyword hợp lệ.');
      }

      const nextResult = {
        title: normalizedDraft.title,
        details: normalizedDraft.details,
        raw: seoTags.join(', '),
        seoTags,
        seoCount: seoTags.length,
        generatedAt: new Date().toISOString(),
      };

      setSeoResult(nextResult);
      setLastGeneratedDraft({
        title: normalizedDraft.title,
        details: normalizedDraft.details,
      });
      setGeneratorLoading(false);

      const savedHistory = await persistHistory(nextResult);

      if (savedHistory) {
        setHistoryError('');
      }

      return nextResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Đã xảy ra lỗi khi tạo SEO keywords.';
      console.error('[SEOKeywords] generateSeoKeywords failed', {
        error: message,
        draft: normalizedDraft,
      });
      setPageError(message);
      setGeneratorLoading(false);
      return null;
    }
  }, [persistHistory]);

  const handleGenerate = useCallback(async (event) => {
    event.preventDefault();
    await generateSeoKeywords(draft);
  }, [draft, generateSeoKeywords]);

  const handleRegenerate = useCallback(async () => {
    const sourceDraft = lastGeneratedDraft || draft;
    await generateSeoKeywords(sourceDraft, seoResult?.seoTags?.join(', ') || '');
  }, [draft, generateSeoKeywords, lastGeneratedDraft, seoResult?.seoTags]);

  const handleReuseHistory = useCallback(async (item) => {
    const nextDraft = {
      title: item.title,
      details: item.seo_tags?.join(', ') || '',
    };

    setDraft(nextDraft);
    setExpandedHistoryId(item.id);
    await generateSeoKeywords(nextDraft, item.seo_tags?.join(', ') || '');
  }, [generateSeoKeywords]);

  const handleDeleteHistory = useCallback(async (item) => {
    const confirmed = window.confirm(`Xoá lịch sử SEO "${item.title}"?`);
    if (!confirmed) {
      return;
    }

    const result = await deleteSeoHistory({
      historyId: item.id,
      userId: user.id,
    });

    if (result.error) {
      setHistoryError(result.error);
      return;
    }

    setHistoryItems((current) => {
      const nextItems = current.filter((history) => history.id !== item.id);

      if (expandedHistoryId === item.id) {
        setExpandedHistoryId(nextItems[0]?.id || null);
      }

      return nextItems;
    });
  }, [expandedHistoryId, user?.id]);

  const handleCopyCurrentTags = useCallback(async () => {
    if (!seoResult?.raw) {
      return;
    }

    await copyToClipboard(seoResult.raw, seoResult.raw);
  }, [copyToClipboard, seoResult?.raw]);

  const handleCopyHistoryTags = useCallback(async (item) => {
    const joined = (item.seo_tags || []).join(', ');
    await copyToClipboard(joined, `history-${item.id}`);
  }, [copyToClipboard]);

  const handleCopySingleTag = useCallback(async (tag) => {
    await copyToClipboard(tag, tag);
  }, [copyToClipboard]);

  const clearDraft = useCallback(() => {
    setDraft({ title: '', details: '' });
    setSeoResult(null);
    setPageError('');
  }, []);

  const workspaceSubtitle = useMemo(() => {
    if (historyStats.total > 0) {
      return `Workspace của bạn đã lưu ${historyStats.total} lần tạo SEO. Lần gần nhất: ${historyStats.latestTitle}.`;
    }

    return 'Tạo SEO keywords, lưu lịch sử tự động và tái sử dụng kết quả trong một workspace duy nhất.';
  }, [historyStats.latestTitle, historyStats.total]);

  return (
    <>
      <Helmet>
        <title>SEO Keywords Workspace - AISEO</title>
        <meta
          name="description"
          content="Workspace SEO keywords với lịch sử Supabase, tìm kiếm nhanh, sao chép tag và tái sử dụng kết quả."
        />
      </Helmet>

      <div className="seo-workspace">
        <div className="seo-workspace__bg seo-workspace__bg--grid" />
        <div className="seo-workspace__bg seo-workspace__bg--orb seo-workspace__bg--orb-a" />
        <div className="seo-workspace__bg seo-workspace__bg--orb seo-workspace__bg--orb-b" />

        <section className="seo-workspace__hero">
          <div className="seo-workspace__eyebrow">SEO Workspace</div>
          <p>{workspaceSubtitle}</p>

          <div className="seo-workspace__stats">
            <div className="seo-stat-card">
              <span>Đã tạo</span>
              <strong>{seoResult?.seoCount || 0}</strong>
            </div>
            <div className="seo-stat-card">
              <span>Lịch sử</span>
              <strong>{historyStats.total}</strong>
            </div>
            <div className="seo-stat-card">
              <span>Hiển thị</span>
              <strong>{historyStats.visible}</strong>
            </div>
          </div>
        </section>

        <section className="seo-workspace__layout">
          <SEOGenerator
            draft={draft}
            seoResult={seoResult}
            isGenerating={generatorLoading}
            isSavingHistory={historySaving}
            error={pageError}
            copiedKey={copiedKey}
            onDraftChange={setDraft}
            onGenerate={handleGenerate}
            onRegenerate={handleRegenerate}
            onClear={clearDraft}
            onCopyAll={handleCopyCurrentTags}
            onCopyTag={handleCopySingleTag}
          />

          <SEOHistory
            histories={filteredHistoryItems}
            isLoading={historyLoading}
            error={historyError}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            expandedHistoryId={expandedHistoryId}
            onToggleHistory={setExpandedHistoryId}
            onDeleteHistory={handleDeleteHistory}
            onCopyTags={handleCopyHistoryTags}
            onReuseHistory={handleReuseHistory}
            copiedKey={copiedKey}
          />
        </section>
      </div>
    </>
  );
}
