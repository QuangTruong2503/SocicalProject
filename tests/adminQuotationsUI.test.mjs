import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import { JSDOM } from 'jsdom';
import { HelmetProvider } from 'react-helmet-async';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'http://localhost/admin/quotations',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
HelmetProvider.canUseDOM=true;
const {createRoot}=await import('react-dom/client');
const {MemoryRouter,Routes,Route,useLocation}=await import('react-router-dom');
const {default:AdminQuotationsPage}=await import('../src/pages/Admin/AdminQuotationsPage.jsx');
let root;
const STD={id:'standard-1',kind:'standard',quotation_no:'MT-001',quotation_date:'2026-10-15',customer_name:'Khách Minh Triết',contact_name:'Liên hệ A',phone:'0901234567',creator_name:'Nhân viên A',status:'draft',total:100,updated_at:'2026-10-15T00:00:00Z',deleted_at:null};
const KNM={...STD,id:'knm-1',kind:'knm',quotation_no:'KNM-001',customer_name:'Khách KNM',status:null};
const response=(rows,total=rows.length)=>({data:{rows,total_count:total,summary:{total,value:100,draft:1,confirmed:0,month:1,recent:1},creators:[]},error:null});
const missing=()=>({data:null,error:{code:'PGRST202'}});
const byText=(text)=>[...document.querySelectorAll('button')].find((button)=>button.textContent.trim()===text);
const byLabel=(label)=>document.querySelector(`button[aria-label="${label}"]`);
const labelControl=(label)=>[...document.querySelectorAll('label')].find((element)=>element.firstChild.textContent===label)?.querySelector('input,select');
const tableText=()=>document.querySelector('tbody').textContent;
function LocationProbe(){const value=useLocation();return React.createElement('output',{'data-testid':'location'},JSON.stringify({path:value.pathname+value.search,state:value.state}));}
async function render(path='/admin/quotations') {
  root=createRoot(document.querySelector('#root'));
  await act(async()=>root.render(React.createElement(HelmetProvider,null,React.createElement(MemoryRouter,{initialEntries:[path]},
    React.createElement(LocationProbe),React.createElement(Routes,null,
      React.createElement(Route,{path:'/admin/quotations',element:React.createElement(AdminQuotationsPage)}),
      React.createElement(Route,{path:'*',element:React.createElement('p',null,'Editor destination')}))))));
}
async function click(element){assert.ok(element);await act(async()=>element.click());}
async function fill(element,value){assert.ok(element);await act(async()=>{
  const prototype=element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,value);
  element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));
});}
const debounce=()=>act(()=>new Promise((resolve)=>setTimeout(resolve,330)));
test.beforeEach(()=>{
  globalThis.__adminQuotationRpc=(name,args)=>name==='admin_list_quotations'?response([args.p_kind==='knm'?KNM:STD]):response([]);
  globalThis.__adminQuotationTable=()=>({data:[],error:null});
});
test.afterEach(async()=>{if(root){await act(async()=>root.unmount());root=null;}});
test.after(()=>dom.window.close());

