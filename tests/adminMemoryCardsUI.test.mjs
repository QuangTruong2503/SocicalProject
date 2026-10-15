import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {HelmetProvider} from 'react-helmet-async';
const dom=new JSDOM('<html><body><div id="root"></div></body></html>',{url:'http://localhost/admin/memory-cards',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;HelmetProvider.canUseDOM=true;
const {createRoot}=await import('react-dom/client');
const {MemoryRouter,useLocation}=await import('react-router-dom');
const {default:Page}=await import('../src/pages/Admin/AdminMemoryCardsPage.jsx');
const service=await import('../src/services/memoryCardService.js');
const CARD={id:1,image:'https://images.test/a.webp',name:'Ảnh A',category:'Thú',created_at:'2026-10-15T00:00:00Z',is_active:true,version:1,in_catalog:true};
const response=(rows=[CARD],count=rows.length)=>({data:{rows,total_count:count,summary:{total:count,active:count,paused:0,catalog:Math.min(64,count)},categories:['Thú']},error:null});
const missing=()=>({data:null,error:{code:'PGRST202'}});
let root;
function Probe(){const location=useLocation();return React.createElement('output',null,location.pathname+location.search);}
async function render(path='/admin/memory-cards'){
  root=createRoot(document.querySelector('#root'));
  await act(async()=>root.render(React.createElement(HelmetProvider,null,React.createElement(MemoryRouter,{initialEntries:[path]},React.createElement(Probe),React.createElement(Page)))));
}
const buttons=(text)=>[...document.querySelectorAll('button')].filter((e)=>e.textContent.trim()===text);
const label=(text)=>[...document.querySelectorAll('label')].find((e)=>e.firstChild?.textContent===text)?.querySelector('input,select');
async function click(element){assert.ok(element);await act(async()=>element.click());}
async function fill(element,value){assert.ok(element);await act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='SELECT'?dom.window.HTMLSelectElement.prototype:dom.window.HTMLInputElement.prototype,'value').set.call(element,value);element.dispatchEvent(new dom.window.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));});}
const debounce=()=>act(()=>new Promise((resolve)=>setTimeout(resolve,330)));
test.beforeEach(()=>{
  globalThis.__cardRpc=(name)=>name==='admin_list_memory_cards'?response():{data:CARD,error:null};
  globalThis.__cardTable=()=>({data:[],count:0,error:null});globalThis.__cardStorage=()=>({data:[],error:null});
});
test.afterEach(async()=>{if(root){await act(async()=>root.unmount());root=null;}});test.after(()=>dom.window.close());
test('search hides stale cards immediately and late results cannot replace newer matches',async()=>{
  const pending={};globalThis.__cardRpc=(name,args)=>!args.p_search?response():new Promise((resolve)=>{pending[args.p_search]=resolve;});
  await render();await fill(label('Tìm ảnh'),'a');assert.equal(document.querySelector('.imageCard'),null);await debounce();
  await fill(label('Tìm ảnh'),'ab');await debounce();
  await act(async()=>pending.ab(response([{...CARD,name:'New match'}])));await act(async()=>pending.a(response([{...CARD,name:'Stale match'}])));
  assert.match(document.body.textContent,/New match/);assert.doesNotMatch(document.body.textContent,/Stale match/);
});
test('errors are separate from empty data and retry succeeds without leaking server details',async()=>{
  let fail=true;globalThis.__cardRpc=()=>fail?{data:null,error:{code:'NETWORK',message:'private SQL detail'}}:response();
  await render();assert.match(document.querySelector('[role="alert"]').textContent,/Không thể kết nối/);assert.doesNotMatch(document.body.textContent,/private SQL/);
  fail=false;await click(buttons('Thử lại')[0]);assert.ok(document.querySelector('.imageCard'));
});
test('pagination, filters and empty out-of-range pages use server counts and URL state',async()=>{
  const calls=[];globalThis.__cardRpc=(name,args)=>{calls.push(args);return response(args.p_offset>=100?[]:[CARD],50);};
  await render('/admin/memory-cards?page=99');assert.match(document.querySelector('output').textContent,/page=3/);
  await fill(label('Trạng thái'),'paused');assert.equal(calls.at(-1).p_offset,0);assert.equal(calls.at(-1).p_view,'paused');
});
test('delete confirmation holds its row/version, remains open and prevents duplicate submissions',async()=>{
  let finish;let count=0;let payload;globalThis.__cardRpc=(name,args)=>name==='admin_list_memory_cards'?response():new Promise((resolve)=>{count++;payload=args;finish=()=>resolve({data:CARD,error:null});});
  await render();await click(document.querySelector('button[aria-label="Xóa Ảnh A"]'));await click(buttons('Chuyển vào thùng rác')[0]);
  assert.ok(document.querySelector('[role="dialog"]'));await click(buttons('Đang xử lý...')[0]);assert.equal(count,1);
  await act(async()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  assert.ok(document.querySelector('[role="dialog"]'));assert.equal(payload.p_version,1);assert.equal(payload.p_action,'delete');
  await act(async()=>finish());assert.equal(document.querySelector('[role="dialog"]'),null);
});
test('editor saves name, category and enabled state against the captured version',async()=>{
  let payload;globalThis.__cardRpc=(name,args)=>{if(name==='admin_list_memory_cards')return response();payload=args;return {data:CARD,error:null};};
  await render();await click(document.querySelector('button[aria-label="Sửa Ảnh A"]'));await fill(label('Tên ảnh'),'Tên mới');await fill(document.querySelector('[role="dialog"] input[list]'),'Nhóm mới');
  await act(async()=>document.querySelector('input[type="checkbox"]').click());await click(buttons('Lưu thay đổi')[0]);
  assert.equal(payload.p_document.name,'Tên mới');assert.equal(payload.p_document.category,'Nhóm mới');assert.equal(payload.p_document.is_active,false);assert.equal(payload.p_version,1);
});
test('legacy fallback shows every raw row and disables unsupported management',async()=>{
  globalThis.__cardRpc=missing;globalThis.__cardTable=()=>({data:[CARD,{...CARD,id:2}],count:2,error:null});
  await render();assert.equal(document.querySelectorAll('.imageCard').length,2);assert.ok(label('Trạng thái').disabled);assert.equal(document.querySelector('button[aria-label="Xóa Ảnh A"]'),null);
});
test('invalid queued files never upload and the upload control is a real button',async()=>{
  let uploads=0;globalThis.__cardStorage=()=>{uploads++;return {data:[],error:null};};
  await render();assert.ok(buttons('Chọn ảnh')[0]);
  const input=document.querySelector('input[type="file"]');Object.defineProperty(input,'files',{value:[new dom.window.File(['bad'],'bad.svg',{type:'image/svg+xml'})],configurable:true});
  await act(async()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})));
  assert.match(document.body.textContent,/File không hợp lệ/);assert.equal(uploads,0);assert.equal(buttons('Tải 0 ảnh')[0].disabled,true);
});
test('zero-row legacy deletion never removes storage',async()=>{
  let removed=false;globalThis.__cardTable=()=>({data:[],error:null});globalThis.__cardStorage=()=>{removed=true;return {error:null};};
  const result=await service.deleteMemoryCard({id:1,image:'https://project.test/storage/v1/object/public/user-images/memory-cards/a.webp'});
  assert.ok(result.error);assert.equal(removed,false);
});
test('game catalog uses metadata RPC and legacy fallback picks newest images',async()=>{
  globalThis.__cardRpc=()=>({data:[CARD],error:null});assert.equal((await service.fetchPublicMemoryCards()).data[0].name,'Ảnh A');
  let query;globalThis.__cardRpc=missing;globalThis.__cardTable=(args)=>{query=args;return {data:[CARD],error:null};};
  await service.fetchPublicMemoryCards();assert.equal(query.limit,64);assert.equal(query.orders[0][1].ascending,false);
});

