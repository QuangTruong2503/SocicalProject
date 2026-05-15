import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '../hooks/useAuth.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { createSeoHistory, deleteSeoHistory, getSeoHistories } from '../services/seoService.js';
import '../styles/SEOKeywords.css';
import seoprompt from '../asset/SKPrompt.txt?raw';
import SEOGenerator from '../components/seo/SEOGenerator.jsx';
import SEOHistory from '../components/seo/SEOHistory.jsx';
import { requestSeoTagsFromOpenAI } from '../utils/openaiClient.js';

const OPENAI_MODEL = 'gpt-5.4-mini';
const HISTORY_LOAD_LIMIT = 100;

const EMPTY_DRAFT = {
  productName: '',
  distributor: '',
  productDetails: '',
};

const ANALYSIS_LABELS = [
  { key: 'strength', label: 'Điểm mạnh bộ keyword' },
  { key: 'redundancy', label: 'Keyword dư thừa cần loại bỏ' },
  { key: 'semantic', label: 'Nhóm semantic chính' },
];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDraft(draft) {
  return {
    productName: normalizeText(draft?.productName),
    distributor: normalizeText(draft?.distributor),
    productDetails: normalizeText(draft?.productDetails),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function buildPrompt(draft, historyTags) {
  return seoprompt
    .replace(/\$\{productName\}/g, draft.productName)
    .replace(/\$\{distributor\}/g, draft.distributor || 'Không có dữ liệu')
    .replace(/\$\{productDetails\}/g, draft.productDetails || 'Không có dữ liệu')
    .replace(/\$\{historyTags\}/g, historyTags || 'Không có lịch sử tham chiếu.');
}

function extractSection(content, startLabel, endLabel) {
  const pattern = new RegExp(
    `${escapeRegExp(startLabel)}\\s*:?[\\s\\S]*?(?=${endLabel ? escapeRegExp(endLabel) : '$'})`,
    'i',
  );
  const match = content.match(pattern);

  if (!match) {
    return '';
  }

  return match[0].replace(new RegExp(`^${escapeRegExp(startLabel)}\\s*:?\\s*`, 'i'), '').trim();
}

function getSectionAfterLabel(content, label) {
  const pattern = new RegExp(`${escapeRegExp(label)}\\s*:?[\\s\\S]*`, 'i');
  const match = content.match(pattern);

  if (!match) {
    return '';
  }

  return match[0].replace(new RegExp(`^${escapeRegExp(label)}\\s*:?\\s*`, 'i'), '').trim();
}

function cleanSectionLines(section) {
  return section
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*[-*•]\s*/, '')
        .replace(/^\s*\d+[).:-]\s*/, '')
        .trim(),
    )
    .filter(Boolean);
}

function extractAnalysisValue(lines, label) {
  const normalizedLabel = label.toLowerCase();
  const index = lines.findIndex((line) => line.toLowerCase().includes(normalizedLabel));

  if (index === -1) {
    return '';
  }

  const line = lines[index];
  const inlineValue = line
    .replace(new RegExp(`^${escapeRegExp(label)}\\s*:?\\s*`, 'i'), '')
    .trim();

  if (inlineValue) {
    return inlineValue;
  }

  for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
    const nextLine = lines[nextIndex];

    if (
      nextLine &&
      !nextLine.toLowerCase().startsWith('bộ tag tối ưu') &&
      !ANALYSIS_LABELS.some(({ label: otherLabel }) => nextLine.toLowerCase().startsWith(otherLabel.toLowerCase()))
    ) {
      return nextLine;
    }
  }

  return '';
}

function parseAnalysisItems(analysisSection) {
  const lines = cleanSectionLines(analysisSection);

  return ANALYSIS_LABELS.map(({ key, label }) => {
    const value = extractAnalysisValue(lines, label);

    return {
      key,
      label,
      value: value || 'Không có dữ liệu.',
    };
  });
}

function parseKeywordResponse(content) {
  if (!content) {
    return {
      analysis: [],
      seoTags: [],
      raw: '',
    };
  }

  const normalized = content.replace(/\r\n/g, '\n').trim();
  const analysisSection = extractSection(normalized, 'Phân tích', 'Bộ tag tối ưu');
  const tagsSection = getSectionAfterLabel(normalized, 'Bộ tag tối ưu');
  const analysis = parseAnalysisItems(analysisSection || normalized);

  const tagSource = tagsSection || normalized;
  const normalizedTags = tagSource
    .replace(/[•·]/g, ',')
    .replace(/\n+/g, ',')
    .replace(/^\s*\d+[).:-]\s*/gm, '')
    .replace(/^\s*[-–—*]+\s*/gm, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const tokens = normalizedTags
    .split(/[,;|]/)
    .map((token) => token.trim())
    .filter(Boolean);

  const seoTags = dedupeKeywords(tokens).slice(0, 35);

  return {
    analysis,
    seoTags,
    raw: seoTags.join(', '),
  };
}

