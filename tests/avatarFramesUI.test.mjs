import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';

// Run with: node --import ./tests/avatarFramesLoader.mjs --test tests/avatarFramesUI.test.mjs
// The real AuthProvider, Header, picker and services run in jsdom; only the
// Supabase transport is replaced (tests/fixtures/avatarFramesSupabaseMock.mjs).
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost/dashboard/avatar', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
console.debug = () => {};

// Motion environment: a controllable reduced-motion query, tab visibility and a
// fake IntersectionObserver, with counters to prove the listeners are shared.
const media = { matches: false, listeners: new Set(), adds: 0 };
Object.assign(media, {
  addEventListener(type, listener) { media.adds += 1; media.listeners.add(listener); },
  removeEventListener(type, listener) { media.listeners.delete(listener); },
});
dom.window.matchMedia = () => media;
let visibility = 'visible';
Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, get: () => visibility });
const motion = { visibilityListeners: 0 };
const addListener = dom.window.document.addEventListener.bind(dom.window.document);
dom.window.document.addEventListener = (type, ...rest) => {
  if (type === 'visibilitychange') motion.visibilityListeners += 1;
  return addListener(type, ...rest);
};
class FakeIntersectionObserver {
  static instances = [];
  constructor(callback) { this.callback = callback; this.targets = new Set(); FakeIntersectionObserver.instances.push(this); }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); this.disconnected = true; }
}
const liveObservers = () => FakeIntersectionObserver.instances.filter((instance) => !instance.disconnected);
globalThis.IntersectionObserver = FakeIntersectionObserver;

const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const { AuthProvider } = await import('../src/context/AuthContext.jsx');
const { ThemeContext } = await import('../src/context/theme.js');
const { NotificationContext } = await import('../src/context/notificationContext.js');
const { default: Header } = await import('../src/components/Header.jsx');
const { default: UserAvatar } = await import('../src/components/UserAvatar.jsx');
const { default: AvatarFramePicker } = await import('../src/pages/Dashboard/AvatarFramePicker.jsx');
const { default: AvatarSection } = await import('../src/pages/Dashboard/AvatarSection.jsx');
URL.createObjectURL = () => 'blob:avatar-preview';
URL.revokeObjectURL = () => {};
const { resetAvatarFrames } = await import('../src/hooks/useAvatarFrames.js');

const h = React.createElement;
const USER_ID = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const UPLOADED_PATH = 'frames/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.webp';
const UPLOADED_URL = `https://project.test/storage/v1/object/public/avatar-frames/${UPLOADED_PATH}`;
const FRAMES = [
  { id: 'laurel', name: 'Vòng nguyệt quế', image_source: 'builtin', image_path: 'laurel.svg', sort_order: 1, is_active: true },
  { id: 'frame-0123456789abcdef', name: 'Khung tải lên', image_source: 'storage', image_path: UPLOADED_PATH, sort_order: 2, is_active: true },
];
const notifications = { items: [], unread_count: 0, loading: false, error: '', refresh() {}, markRead() {} };

let root;
let backend;

/** In-memory backend: a profile row, the catalog and recorded calls. Handlers can be overridden per test. */
function installBackend({ profile = {}, frames = FRAMES, uploads = [] } = {}) {
  backend = {
    profile: { id: USER_ID, email: 'tv@example.com', username: 'tv', full_name: 'Trần Vũ', avatar_url: null, role: 'user', status: 'active', avatar_frame_id: null, ...profile },
    frames,
    rpc: [],
    catalogRequests: 0,
    catalog: null,
    setFrame: null,
  };
  globalThis.__framesSession = { user: { id: USER_ID, email: 'tv@example.com', user_metadata: {} }, access_token: 'token', expires_at: 0 };
  globalThis.__framesTable = (args) => {
    if (args.table === 'profiles') return { data: { ...backend.profile }, error: null };
    if (args.table === 'user_uploads') return args.range ? { data: uploads, count: uploads.length, error: null } : { data: uploads[0] ?? null, error: null };
    if (args.table === 'avatar_frames') {
      backend.catalogRequests += 1;
      assert.equal(args.filters.is_active, true, 'the catalog asks only for active frames');
      return backend.catalog ? backend.catalog(args) : { data: backend.frames.filter((frame) => frame.is_active), error: null };
    }
    return { data: null, error: null };
  };
  globalThis.__framesRpc = (name, args) => {
    backend.rpc.push([name, args]);
    if (name === 'set_my_avatar_frame') {
      if (backend.setFrame) return backend.setFrame(args);
      backend.profile.avatar_frame_id = args.p_frame_id;
      return { data: { avatar_frame_id: args.p_frame_id }, error: null };
    }
    return { data: null, error: { code: 'PGRST202' } };
  };
}

