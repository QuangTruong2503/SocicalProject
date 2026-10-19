// /admin/usage in jsdom with the real service layer; supabase.rpc is a fixture
// (tests/fixtures/aiRenameSupabaseMock.mjs via tests/aiRenameLoader.mjs).
import { dom } from './fixtures/notificationsDom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router-dom';

globalThis.localStorage = dom.window.localStorage;
const { HelmetProvider } = await import('react-helmet-async');
const { default: AdminUsagePage } = await import('../src/pages/Admin/AdminUsagePage.jsx');
const { default: AdminUsageRedirect } = await import('../src/pages/Admin/AdminUsageRedirect.jsx');
const { default: AdminLayout } = await import('../src/pages/Admin/AdminLayout.jsx');
const { customRange, formatUsd, presetRange, vnDateKey } = await import('../src/utils/usageDashboard.js');
const { neutralizeCsvFormula } = await import('../src/utils/csv.js');

const USER = '20000000-0000-4000-8000-000000000001';

function overviewFixture(overrides = {}) {
  return {
    activity: { events: 4, create_operations: 2, images_created: 18, images_create_failed: 2, download_operations: 1, download_cancelled: 1, download_failed: 0,
      images_downloaded: 20, images_written: 0, zip_files: 1, apply_operations: 1, names_applied: 7, active_users: 1, distinct_visitors: 0 },
    ai: { runs: 1, requests: 3, requests_by_status: { succeeded: 2, failed: 1 }, rejected: 1, images_requested: 13, images_succeeded: 12, images_failed: 1, needs_review: 2,
      replays: 0, requests_with_retry: 1, requests_called: 3, attempts: 4, provider_image_sends: 19, input_tokens: 3600, cached_input_tokens: 600, cache_write_tokens: 0,
      output_tokens: 270, reasoning_tokens: 0, total_tokens: 3870, estimated_cost_usd: 0.000441, attempts_estimated: 3, attempts_unpriced: 0, attempts_usage_unknown: 1,
      attempts_usage_missing: 0, attempts_open: 0 },
    series: [{ day: '2026-10-18', requests: 3, rejected: 1, failed: 1, attempts: 4, retries: 1, tokens: 3870, cost_usd: 0.000441, cost_incomplete: 1, images_created: 18, images_downloaded: 20 }],
    top_users: [{ user_id: USER, email: 'pro@example.com', name: 'Người Pro', requests: 3, attempts: 4, images: 13, tokens: 3870, cost_usd: 0.000441, cost_incomplete: 1 }],
    request_errors: [{ status: 'failed', code: 'upstream_timeout', count: 1 }],
    attempt_errors: [{ status: 'unknown', code: 'upstream_timeout', count: 1 }],
    apply_cohort: { runs: 1, runs_open: 0, runs_applied: 1, suggested: 12, applied_unchanged: 6, applied_total: 7 },
    health: { tracking_started_at: '2026-10-18T01:00:00Z', ai_enabled: true, quota_enforced: false, running_now: 0, stale_running: 0, unknown_in_range: 0, swept_in_range: 0,
      usd_to_vnd: 26000 },
    budgets: [{ id: 'b1', scope: 'global', scope_value: null, monthly_limit_usd: 0.0004, alert_thresholds: [70, 90, 100], spent_usd: 0.000441, percent: 110.25, level: 100, incomplete_attempts: 1 }],
    options: { models: ['gpt-6-luna'], key_aliases: ['image-naming-prod-v1'], environments: ['production'] },
    legacy_watermark_images: 18,
    ...overrides,
  };
}

let root;
let rpcCalls;
let rpc;
let navigate;

function RouteState() {
  const location = useLocation();
  navigate = useNavigate();
  return React.createElement('output', { id: 'route-state', hidden: true }, location.pathname + location.search);
}

