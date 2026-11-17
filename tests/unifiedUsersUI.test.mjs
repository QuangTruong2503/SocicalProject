import test from 'node:test';
import assert from 'node:assert/strict';
import React,{ act } from 'react';
import { JSDOM } from 'jsdom';
import { installUnifiedUsersBackend,ADMIN,USER,OTHER } from './fixtures/unifiedUsersBackend.mjs';
const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{ url:'http://localhost/admin/users',pretendToBeVisual:true });
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
Object.defineProperty(globalThis,'navigator',{ value:dom.window.navigator,configurable:true });
const { createRoot }=await import('react-dom/client');
const { HelmetProvider }=await import('react-helmet-async');
const { createMemoryRouter,RouterProvider,Routes,Route,useLocation,useNavigate }=await import('react-router-dom');
const { AuthContext }=await import('../src/context/authContext.js');
const { default:Users }=await import('../src/pages/Admin/AdminUsersPage.jsx');
const { default:Products }=await import('../src/pages/Admin/AdminProductLinksPage.jsx');
const { default:Config }=await import('../src/pages/Admin/AdminUsageConfig.jsx');
HelmetProvider.canUseDOM=true;
const h=React.createElement;
let root,backend,navigate;
const settle=() => act(async () => { for(let i=0;i<10;i++) await new Promise((r) => setTimeout(r,0)); });
function Location() { const location=useLocation();navigate=useNavigate();return h('output',{ id:'location' },location.pathname+location.search); }
async function render(path='/admin/users') {
  backend=installUnifiedUsersBackend();
  root=createRoot(document.getElementById('root'));
  const router=createMemoryRouter([{ path:'*',element:h(React.Fragment,null,h(Location),h(Routes,null,h(Route,{ path:'/admin/users',element:h(Users) }),h(Route,{ path:'/admin/product-links',element:h(Products) }),h(Route,{ path:'/admin/usage',element:h(Config) }))) }],{ initialEntries:[path] });
  await act(async () => root.render(h(HelmetProvider,null,h(AuthContext.Provider,{ value:{ user:{ id:ADMIN } } },h(RouterProvider,{ router })))));
  await settle();return backend;
}
test.afterEach(async () => { if(root) await act(async () => root.unmount());root=null; });
const byText=(text,scope=document) => [...scope.querySelectorAll('button')].find((node) => node.textContent.trim()===text);
const named=(label) => document.querySelector(`[aria-label="${label}"]`);
async function click(node) { assert.ok(node,'click target exists');await act(async () => node.click());await settle(); }
async function select(node,value) { assert.ok(node);await act(async () => {node.value=value;node.dispatchEvent(new dom.window.Event('change',{ bubbles:true }));});await settle(); }
async function input(node,value) { assert.ok(node);await act(async () => {const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;setter.call(node,value);node.dispatchEvent(new dom.window.Event('input',{ bubbles:true }));});await settle(); }
const calls=(name) => backend.calls.filter((call) => call.name===name);

test('permissions are draft-only, review before saving, keep failed drafts and refresh all summaries after success',async (t) => {
  await render(`/admin/users?tab=list&user=${USER}&section=permissions&plan=pro`);
  assert.ok(document.body.textContent.includes('Cấp trực tiếp'));
  assert.ok(document.body.textContent.includes('minhanh@test.invalid'));
  await select(named('Quyền được cấp'),'editor');
  assert.equal(calls('admin_user_set_access').length,0);
  await click(byText('Xem lại thay đổi'));
  assert.ok(document.body.textContent.includes('Cộng tác → Quản lý dữ liệu'));
  backend.failAccess=true;
  await click(byText('Lưu thay đổi quyền'));
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('vừa thay đổi'));
  assert.equal(named('Quyền được cấp').value,'editor');
  assert.equal(backend.rows.find((p) => p.id===USER).direct_level,'checker');
  backend.failAccess=false;
  await click(byText('Lưu thay đổi quyền'));
  assert.equal(backend.rows.find((p) => p.id===USER).direct_level,'editor');
  const request=calls('admin_user_set_access').at(-1).args;
  assert.equal(request.p_targets[0].direct_level,'checker');
  assert.ok(request.p_targets[0].access_updated_at);
  assert.ok(calls('admin_user_center_stats').length>1);
  assert.ok(calls('admin_user_directory').length>1);
  assert.ok(calls('admin_user_detail').length>1);
  await select(named('Quyền được cấp'),'viewer');
  t.mock.method(window,'confirm',() => false);
  await click(named('Đóng'));
  assert.ok(document.querySelector('[role="dialog"]'),'unsaved changes can keep the drawer open');
  await click(byText('Hủy',document.querySelector('[role="dialog"]')));
  assert.equal(named('Quyền được cấp').value,'editor');
});