const settle = () => act(async () => {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
});

async function renderApp(Page = AvatarFramePicker) {
  root = createRoot(document.querySelector('#root'));
  await act(async () => root.render(
    h(ThemeContext.Provider, { value: { theme: 'light', toggleTheme() {} } },
      h(AuthProvider, null,
        h(MemoryRouter, { initialEntries: ['/dashboard/avatar'] },
          h(NotificationContext.Provider, { value: notifications },
            h(Header),
            h(Page))))),
  ));
  await settle();
}

const headerFrame = () => document.querySelector('.user-menu-trigger [data-avatar-frame]');
const previewFrame = () => document.querySelector('.framePreviewAvatar [data-avatar-frame]');
const option = (name) => [...document.querySelectorAll('label.frameOption')].find((label) => label.textContent.includes(name));
const button = (text) => [...document.querySelectorAll('button')].find((node) => node.textContent.trim() === text);
const pick = (name) => act(async () => option(name).querySelector('input').click());
async function click(node) {
  assert.ok(node, 'element exists');
  await act(async () => node.click());
  await settle();
}

test.beforeEach(() => resetAvatarFrames());
test.afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
});
test.after(() => dom.window.close());

test('picking only previews; "Áp dụng" saves once and the header follows without a reload', async () => {
  installBackend();
  await renderApp();

  assert.equal(headerFrame(), null);
  assert.equal(document.querySelector('.user-menu-trigger .user-avatar-fallback').textContent, 'TV');
  assert.equal(button('Áp dụng').disabled, true, 'nothing to save yet');

  // Name and email stay inside the account menu.
  assert.equal(document.querySelector('.user-menu-meta'), null);
  await click(document.querySelector('.user-menu-trigger'));
  assert.match(document.querySelector('.user-menu-meta').textContent, /Trần Vũ.*tv@example\.com/);
  await click(document.querySelector('.user-menu-trigger'));
  assert.equal(document.querySelector('.user-menu-meta'), null);

  await pick('Vòng nguyệt quế');
  assert.equal(previewFrame().getAttribute('src'), '/avatar-frames/laurel.svg');
  assert.equal(headerFrame(), null, 'the preview does not change the site-wide avatar');
  assert.equal(backend.rpc.length, 0);
  assert.equal(button('Áp dụng').disabled, false);

  let finish;
  backend.setFrame = (args) => new Promise((resolve) => { finish = () => resolve({ data: { avatar_frame_id: args.p_frame_id }, error: null }); });
  await click(button('Áp dụng'));
  assert.equal(button('Đang lưu…').disabled, true);
  await click(button('Đang lưu…'));
  assert.equal(option('Khung tải lên').querySelector('input').matches(':disabled'), true, 'choices are locked while saving');
  assert.deepEqual(backend.rpc, [['set_my_avatar_frame', { p_frame_id: 'laurel' }]]);

  await act(async () => finish());
  await settle();
  assert.equal(headerFrame().getAttribute('src'), '/avatar-frames/laurel.svg');
  assert.equal(headerFrame().getAttribute('alt'), '');
  assert.equal(headerFrame().getAttribute('aria-hidden'), 'true');
  assert.equal(document.querySelector('.user-menu-trigger .user-avatar-fallback').textContent, 'TV', 'initials stay under the frame');
  assert.equal(button('Áp dụng').disabled, true);
  assert.match(option('Vòng nguyệt quế').textContent, /Đang dùng/);
  assert.match(document.querySelector('[role="status"].dashboard-inline-success').textContent, /Đã áp dụng/);
});