async function settle(ms = 30) { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); }
async function render(entry = '/admin/usage') {
  root ??= createRoot(document.querySelector('#root'));
  await act(async () => { root.render(React.createElement(HelmetProvider, null,
    React.createElement(MemoryRouter, { initialEntries: [entry] },
      React.createElement(RouteState),
      React.createElement(Routes, null,
        React.createElement(Route, { path: '/admin', element: React.createElement(AdminLayout) },
          React.createElement(Route, { path: 'usage', element: React.createElement(AdminUsagePage) }),
          React.createElement(Route, { path: 'watermark', element: React.createElement(AdminUsageRedirect) })),
        React.createElement(Route, { path: '/watermark/dashboard', element: React.createElement(AdminUsageRedirect) }))))); });
  await settle();
}
const text = () => document.querySelector('#root').textContent;
const button = (label) => [...document.querySelectorAll('button')].find((item) => item.textContent.trim().startsWith(label));
async function click(element) { assert.ok(element, 'control exists'); await act(async () => { element.click(); }); await settle(); }

test.beforeEach(async () => {
  rpcCalls = [];
  rpc = {};
  globalThis.__watermarkInsert = null;
  globalThis.__watermarkUnsubscribed = false;
  globalThis.__aiAccessRpc = async (name, params) => {
    rpcCalls.push({ name, params });
    return rpc[name] ? rpc[name](params) : { data: null, error: { code: 'PGRST202', message: 'not found' } };
  };
  if (root) await act(async () => { root.unmount(); });
  root = null;
});