test('upload queue handles mixed results, retries only failures and sends optimized images',async()=>{
  const originalDecode=globalThis.createImageBitmap;
  const originalContext=dom.window.HTMLCanvasElement.prototype.getContext;
  const originalBlob=dom.window.HTMLCanvasElement.prototype.toBlob;
  globalThis.createImageBitmap=async()=>({width:2000,height:1000,close(){}});
  dom.window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){}});
  dom.window.HTMLCanvasElement.prototype.toBlob=function(callback){callback(new Blob(['optimized'],{type:'image/webp'}));};
  try {
    let requests=0;const sent=[];
    globalThis.__cardStorage=(args)=>{sent.push(args);requests++;return {error:requests===1?{message:'failed upload'}:null};};
    await render();const input=document.querySelector('input[type="file"]');
    Object.defineProperty(input,'files',{value:[new File(['one'],'one.png',{type:'image/png'}),new File(['two'],'two.jpg',{type:'image/jpeg'})],configurable:true});
    await act(async()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})));
    await click(buttons('Tải 2 ảnh')[0]);
    assert.match(document.body.textContent,/1\/2 ảnh đã lưu/);assert.equal(requests,2);
    assert.ok(sent.every((call)=>call.file.type==='image/webp' && call.bucket==='memory-card-images'));
    await click(buttons('Thử lại')[0]);assert.match(document.body.textContent,/2\/2 ảnh đã lưu/);assert.equal(requests,3);
  } finally {
    globalThis.createImageBitmap=originalDecode;dom.window.HTMLCanvasElement.prototype.getContext=originalContext;dom.window.HTMLCanvasElement.prototype.toBlob=originalBlob;
  }
});
