import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorageReference, prepareMemoryUpload, validateMemoryImage } from './memoryCardAdmin.js';
test('image upload rejects unsupported, empty and oversized files',()=>{
  for(const file of [null,{type:'image/svg+xml',size:20},{type:'image/jpeg',size:0},{type:'image/png',size:11*1024*1024}])assert.ok(validateMemoryImage(file));
  assert.equal(validateMemoryImage({type:'image/webp',size:200}),'');
});
test('optimization preserves aspect ratio, limits dimensions and releases decoded image',async()=>{
  let closed=false;const canvas={getContext:()=>({drawImage(){}}),toBlob:(fn)=>fn(new Blob(['image'],{type:'image/webp'}))};
  const result=await prepareMemoryUpload({type:'image/jpeg',size:10000},{decode:async()=>({width:4000,height:2000,close(){closed=true;}}),createCanvas:()=>canvas});
  assert.equal(result.width,1024);assert.equal(result.height,512);assert.ok(closed);
  await assert.rejects(prepareMemoryUpload({type:'image/png',size:10},{decode:async()=>({width:20,height:20,close(){}})}),/64/);
  await assert.rejects(prepareMemoryUpload({type:'image/png',size:10},{decode:async()=>{throw new Error('decoder private info');}}),/Không đọc được ảnh/);
});
test('storage cleanup only accepts own project, exact bucket and memory-cards files',()=>{
  const config={url:'https://project.test',uploadBucket:'user-images'};
  const base='https://project.test/storage/v1/object/public/user-images/';
  assert.equal(memoryStorageReference(base+'memory-cards/a.webp',config),'memory-cards/a.webp');
  for(const url of [base+'avatars/a.webp',base+'memory-cards/a/b.webp',base+'memory-cards/a.webp?x=1',base+'memory-cards/%2e%2e%2fa.webp',base.replace('project.test','evil.test')+'memory-cards/a.webp'])assert.equal(memoryStorageReference(url,config),null);
});