function configFixture() {
  return {
    settings: { ai_enabled: true, quota_enforced: false, window_seconds: 600, max_requests_per_window: 40, max_images_per_window: 150,
      max_concurrent_per_user: 2, max_concurrent_total: 8, lease_ttl_seconds: 240, usd_to_vnd: null, usd_to_vnd_as_of: null },
    plan_models: ['free', 'pro', 'enterprise', 'admin'].map((plan) => ({ plan,
      allowed_models: plan === 'free' ? [] : ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'] })),
    plan_quotas: [], user_quotas: [], budgets: [], budget_status: [], prices: [], audit: [],
  };
}

test('admin edits models per plan, can disable a plan, saves persist after remount and errors keep edits', async () => {
  const config = configFixture();
  rpc.admin_usage_overview = () => ({ data: overviewFixture(), error: null });
  rpc.admin_usage_config = () => ({ data: structuredClone(config), error: null });
  rpc.admin_usage_config_change = ({ p_action, p_payload }) => {
    assert.equal(p_action, 'plan_models.update');
    config.plan_models.find((row) => row.plan === p_payload.plan).allowed_models = p_payload.allowed_models;
    return { data: { ok: true }, error: null };
  };
  const checkbox = (model, plan) => document.querySelector(`input[aria-label="Cho phép ${model}, gói ${plan}"]`);
  const save = (plan) => document.querySelector(`button[aria-label="Lưu model gói ${plan}"]`);
  await render();
  await click(button('Cấu hình & cảnh báo'));
  assert.match(text(), /Model AI theo gói/);
  assert.equal(save('Pro').disabled, true);
  await click(checkbox('GPT-6.1 Sol', 'Pro'));
  await click(checkbox('GPT-6 Astra', 'Pro'));
  await click(save('Pro'));
  assert.deepEqual(rpcCalls.filter(({ name }) => name === 'admin_usage_config_change').at(-1).params.p_payload,
    { plan: 'pro', allowed_models: ['gpt-6-luna'] });
  assert.equal(save('Pro').disabled, true, 'saved settings refresh from server');
  await click(checkbox('GPT-6 Luna', 'Free'));
  await click(save('Free'));
  await click(checkbox('GPT-6 Luna', 'Pro'));
  await click(save('Pro'));
  assert.deepEqual(config.plan_models.find((row) => row.plan === 'pro').allowed_models, [], 'empty disables access');
  await act(async () => { root.unmount(); }); root = null;
  await render();
  await click(button('Cấu hình & cảnh báo'));
  assert.equal(checkbox('GPT-6 Luna', 'Free').checked, true);
  assert.equal(checkbox('GPT-6 Luna', 'Pro').checked, false);
  rpc.admin_usage_config_change = () => ({ data: null, error: { code: '42501' } });
  await click(checkbox('GPT-6 Luna', 'Pro'));
  await click(save('Pro'));
  assert.equal(checkbox('GPT-6 Luna', 'Pro').checked, true, 'failed save keeps draft');
  assert.equal(save('Pro').disabled, false);
  assert.deepEqual(config.plan_models.find((row) => row.plan === 'pro').allowed_models, [], 'server state stays unchanged');
});

test('Vietnam day ranges do not depend on the admin computer, boundaries at 17:00 UTC', () => {
  assert.equal(vnDateKey(new Date('2026-10-18T16:59:59Z')), '2026-10-18');
  assert.equal(vnDateKey(new Date('2026-10-18T17:00:00Z')), '2026-10-19');
  assert.deepEqual(presetRange('today', new Date('2026-10-18T16:59:59Z')), { from: '2026-10-17T17:00:00.000Z', to: '2026-10-18T17:00:00.000Z' });
  assert.deepEqual(presetRange('today', new Date('2026-10-18T17:00:00Z')), { from: '2026-10-18T17:00:00.000Z', to: '2026-10-19T17:00:00.000Z' });
  assert.deepEqual(presetRange('7d', new Date('2026-10-18T03:00:00Z')), { from: '2026-10-11T17:00:00.000Z', to: '2026-10-18T17:00:00.000Z' });
  assert.deepEqual(customRange('2026-10-01', '2026-10-01'), { from: '2026-09-30T17:00:00.000Z', to: '2026-10-01T17:00:00.000Z' });
  assert.match(customRange('2026-10-05', '2026-10-01').error, /sau ngày bắt đầu/);
  assert.match(customRange('2025-01-01', '2026-10-01').error, /400 ngày/);
  assert.match(customRange('2026-02-30', '2026-03-01').error, /Chọn đủ/);
  assert.equal(formatUsd(0.000441), '$0.000441');
  assert.equal(formatUsd(null), '—');
  for (const [input, expected] of [['=HYPERLINK("x")', '\'=HYPERLINK("x")'], ['+1', '\'+1'], ['-2+3', '\'-2+3'], ['@SUM(A1)', '\'@SUM(A1)'], ['bình thường', 'bình thường'], [-5, -5]]) {
    assert.equal(neutralizeCsvFormula(input), expected);
  }
});

test('overview: separate sources, honest labels, budget alert, no zeros when unknown', async () => {
  rpc.admin_usage_overview = () => ({ data: overviewFixture(), error: null });
  await render();
  const [call] = rpcCalls.filter((entry) => entry.name === 'admin_usage_overview');
  assert.ok(call.params.p_from < call.params.p_to);
  assert.equal(new Date(call.params.p_to).getUTCHours(), 17, 'range ends at Vietnam midnight');

  const content = text();
  assert.match(content, /Ảnh tạo \(local\)18/);
  assert.match(content, /Do trình duyệt báo cáo/);
  assert.match(content, /bộ đếm cũ watermark_image_counts ghi 18 ảnh/);
  assert.match(content, /Chi phí ước tính đã ghi nhận\$0\.000441/, 'partial totals are labelled as such');
  assert.match(content, /Attempt chưa biết usage1/);
  assert.match(content, /Không phải hóa đơn OpenAI/);
  assert.match(content, /Ngân sách ước tính toàn ứng dụng đã dùng 110,25%/);
  assert.match(content, /không tự chặn chi phí/);
  assert.match(content, /50%/, 'apply rate from the cohort (6 / 12)');
  assert.match(content, /Visitor \(khách\)0Trình duyệt khác nhau, không phải số người/);
});

test('missing migration or errors are shown as errors, not as zero', async () => {
  await render();
  assert.match(text(), /Chưa áp dụng migration theo dõi sử dụng/);
  assert.doesNotMatch(text(), /Ảnh tạo \(local\)0/);
  assert.ok(button('Thử lại'));

  rpc.admin_usage_overview = () => ({ data: null, error: { code: '42501', message: 'Chỉ quản trị viên' } });
  await click(button('Thử lại'));
  assert.match(text(), /Chỉ quản trị viên mới xem/);
});

test('filters are applied server-side; lists page with a cursor; CSV neutralizes formulas', async () => {
  rpc.admin_usage_overview = () => ({ data: overviewFixture(), error: null });
  const row = (n, overrides = {}) => ({
    event_id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, operation_id: 'op', image_batch_id: 'batch', subject_type: 'user', user_id: USER,
    user_email: 'pro@example.com', user_name: '=cmd|calc', feature: 'watermark', action: 'image.download', source_page: 'watermark', status: 'succeeded',
    requested_count: 20, succeeded_count: 20, prepared_count: 20, download_method: 'zip', image_size: 'original', delivery: 'browser_handoff', output_file_count: 1,
    received_at: '2026-10-18T03:00:00Z', metadata: {}, ...overrides,
  });
  rpc.admin_usage_activity = (params) => (params.p_cursor
    ? { data: { rows: [row(3)], has_more: false, next_cursor: null }, error: null }
    : { data: { rows: [row(1), row(2)], has_more: params.p_limit < 5000, next_cursor: params.p_limit < 5000 ? { at: 'x', id: 'y' } : null }, error: null });
  await render();
  await click(button('Nhật ký hoạt động'));
  const userInput = document.querySelector('input[aria-label="Lọc theo người dùng"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(userInput, 'pro@example.com');
    userInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await settle(450);
  const filtered = rpcCalls.filter((entry) => entry.name === 'admin_usage_activity').at(-1);
  assert.deepEqual(filtered.params.p_filters, { user: 'pro@example.com' });

  assert.match(text(), /Đã gửi tới trình duyệt/);
  assert.equal(document.querySelectorAll('tbody tr').length, 2);
  await click(button('Tải thêm'));
  assert.equal(document.querySelectorAll('tbody tr').length, 3);
  const pageCalls = rpcCalls.filter((entry) => entry.name === 'admin_usage_activity');
  assert.deepEqual(pageCalls.at(-1).params.p_cursor, { at: 'x', id: 'y' });
  assert.equal(pageCalls.at(-1).params.p_limit, 50);
  assert.deepEqual(pageCalls.at(-1).params.p_filters, { user: 'pro@example.com' });

  let csv = '';
  const originalCreate = dom.window.URL.createObjectURL;
  globalThis.URL.createObjectURL = (blob) => { csv = blob; return 'blob:csv'; };
  globalThis.URL.revokeObjectURL = () => {};
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    await click(button('Xuất CSV'));
  } finally {
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
    globalThis.URL.createObjectURL = originalCreate;
  }
  const exportCall = rpcCalls.filter((entry) => entry.name === 'admin_usage_activity').at(-1);
  assert.equal(exportCall.params.p_limit, 5000, 'export is bounded server-side');
  const content = await csv.text();
  assert.ok(!content.includes(',=cmd|calc'), 'formula cells are neutralized');
  assert.ok(content.includes("'=cmd|calc"));
});

test('AI tab: request lookup and the attempt detail', async () => {
  rpc.admin_usage_overview = () => ({ data: overviewFixture(), error: null });
  rpc.admin_usage_requests = (params) => ({
    data: {
      rows: [{ id: 'req-1', user_id: USER, user_email: 'pro@example.com', status: 'failed', error_code: 'upstream_timeout', images_requested: 6, images_succeeded: 0,
        attempts: 3, attempts_estimated: 0, usage_unknown: 3, total_tokens: null, estimated_cost_usd: null, environment: 'production', key_alias: 'image-naming-prod-v1',
        requested_model: 'gpt-6-luna', created_at: '2026-10-18T03:00:00Z', latency_ms: 135000 }],
      has_more: false,
      next_cursor: null,
      lookup: params.p_filters.requestId,
    },
    error: null,
  });
  rpc.admin_usage_request_detail = () => ({
    data: {
      request: { id: 'req-1', status: 'failed', error_code: 'upstream_timeout', http_status: 504, images_requested: 6, images_succeeded: 0, images_failed: 6, environment: 'production', replay_count: 0, created_at: '2026-10-18T03:00:00Z' },
      attempts: [1, 2, 3].map((n) => ({ attempt_number: n, status: 'unknown', error_code: 'upstream_timeout', usage_status: 'unknown', cost_status: 'unknown', will_retry: n < 3, retry_reason: n < 3 ? 'timeout' : null, latency_ms: 45000 })),
    },
    error: null,
  });
  await render();
  await click(button('AI & chi phí'));
  assert.match(text(), /Chưa biết/, 'unknown cost is not shown as $0');
  const lookup = document.querySelector('input[aria-label="Tra cứu theo mã"]');
  await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(lookup, 'req_provider_1');
    lookup.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  await click(button('Tra cứu'));
  assert.deepEqual(rpcCalls.filter((entry) => entry.name === 'admin_usage_requests').at(-1).params.p_filters, { requestId: 'req_provider_1' });

  await click(button('Chi tiết'));
  const dialog = document.querySelector('[role="dialog"]');
  assert.ok(dialog);
  assert.equal(dialog.querySelectorAll('tbody tr').length, 3, 'every attempt, not only the last');
  assert.match(dialog.textContent, /Chưa biết \(có thể đã tính phí\)/);
});

function watermarkFixture() {
  return { summary: { total_images: 81, total_entries: 9, unique_visitors: 5, unique_users: 3 },
    previous: { total_images: 60, total_entries: 7, unique_visitors: 4, unique_users: 2 }, bucket: 'day',
    series: [{ bucket: '2026-10-18', images: 81, entries: 9 }],
    sources: [{ source_page: 'watermark', images: 60, entries: 6 }, { source_page: 'watermark/doantrang', images: 21, entries: 3 }] };
}
function setupWatermark() {
  rpc.admin_usage_overview = () => ({ data: overviewFixture(), error: null });
  rpc.watermark_admin_overview = () => ({ data: watermarkFixture(), error: null });
  rpc.watermark_visitor_stats = (params) => ({ data: [{ group_key: 'v1', visitor_id: 'visitor-1', user_id: USER,
    user_name: 'Người Pro', user_email: 'pro@example.com', total_images: 81, entry_count: 9, visitor_count: 1,
    source_pages: ['watermark'], first_seen_at: '2026-10-15T02:00:00Z', last_seen_at: '2026-10-18T03:00:00Z', total_count: 51,
    ...(params.p_offset ? { group_key: 'v2', user_name: 'Trang tiếp theo' } : {}) }], error: null });
}
const select = async (label, value) => act(async () => {
  const element = document.querySelector(`select[aria-label="${label}"]`);
  element.value = value;
  element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
});

test('old Watermark route redirects to the unified page, dates survive and there is one navigation entry', async () => {
  setupWatermark();
  await render('/admin/watermark?range=custom&from=2026-10-01&to=2026-10-07');
  assert.match(document.getElementById('route-state').textContent, /^\/admin\/usage\?.*tab=watermark/);
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.equal(document.querySelector('h1').textContent, 'Thống kê & sử dụng');
  assert.equal(document.querySelectorAll('a[href="/admin/watermark"]').length, 0);
  assert.equal(document.querySelectorAll('a[href="/admin/usage"]').length, 1);
  const call = rpcCalls.find(({ name }) => name === 'watermark_admin_overview');
  assert.equal(call.params.p_from, '2026-09-30T17:00:00.000Z');
  assert.equal(call.params.p_to, '2026-10-07T17:00:00.000Z');
  assert.match(text(), /Ảnh đã tạo81/);
  assert.match(text(), /Tự động cập nhật/);
  await click(button('Tổng quan'));
  assert.match(text(), /Ảnh đã tạo18/, 'separate counters are never added');
  assert.equal(document.querySelector('[aria-label="Chỉ số chính"]').querySelectorAll('article').length, 4);
  assert.equal(document.querySelector('[aria-label="Lọc theo người dùng"]'), null, 'overview has no irrelevant filters');
  await act(async () => { navigate(-1); }); await settle();
  assert.match(text(), /Thống kê ảnh Watermark/);
  await act(async () => { navigate('/watermark/dashboard'); }); await settle();
  assert.match(document.getElementById('route-state').textContent, /^\/admin\/usage\?tab=watermark$/);
});

test('Watermark grouping, search, sorting, paging and CSV all share the chosen bounds; all history stays available', async () => {
  setupWatermark();
  await render('/admin/usage?tab=watermark&range=30d');
  const overview = rpcCalls.find(({ name }) => name === 'watermark_admin_overview');
  await click(button('Theo tài khoản'));
  await select('Nguồn', 'watermark/doantrang'); await settle();
  await act(async () => {
    const search = document.querySelector('input[aria-label="Tìm kiếm"]');
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(search, 'pro@example.com');
    search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }); await settle(400);
  await click(button('Tổng ảnh'));
  await click(document.querySelector('button[aria-label="Trang sau"]'));
  const query = rpcCalls.filter(({ name }) => name === 'watermark_visitor_stats').at(-1).params;
  assert.equal(query.p_from, overview.params.p_from); assert.equal(query.p_to, overview.params.p_to);
  assert.equal(query.p_group_by, 'user'); assert.equal(query.p_source_page, 'watermark/doantrang');
  assert.equal(query.p_search, 'pro@example.com'); assert.equal(query.p_offset, 50);
  assert.equal(query.p_sort, 'total_images'); assert.equal(query.p_desc, false);
  const originalCreate = globalThis.URL.createObjectURL;
  const originalRevoke = globalThis.URL.revokeObjectURL;
  const originalClick = dom.window.HTMLAnchorElement.prototype.click;
  globalThis.URL.createObjectURL = () => 'blob:csv'; globalThis.URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try { await click(button('Xuất CSV')); } finally {
    globalThis.URL.createObjectURL = originalCreate; globalThis.URL.revokeObjectURL = originalRevoke;
    dom.window.HTMLAnchorElement.prototype.click = originalClick;
  }
  const exported = rpcCalls.filter(({ name }) => name === 'watermark_visitor_stats').at(-1).params;
  assert.equal(exported.p_limit, 10000); assert.equal(exported.p_offset, 0);
  assert.equal(exported.p_to, query.p_to); assert.equal(exported.p_search, query.p_search);
  await click(button('Tất cả lịch sử'));
  assert.equal(rpcCalls.filter(({ name }) => name === 'watermark_admin_overview').at(-1).params.p_from, null);
  assert.equal(rpcCalls.filter(({ name }) => name === 'watermark_admin_overview').at(-1).params.p_bucket, 'month');
  await click(button('Tổng quan'));
  assert.match(document.getElementById('route-state').textContent, /range=30d/);
  assert.ok(rpcCalls.filter(({ name }) => name === 'admin_usage_overview').at(-1).params.p_from);
});

test('list filters are scoped to their own tab; invalid dates never fetch Watermark', async () => {
  setupWatermark();
  rpc.admin_usage_requests = () => ({ data: { rows: [], has_more: false }, error: null });
  rpc.admin_usage_activity = () => ({ data: { rows: [], has_more: false }, error: null });
  await render('/admin/usage?tab=ai');
  await select('Model', 'gpt-6-luna'); await settle(400);
  assert.deepEqual(rpcCalls.filter(({ name }) => name === 'admin_usage_requests').at(-1).params.p_filters, { model: 'gpt-6-luna' });
  await click(button('Nhật ký hoạt động'));
  assert.deepEqual(rpcCalls.filter(({ name }) => name === 'admin_usage_activity').at(-1).params.p_filters, {});
  assert.equal(document.querySelector('select[aria-label="Model"]'), null);
  await click(button('AI & chi phí'));
  assert.equal(document.querySelector('select[aria-label="Model"]').value, 'gpt-6-luna');
  await act(async () => { navigate('/admin/usage?tab=watermark&range=custom&from=2026-10-07&to=2026-10-01'); }); await settle();
  assert.match(text(), /Ngày kết thúc phải sau ngày bắt đầu/);
  assert.equal(rpcCalls.filter(({ name }) => name.startsWith('watermark_')).length, 0);
});

test('Watermark realtime refreshes are debounced, manual refresh works, errors preserve data and unsubscribe on leaving', async () => {
  setupWatermark();
  await render('/admin/usage?tab=watermark');
  const count = () => rpcCalls.filter(({ name }) => name === 'watermark_admin_overview').length;
  const before = count();
  await act(async () => {
    for (let i = 0; i < 3; i += 1) globalThis.__watermarkInsert({ payload: { image_count: 1, visitor_id: 'v' } });
  }); await settle(1600);
  assert.equal(count(), before + 1);
  await click(button('Làm mới'));
  assert.equal(count(), before + 2);
  rpc.watermark_admin_overview = () => ({ data: null, error: { message: 'Mất kết nối' } });
  await click(button('Làm mới'));
  assert.match(text(), /Không thể tải tổng quan watermark.*Đang hiển thị dữ liệu/);
  assert.match(text(), /Ảnh đã tạo81/);
  await click(button('Tổng quan'));
  assert.equal(globalThis.__watermarkUnsubscribed, true);
});