test('a failed save keeps the choice for a retry; removing the frame is saved too', async () => {
  installBackend({ profile: { avatar_frame_id: 'laurel' } });
  await renderApp();
  assert.equal(headerFrame().getAttribute('src'), '/avatar-frames/laurel.svg');
  const requestsBefore = backend.catalogRequests;

  backend.setFrame = () => ({ data: null, error: { code: '22023', message: 'Khung avatar không tồn tại hoặc đã ngừng sử dụng.' } });
  await pick('Khung tải lên');
  await click(button('Áp dụng'));
  assert.match(document.querySelector('.dashboard-inline-error[role="alert"]').textContent, /đã ngừng sử dụng/);
  assert.equal(option('Khung tải lên').querySelector('input').checked, true, 'the choice is kept');
  assert.equal(headerFrame().getAttribute('src'), '/avatar-frames/laurel.svg', 'the saved frame is unchanged');
  assert.ok(backend.catalogRequests > requestsBefore, 'the catalog is refreshed after a rejected frame');

  backend.setFrame = null;
  await click(button('Áp dụng'));
  assert.equal(headerFrame().getAttribute('src'), UPLOADED_URL);

  await pick('Không dùng khung');
  await click(button('Áp dụng'));
  assert.deepEqual(backend.rpc.at(-1), ['set_my_avatar_frame', { p_frame_id: null }]);
  assert.equal(headerFrame(), null);
  assert.match(document.querySelector('.dashboard-inline-success').textContent, /Đã gỡ khung/);
});

test('catalog loading, failure with retry, and an empty catalog', async () => {
  installBackend();
  let release;
  backend.catalog = () => new Promise((resolve) => { release = resolve; });
  await renderApp();
  assert.ok(document.querySelector('[aria-busy="true"] .frameSkeleton'), 'skeletons while loading');

  await act(async () => release({ data: null, error: { code: 'NETWORK', message: 'private detail' } }));
  await settle();
  const alert = document.querySelector('.inlineError[role="alert"]');
  assert.match(alert.textContent, /Không tải được danh sách khung avatar/);
  assert.doesNotMatch(document.body.textContent, /private detail/);

  backend.catalog = null;
  await click(alert.querySelector('button'));
  assert.ok(option('Vòng nguyệt quế'));
  assert.equal(document.querySelector('.inlineError'), null);

  await act(async () => root.unmount());
  resetAvatarFrames();
  installBackend({ frames: [] });
  await renderApp();
  assert.match(document.body.textContent, /Hiện chưa có khung nào được bật/);
  assert.ok(option('Không dùng khung'));
});

test('a saved frame that was disabled shows no frame and can be removed', async () => {
  installBackend({ profile: { avatar_frame_id: 'retired-frame' } });
  await renderApp();
  assert.equal(headerFrame(), null);
  assert.equal(document.querySelector('.user-menu-trigger .user-avatar-fallback').textContent, 'TV');
  assert.match(document.body.textContent, /đã ngừng hoạt động/);
  assert.equal(button('Áp dụng').disabled, true);
  await pick('Không dùng khung');
  await click(button('Áp dụng'));
  assert.deepEqual(backend.rpc, [['set_my_avatar_frame', { p_frame_id: null }]]);
  assert.doesNotMatch(document.body.textContent, /đã ngừng hoạt động/);
});

test('UserAvatar: a broken frame or picture never removes the avatar; legacy callers are unchanged', async () => {
  root = createRoot(document.querySelector('#root'));
  const render = (props) => act(async () => root.render(h('span', { className: 'host' }, h(UserAvatar, { alt: 'TV', initials: 'TV', ...props }))));

  await render({ src: 'https://cdn.test/me.png' });
  assert.equal(document.querySelector('.host').innerHTML.startsWith('<img'), true, 'no wrapper without frameSrc');

  await render({ src: 'https://cdn.test/me.png', frameSrc: '/avatar-frames/laurel.svg' });
  const frame = document.querySelector('[data-avatar-frame]');
  await act(async () => frame.dispatchEvent(new dom.window.Event('error')));
  assert.equal(document.querySelector('[data-avatar-frame]'), null);
  assert.equal(document.querySelector('.user-avatar-clip img').getAttribute('src'), 'https://cdn.test/me.png');

  await render({ src: 'https://cdn.test/other.png', frameSrc: '/avatar-frames/starlight.svg' });
  await act(async () => document.querySelector('.user-avatar-clip img').dispatchEvent(new dom.window.Event('error')));
  assert.equal(document.querySelector('.user-avatar-clip').textContent, 'TV');
  assert.equal(document.querySelector('[data-avatar-frame]').getAttribute('src'), '/avatar-frames/starlight.svg');

  await render({ src: 'https://cdn.test/other.png', frameSrc: '/avatar-frames/starlight.svg', isReady: false });
  assert.ok(document.querySelector('.user-avatar-skeleton'));
  assert.equal(document.querySelector('[data-avatar-frame]'), null, 'no frame before the avatar source is known');
});