test('late response from Minh Triet cannot replace KNM or generate wrong-kind links',async()=>{
  let finish;
  globalThis.__adminQuotationRpc=(name,args)=>args.p_kind==='standard'?new Promise((resolve)=>{finish=resolve;}):response([KNM]);
  await render();
  await click(byText('KNM'));
  assert.match(tableText(),/KNM-001/);assert.doesNotMatch(tableText(),/MT-001/);
  await act(async()=>finish(response([STD])));
  assert.match(tableText(),/KNM-001/);assert.equal(document.querySelector('tbody a').getAttribute('href'),'/bao-gia-knm/knm-1/chinh-sua');
});
test('new searches hide stale rows immediately, debounce and reject older responses',async()=>{
  const calls=[];const pending={};
  globalThis.__adminQuotationRpc=(name,args)=>{calls.push(args.p_search);return !args.p_search?response([STD]):new Promise((resolve)=>{pending[args.p_search]=resolve;});};
  await render();await fill(labelControl('Tìm báo giá'),'a');
  assert.doesNotMatch(tableText(),/MT-001/);await debounce();
  await fill(labelControl('Tìm báo giá'),'ab');await debounce();
  await act(async()=>pending.ab(response([{...STD,quotation_no:'MATCH-AB'}])));
  await act(async()=>pending.a(response([{...STD,quotation_no:'OLD-A'}])));
  assert.match(tableText(),/MATCH-AB/);assert.doesNotMatch(tableText(),/OLD-A/);
  assert.deepEqual(calls,[null,'a','ab']);
});
test('an error is distinct from an empty list and retry recovers',async()=>{
  let fail=true;
  globalThis.__adminQuotationRpc=()=>fail?{data:null,error:{code:'NETWORK',message:'internal secret'}}:response([STD]);
  await render();assert.match(document.querySelector('[role="alert"]').textContent,/thử lại/);
  assert.doesNotMatch(document.body.textContent,/internal secret/);assert.doesNotMatch(tableText(),/Chưa có báo giá/);
  fail=false;await click(byText('Thử lại'));assert.match(tableText(),/MT-001/);
});
test('confirmation remains open and prevents double submission or Escape while pending',async()=>{
  let finish;let changes=0;let deleted=false;let payload;
  globalThis.__adminQuotationRpc=(name,args)=>{
    if(name==='admin_list_quotations')return response(deleted?[]:[STD]);
    if(name==='admin_change_quotation'){changes++;payload=args;return new Promise((resolve)=>{finish=()=>{deleted=true;resolve({data:{id:STD.id},error:null});};});}
  };
  await render();await click(byLabel('Xóa MT-001'));
  assert.match(document.querySelector('[role="dialog"]').textContent,/Khách Minh Triết/);
  await click(byText('Chuyển vào thùng rác'));
  assert.ok(document.querySelector('[role="dialog"]'));
  await click(byText('Đang xử lý...'));
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.ok(document.querySelector('[role="dialog"]'));assert.equal(changes,1);
  assert.equal(payload.p_kind,'standard');assert.equal(payload.p_expected_updated_at,STD.updated_at);
  await act(async()=>finish());assert.equal(document.querySelector('[role="dialog"]'),null);
  assert.doesNotMatch(tableText(),/MT-001/);
});
test('cancelled quotations do not offer a redundant cancel action',async()=>{
  globalThis.__adminQuotationRpc=()=>response([{...STD,status:'cancelled'}]);
  await render();assert.equal(byLabel('Hủy MT-001'),null);assert.equal(byLabel('Xóa MT-001'),null);
  assert.ok(document.querySelector('select[aria-label="Đổi trạng thái MT-001"]'));
});
test('pagination is server-side and editor links preserve the exact admin return URL',async()=>{
  const offsets=[];
  globalThis.__adminQuotationRpc=(name,args)=>{offsets.push(args.p_offset);return response([STD],60);};
  await render('/admin/quotations?q=Alpha&sort=total');
  await click(byLabel('Trang sau'));assert.deepEqual(offsets,[0,25]);
  const location=JSON.parse(document.querySelector('output').textContent);
  assert.match(location.path,/page=2/);
  await click(document.querySelector('tbody a.quoteNumber'));
  const editor=JSON.parse(document.querySelector('output').textContent);
  assert.equal(editor.path,'/bao-gia-minh-triet/standard-1/chinh-sua');
  assert.equal(editor.state.adminReturnTo,location.path);
});