test('batch selection is scoped to this page, excludes inherited admins and previews suspended access accurately',async () => {
  await render('/admin/users?tab=permissions&tool=product-links');
  assert.equal(named('Chọn Quản trị kiểm thử').disabled,true);
  await click(named('Chọn tất cả trên trang hiện tại'));
  assert.ok(document.body.textContent.includes('Đã chọn 2 tài khoản trên trang hiện tại'));
  await click(byText('Cấp / thu hồi quyền đã chọn'));
  await select(named('Quyền được cấp'),'viewer');
  await click(byText('Xem lại thay đổi'));
  const dialog=document.querySelector('[role="dialog"]');
  assert.ok(dialog.textContent.includes('Nguyễn Minh Anh'));
  assert.ok(dialog.textContent.includes('Bị chặn do tài khoản đã khóa'));
  await click(byText('Lưu thay đổi quyền'));
  assert.deepEqual(calls('admin_user_set_access')[0].args.p_targets.map((p) => p.id).sort(),[USER,OTHER].sort());
  assert.equal(backend.rows.find((p) => p.id===ADMIN).direct_level,'viewer');
  assert.equal(backend.rows.find((p) => p.id===OTHER).effective_level,null);
});

test('quota defaults are restored by deletion, errors preserve drafts and enforcement state is explicit',async () => {
  await render(`/admin/users?user=${USER}&section=quota`);
  assert.ok(document.body.textContent.includes('CHƯA BẬT'));
  await input(named('Ngoại lệ ảnh mỗi ngày'),'0');
  assert.equal(calls('admin_user_set_quota').length,0);
  await click(byText('Xem lại hạn mức'));
  backend.failQuota=true;
  await click(byText('Lưu thay đổi hạn mức'));
  assert.ok(document.querySelector('[role="alert"]'));
  assert.equal(named('Ngoại lệ ảnh mỗi ngày').value,'0');
  backend.failQuota=false;
  await click(byText('Lưu thay đổi hạn mức'));
  assert.equal(backend.overrides[USER].daily_image_limit,0);
  await click(byText('Xóa ngoại lệ / Dùng mặc định của gói'));
  await click(byText('Lưu thay đổi hạn mức'));
  assert.equal(calls('admin_user_set_quota').at(-1).args.p_value,null);
  assert.equal(backend.overrides[USER],undefined);
  assert.ok(document.body.textContent.includes('Mặc định của gói'));
});

test('legacy links preserve filters; Back, Forward and direct profiles preserve the user center URL',async () => {
  await render('/admin/product-links?tab=permissions&status=suspended&level=granted&q=tai');
  const location=() => document.getElementById('location').textContent;
  assert.ok(location().startsWith('/admin/users?'));
  assert.ok(location().includes('status=suspended'));
  assert.ok(location().includes('search=tai'));
  await act(async () => navigate(`/admin/users?tab=list&plan=pro&user=${USER}&section=permissions`));await settle();
  await click(byText('Gói & hạn mức',document.querySelector('[role="dialog"]')));
  assert.ok(location().includes('section=quota'));
  await act(async () => navigate(-1));await settle();
  assert.ok(location().includes('section=permissions'));
  await act(async () => navigate(1));await settle();
  assert.ok(location().includes('section=quota'));
  await click(named('Đóng'));
  assert.ok(location().includes('plan=pro'));
  assert.ok(!location().includes('user='));
});

test('Back navigation can keep a dirty draft or explicitly discard it before leaving',async (t) => {
  const errors=[];t.mock.method(console,'error',(...args) => errors.push(args));
  await render('/admin/users?plan=pro');
  await act(async () => navigate(`/admin/users?plan=pro&user=${USER}&section=permissions`));await settle();
  await select(named('Quyền được cấp'),'editor');
  let discard=false;
  t.mock.method(window,'confirm',() => discard);
  await act(async () => navigate(-1));await settle();
  assert.ok(document.getElementById('location').textContent.includes(`user=${USER}`));
  assert.equal(named('Quyền được cấp').value,'editor');
  discard=true;
  await act(async () => navigate(-1));await settle();
  assert.equal(document.getElementById('location').textContent,'/admin/users?plan=pro');
  assert.equal(document.querySelector('[role="dialog"]'),null);
  assert.equal(calls('admin_user_set_access').length,0);
  assert.deepEqual(errors,[],'navigation completes without a router error boundary');
});

test('product work page and general usage config link to the sole permission/quota editors',async () => {
  await render('/admin/product-links');
  assert.ok([...document.querySelectorAll('a')].some((a) => a.getAttribute('href')==='/admin/users?tab=permissions&tool=product-links'));
  assert.equal(document.querySelector('input[aria-label="Chọn tất cả trên trang hiện tại"]'),null);
  assert.equal(calls('admin_product_link_work_logs').length,1);
  await act(async () => navigate('/admin/usage?tab=config'));await settle();
  assert.ok([...document.querySelectorAll('a')].some((a) => a.getAttribute('href')===`/admin/users?tab=list&user=${USER}&section=quota`));
  assert.equal(byText('Lưu ngoại lệ'),undefined);
  assert.equal(calls('admin_usage_config_change').length,0);
});

test('missing users and failed directory requests do not render missing permissions as a successful empty state',async () => {
  await render('/admin/users?user=00000000-0000-4000-8000-000000000000');
  assert.ok(document.querySelector('[role="dialog"] [role="alert"]').textContent.includes('Không tìm thấy'));
  await click(named('Đóng'));
  backend.directoryError=true;
  await click(byText('Làm mới'));
  assert.ok(document.querySelector('[role="tabpanel"] [role="alert"]'));
  assert.ok(!document.querySelector('tbody').textContent.includes('Không có người dùng'));
});