test('"Avatar của bạn": keyboard-reachable picker, file rules, round preview with the saved frame, jump to frames', async () => {
  const upload = { id: 1, user_id: USER_ID, image_url: 'https://cdn.test/me.png', file_name: 'me.png', created_at: '2026-10-20T00:00:00Z' };
  installBackend({ profile: { avatar_frame_id: 'laurel' }, uploads: [upload] });
  await renderApp(AvatarSection);
  const hero = document.querySelector('[aria-labelledby="avatar-hero-title"]');
  assert.match(hero.textContent, /Nguồn ảnh.*Ảnh tải lên gần nhất/);
  assert.match(hero.textContent, /Khung.*Vòng nguyệt quế/);
  assert.equal(hero.querySelector('[data-avatar-frame]').getAttribute('src'), '/avatar-frames/laurel.svg');
  const change = button('Đổi ảnh');
  assert.equal(change.tagName, 'BUTTON');
  assert.notEqual(change.tabIndex, -1, 'the file picker is reachable with Tab');
  assert.match(document.querySelector('a[href="/dashboard/uploads"]').textContent, /Xem tất cả \(1\)/);

  const input = document.querySelector('#dashboard-avatar-upload');
  const choose = async (file) => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new dom.window.Event('change', { bubbles: true })));
    await settle();
  };
  await choose(new dom.window.File(['GIF89a'], 'anim.gif', { type: 'image/gif' }));
  assert.match(hero.querySelector('[role="alert"]').textContent, /JPG, PNG hoặc WebP/);
  assert.ok(button('Đổi ảnh'), 'nothing selected after a rejected file');

  await choose(new dom.window.File([new Uint8Array(3000)], 'chan-dung.png', { type: 'image/png' }));
  assert.equal(hero.querySelector('[role="alert"]'), null);
  assert.match(hero.textContent, /chan-dung\.png.*2,9 KB/);
  assert.match(hero.textContent, /Xem trước/);
  assert.equal(hero.querySelector('.user-avatar-clip img').getAttribute('src'), 'blob:avatar-preview');
  assert.equal(hero.querySelector('[data-avatar-frame]').getAttribute('src'), '/avatar-frames/laurel.svg', 'preview keeps the saved frame');
  assert.ok(button('Cập nhật ảnh'));
  await click(button('Bỏ chọn'));
  assert.doesNotMatch(hero.textContent, /chan-dung/);
  assert.equal(hero.querySelector('.user-avatar-clip img').getAttribute('src'), 'https://cdn.test/me.png');

  await click(button('Chọn khung'));
  assert.equal(document.activeElement, option('Vòng nguyệt quế').querySelector('input'), 'focus moves to the saved frame');
});

const ANIMATED = { id: 'orbit-glow', name: 'Vầng sáng xoay', image_source: 'builtin', image_path: 'orbit-glow.png', fallback_path: 'orbit-glow-still.png', image_format: 'apng', frame_type: 'animated', frame_count: 30, duration_ms: 2400, sort_order: 3, is_active: true };
const states = (selector) => [...document.querySelectorAll(selector)].map((node) => [node.dataset.frameState, node.getAttribute('src')]);

test('animated frames: stills in the list, motion only in the preview and on applied avatars, play/pause', async () => {
  installBackend({ frames: [...FRAMES, ANIMATED] });
  media.adds = 0;
  motion.visibilityListeners = 0;
  FakeIntersectionObserver.instances.length = 0;
  await renderApp();
  const optionFrame = option('Vầng sáng xoay').querySelector('[data-avatar-frame]');
  assert.match(option('Vầng sáng xoay').textContent, /Động/);
  assert.deepEqual([optionFrame.dataset.frameState, optionFrame.getAttribute('src')], ['static', '/avatar-frames/orbit-glow-still.png']);
  assert.equal(document.querySelectorAll('[data-frame-state="animated"]').length, 0, 'nothing animates before a pick');
  assert.equal(button('Tạm dừng'), undefined, 'play/pause only for animated previews');

  await pick('Vầng sáng xoay');
  assert.deepEqual(states('.framePreviewAvatar [data-avatar-frame]'), [['animated', '/avatar-frames/orbit-glow.png']]);
  assert.equal(document.querySelectorAll('[data-frame-state="animated"]').length, 1, 'only the preview plays');
  assert.equal(headerFrame(), null, 'not applied yet');

  await click(button('Tạm dừng'));
  assert.deepEqual(states('.framePreviewAvatar [data-avatar-frame]'), [['still', '/avatar-frames/orbit-glow-still.png']]);
  assert.equal(button('Phát').getAttribute('aria-pressed'), 'true');
  await click(button('Phát'));
  assert.equal(document.querySelector('.framePreviewAvatar [data-avatar-frame]').dataset.frameState, 'animated');

  await click(button('Áp dụng'));
  assert.deepEqual([headerFrame().dataset.frameState, headerFrame().getAttribute('src')], ['animated', '/avatar-frames/orbit-glow.png']);
  assert.equal(media.adds, 1, 'one reduced-motion listener for every avatar');
  assert.equal(motion.visibilityListeners, 1, 'one visibilitychange listener for every avatar');
  // Detached while no animated avatar needs it (e.g. paused), re-created when one does.
  assert.equal(liveObservers().length, 1, 'one shared IntersectionObserver');
  assert.equal(liveObservers()[0].targets.size, 2, 'only the animated avatars are observed');
});