test('sort selector remains available outside the table and resets paging',async()=>{
  const calls=[];
  globalThis.__adminQuotationRpc=(name,args)=>{calls.push(args);return response([STD],60);};
  await render('/admin/quotations?page=2');await fill(labelControl('Sắp xếp'),'total:asc');
  assert.equal(calls.at(-1).p_sort,'total');assert.equal(calls.at(-1).p_desc,false);assert.equal(calls.at(-1).p_offset,0);
  assert.equal(document.querySelector('table').contains(labelControl('Sắp xếp')),false);
});
test('trash restores the captured row through the checked RPC',async()=>{
  let action;let restored=false;
  globalThis.__adminQuotationRpc=(name,args)=>{
    if(name==='admin_list_quotations')return response(restored?[]:[{...KNM,deleted_at:'2026-10-15T01:00:00Z'}]);
    action=args;restored=true;return {data:{id:KNM.id},error:null};
  };
  await render('/admin/quotations?kind=knm&view=trash');await click(byLabel('Khôi phục KNM-001'));await click(byText('Khôi phục'));
  assert.equal(action.p_action,'restore');assert.equal(action.p_kind,'knm');assert.equal(action.p_id,KNM.id);
  assert.match(tableText(),/Không có báo giá trong thùng rác/);
});
test('baseline API fallback paginates and shows contact and phone together',async()=>{
  globalThis.__adminQuotationRpc=(name)=>name==='admin_list_quotations'?missing():{data:[{...STD,prepared_by_name:'Staff',total_count:60}],error:null};
  await render();assert.match(tableText(),/Liên hệ A/);assert.match(tableText(),/0901234567/);assert.match(tableText(),/15\/10\/2026/);
  assert.equal(labelControl('Người lập').disabled,true);
  assert.match(document.body.textContent,/Giá trị trang này/);
});

test('legacy errors are sanitized and unavailable history is not reported as empty',async()=>{
  let fail=true;
  globalThis.__adminQuotationRpc=(name)=>name==='admin_list_quotations'||name==='admin_get_quotation'?missing():
    fail?{data:null,error:{code:'NETWORK',message:'private internal details'}}:{data:[{...STD,total_count:1}],error:null};
  globalThis.__adminQuotationTable=({table})=>table==='quotations'?{data:{...STD,quotation_items:[]},error:null}:
    {data:null,error:{code:'NETWORK',message:'private history details'}};
  await render();assert.doesNotMatch(document.body.textContent,/private internal details/);
  fail=false;await click(byText('Thử lại'));await click(byLabel('Xem nhanh MT-001'));
  const dialog=document.querySelector('[role="dialog"]');
  assert.match(dialog.textContent,/Chưa tải được lịch sử/);
  assert.doesNotMatch(dialog.textContent,/private history details|Chưa có lịch sử/);
});
test('quick details render the selected type and its change history',async()=>{
  globalThis.__adminQuotationRpc=(name)=>name==='admin_list_quotations'?response([STD]):{
    data:{record:{...STD,prepared_by_name:'Staff',quotation_items:[{id:'item',product_name:'Máy khoan',quantity:2,unit:'Cái',unit_price:50}]},history:[{id:1,action:'restore',actor_name:'Admin',created_at:STD.updated_at,changes:{deleted_at:{from:STD.updated_at,to:null}}}]},error:null};
  await render();await click(byLabel('Xem nhanh MT-001'));
  assert.match(document.querySelector('[role="dialog"]').textContent,/Máy khoan/);
  assert.match(document.querySelector('[role="dialog"]').textContent,/Khôi phục/);
  await click(document.querySelector('button[aria-label="Đóng"]'));assert.equal(document.querySelector('[role="dialog"]'),null);
});
test('invalid date ranges never issue a request or leave stale actions enabled',async()=>{
  let calls=0;globalThis.__adminQuotationRpc=()=>{calls++;return response([STD]);};
  await render('/admin/quotations?from=2026-10-15&to=2026-10-01');
  assert.equal(calls,0);assert.match(document.querySelector('[role="alert"]').textContent,/Ngày bắt đầu/);
  assert.equal(byLabel('Xóa MT-001'),null);
});