async function requestSeoKeywords({ draft, historyTags }) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error('Thiếu VITE_OPENAI_API_KEY trong file .env.');
  }

  const prompt = buildPrompt(draft, historyTags);

  console.debug('[SEOKeywords] Requesting SEO keywords', {
    model: OPENAI_MODEL,
    productName: draft.productName,
    hasProductDetails: Boolean(draft.productDetails),
  });

  return requestSeoTagsFromOpenAI({
    prompt,
    apiKey,
    model: OPENAI_MODEL,
    timeoutMs: 120000,
  });
}

function normalizeResult(result) {
  if (!result) {
    return null;
  }

  return {
    ...result,
    analysis: Array.isArray(result.analysis) ? result.analysis : [],
    seoTags: Array.isArray(result.seoTags) ? result.seoTags : [],
    raw: typeof result.raw === 'string' ? result.raw : '',
  };
}

export default function SEOKeywords() {
  const { user } = useAuth();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
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

  const filledFieldsCount = useMemo(() => {
    return Object.values(draft).filter(Boolean).length;
  }, [draft]);

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

    if (!normalizedDraft.productName) {
      setPageError('Vui lòng nhập tên sản phẩm để tạo bộ tag semantic.');
      return null;
    }

    setPageError('');
    setGeneratorLoading(true);

    try {
      const rawKeywords = await requestSeoKeywords({
        draft: normalizedDraft,
        historyTags,
      });
      const parsed = parseKeywordResponse(rawKeywords);
      const seoTags = parsed.seoTags;

      if (!seoTags.length) {
        throw new Error('AI không tạo ra danh sách keyword hợp lệ.');
      }

      const nextResult = normalizeResult({
        title: normalizedDraft.productName,
        draft: normalizedDraft,
        raw: seoTags.join(', '),
        seoTags,
        analysis: parsed.analysis,
        seoCount: seoTags.length,
        generatedAt: new Date().toISOString(),
      });

      setSeoResult(nextResult);
      setLastGeneratedDraft(normalizedDraft);
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
      productName: item.title,
      distributor: '',
      productDetails: item.seo_tags?.join(', ') || '',
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
      userId: user?.id,
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
    setDraft(EMPTY_DRAFT);
    setSeoResult(null);
    setLastGeneratedDraft(null);
    setPageError('');
  }, []);

  const workspaceSubtitle = useMemo(() => {
    if (historyStats.total > 0) {
      return `Workspace của bạn đã lưu ${historyStats.total} lần tạo SEO semantic. Lần gần nhất: ${historyStats.latestTitle}.`;
    }

    return 'Nhập 3 trường dữ liệu sản phẩm để tạo bộ tag semantic rõ intent, tối ưu cho landing page kỹ thuật.';
  }, [historyStats.latestTitle, historyStats.total]);

  return (
    <>
      <Helmet>
        <title>SEO Keywords Workspace - AISEO</title>
        <meta
          name="description"
          content="Workspace SEO semantic để tạo bộ tag sản phẩm kỹ thuật từ 3 trường dữ liệu đầu vào, lưu lịch sử Supabase và sao chép nhanh."
        />
      </Helmet>

      <div className="seo-workspace">
        <div className="seo-workspace__bg seo-workspace__bg--grid" />
        <div className="seo-workspace__bg seo-workspace__bg--orb seo-workspace__bg--orb-a" />
        <div className="seo-workspace__bg seo-workspace__bg--orb seo-workspace__bg--orb-b" />

        <section className="seo-workspace__hero">
          <div className="seo-workspace__eyebrow">SEO Semantic Workspace</div>
          <h1>Bộ tag semantic cho sản phẩm kỹ thuật</h1>
          <p>{workspaceSubtitle}</p>

          <div className="seo-workspace__stats">
            <div className="seo-stat-card">
              <span>Tag tạo ra</span>
              <strong>{seoResult?.seoCount || 0}</strong>
            </div>
            <div className="seo-stat-card">
              <span>Trường đã nhập</span>
              <strong>{filledFieldsCount}/3</strong>
            </div>
            <div className="seo-stat-card">
              <span>Lịch sử</span>
              <strong>{historyStats.total}</strong>
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