test('reduced motion, hidden tabs and off-screen avatars switch to the still and back, live', async () => {
  installBackend({ profile: { avatar_frame_id: 'orbit-glow' }, frames: [...FRAMES, ANIMATED] });
  FakeIntersectionObserver.instances.length = 0;
  await renderApp();
  await pick('Vầng sáng xoay');
  const header = () => headerFrame().dataset.frameState;
  const preview = () => document.querySelector('.framePreviewAvatar [data-avatar-frame]').dataset.frameState;
  assert.deepEqual([header(), preview()], ['animated', 'animated']);

  media.matches = true;
  await act(async () => media.listeners.forEach((listener) => listener()));
  assert.deepEqual([header(), preview()], ['still', 'still']);
  assert.equal(headerFrame().getAttribute('src'), '/avatar-frames/orbit-glow-still.png');
  assert.equal(button('Tạm dừng').disabled, true);
  assert.match(document.body.textContent, /giảm chuyển động/);
  media.matches = false;
  await act(async () => media.listeners.forEach((listener) => listener()));
  assert.deepEqual([header(), preview()], ['animated', 'animated']);

  visibility = 'hidden';
  await act(async () => dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')));
  assert.deepEqual([header(), preview()], ['still', 'still']);
  visibility = 'visible';
  await act(async () => dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange')));
  assert.equal(header(), 'animated');

  const [observer] = liveObservers();
  const headerLayers = headerFrame().closest('.user-avatar-layers');
  await act(async () => observer.callback([{ target: headerLayers, isIntersecting: false }]));
  assert.deepEqual([header(), preview()], ['still', 'animated']);
  await act(async () => observer.callback([{ target: headerLayers, isIntersecting: true }]));
  assert.equal(header(), 'animated');
});

test('a broken animation falls back to the still; if both fail the avatar stays', async () => {
  root = createRoot(document.querySelector('#root'));
  await act(async () => root.render(h(UserAvatar, { src: 'https://cdn.test/me.png', alt: 'TV', initials: 'TV', frameSrc: '/a.png', frameFallbackSrc: '/a-still.png' })));
  const frame = () => document.querySelector('[data-avatar-frame]');
  assert.deepEqual([frame().dataset.frameState, frame().getAttribute('src')], ['animated', '/a.png']);
  await act(async () => frame().dispatchEvent(new dom.window.Event('error')));
  assert.deepEqual([frame().dataset.frameState, frame().getAttribute('src')], ['still', '/a-still.png']);
  await act(async () => frame().dispatchEvent(new dom.window.Event('error')));
  assert.equal(frame(), null);
  assert.equal(document.querySelector('.user-avatar-clip img').getAttribute('src'), 'https://cdn.test/me.png');
});

// Last: flips profileService's module-level fallback for the rest of the process.
test('before the migration runs, profiles still load and saving explains what is missing', async () => {
  const { getProfile } = await import('../src/services/profileService.js');
  const { setMyAvatarFrame } = await import('../src/services/avatarFrameService.js');
  const selects = [];
  globalThis.__framesTable = (args) => {
    selects.push(args.select);
    return args.select.includes('avatar_frame_id')
      ? { data: null, error: { code: '42703', message: 'column profiles.avatar_frame_id does not exist' } }
      : { data: { id: USER_ID }, error: null };
  };
  assert.deepEqual((await getProfile(USER_ID)).data, { id: USER_ID });
  assert.equal(selects.length, 2);
  assert.doesNotMatch(selects[1], /avatar_frame_id/);
  await getProfile(USER_ID);
  assert.equal(selects.length, 3, 'later reads skip the missing column directly');

  globalThis.__framesRpc = () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
  assert.match((await setMyAvatarFrame('laurel')).error, /chưa được cài đặt.*migration/);
});
