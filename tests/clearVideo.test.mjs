import test from 'node:test';
import assert from 'node:assert/strict';
import { createVideoReport, deleteLocalVideos, scanLocalVideos, verifyCurrentVideo } from '../src/utils/clearVideo.js';
import { TOOL_CATALOG, filterTools } from '../src/pages/Tools/toolCatalog.js';
import { directoryHandle, fileHandle, validMetadata } from './fixtures/clearVideoFs.mjs';

const options = (extra = {}) => ({ signal: new AbortController().signal, probe: validMetadata, ...extra });

test('scan verifies metadata, retains non-video files and defaults to the selected directory only', async () => {
  const root = directoryHandle('root', [fileHandle('video.MP4'), fileHandle('photo.jpg'), fileHandle('fake.mp4', { valid: false }), directoryHandle('nested', [fileHandle('child.webm')])]);
  const { scan, videos } = await scanLocalVideos(root, options());
  assert.equal(scan.complete, true);
  assert.deepEqual(videos.map((video) => video.path), ['video.MP4']);
  assert.equal(scan.otherFiles, 1);
  assert.equal(scan.issues.length, 1);
  assert.equal(scan.directoriesSeen, 1);
  assert.deepEqual(root.removed, []);
  const recursive = await scanLocalVideos(root, options({ recursive: true }));
  assert.deepEqual(recursive.videos.map((video) => video.path), ['nested/child.webm', 'video.MP4']);
  assert.equal(recursive.scan.directoriesSeen, 2);
});

test('incomplete access and cancelled scans cannot be used to delete', async () => {
  const denied = directoryHandle('locked');
  denied.entries = async function* () { throw new DOMException('Denied', 'NotAllowedError'); };
  const root = directoryHandle('root', [fileHandle('video.mp4'), denied]);
  const result = await scanLocalVideos(root, options({ recursive: true }));
  assert.equal(result.scan.complete, false);
  await assert.rejects(deleteLocalVideos(root, result.scan, result.videos, options()), /quét đầy đủ/);
  const controller = new AbortController();
  const cancelled = await scanLocalVideos(root, options({ signal: controller.signal, probe: async (file) => { controller.abort(); return validMetadata(file); } }));
  assert.equal(cancelled.scan.cancelled, true);
  assert.equal(cancelled.scan.complete, false);
  assert.deepEqual(cancelled.videos, []);
  assert.deepEqual(root.removed, []);
});

test('deletion removes only selected verified files, never directories or other files', async () => {
  const child = directoryHandle('nested', [fileHandle('child.mp4')]);
  const root = directoryHandle('root', [fileHandle('a.mp4'), fileHandle('b.mp4'), fileHandle('document.pdf'), child]);
  const result = await scanLocalVideos(root, options({ recursive: true }));
  const plan = result.videos.filter((video) => video.name === 'a.mp4' || video.name === 'child.mp4');
  const report = await deleteLocalVideos(root, result.scan, plan, options());
  assert.equal(report.deleted, 2);
  assert.deepEqual(root.removed, ['a.mp4']);
  assert.deepEqual(child.removed, ['child.mp4']);
  assert(root.children.has('b.mp4'));
  assert(root.children.has('document.pdf'));
  assert(root.children.has('nested'));
});

test('changed, moved, replaced and invalidated video files are retained', async () => {
  for (const change of ['modified', 'moved', 'replaced', 'invalid', 'scope']) {
    const original = fileHandle('video.mp4');
    const root = directoryHandle('root', [original]);
    const result = await scanLocalVideos(root, options());
    if (change === 'modified') original.data.lastModified++;
    if (change === 'moved') root.children.delete('video.mp4');
    if (change === 'replaced') { root.getFileHandle = async () => fileHandle('video.mp4'); }
    if (change === 'invalid') original.data.valid = false;
    if (change === 'scope') root.resolve = async () => ['nested', 'video.mp4'];
    const deletion = await deleteLocalVideos(root, result.scan, result.videos, options());
    assert.equal(deletion.skipped, 1, change);
    assert.equal(deletion.deleted, 0, change);
    assert.deepEqual(root.removed, [], change);
  }
});

test('last verification catches a file changed while reading metadata', async () => {
  const file = fileHandle('video.mp4');
  const root = directoryHandle('root', [file]);
  const result = await scanLocalVideos(root, options());
  const check = await verifyCurrentVideo(root, result.scan, result.videos[0], options({ probe: async (data) => { file.data.size++; return validMetadata(data); } }));
  assert.equal(check.ok, false);
  assert.deepEqual(root.removed, []);
});

test('stop during verification prevents the current and remaining deletions', async () => {
  const root = directoryHandle('root', [fileHandle('a.mp4'), fileHandle('b.mp4')]);
  const result = await scanLocalVideos(root, options());
  const controller = new AbortController();
  const deletion = await deleteLocalVideos(root, result.scan, result.videos, options({ signal: controller.signal, probe: async (file) => { controller.abort(); return validMetadata(file); } }));
  assert.equal(deletion.cancelled, 2);
  assert.equal(deletion.deleted, 0);
  assert.deepEqual(root.removed, []);
});

test('revoked write access stops subsequent file deletion attempts', async () => {
  const root = directoryHandle('root', [fileHandle('a.mp4'), fileHandle('b.mp4')]);
  const result = await scanLocalVideos(root, options());
  let attempts = 0;
  root.removeEntry = async () => { attempts++; throw new DOMException('Denied', 'NotAllowedError'); };
  const deletion = await deleteLocalVideos(root, result.scan, result.videos, options());
  assert.equal(attempts, 1);
  assert.equal(deletion.failed, 1);
  assert.equal(deletion.cancelled, 1);
});

test('JSON report includes plain metadata and results without file handles', async () => {
  const root = directoryHandle('root', [fileHandle('a.mp4')]);
  const result = await scanLocalVideos(root, options());
  const report = createVideoReport(root, result.scan, result.videos);
  report.deletion = await deleteLocalVideos(root, result.scan, result.videos, options());
  const json = JSON.parse(JSON.stringify(report));
  assert.equal(json.folder, 'root');
  assert.equal(json.deletion.deleted, 1);
  assert.deepEqual(Object.keys(json.videos[0]), ['path', 'size', 'lastModified', 'width', 'height']);
});

test('tool directory supports accented and unaccented search and category filters', () => {
  assert.equal(filterTools(TOOL_CATALOG, 'clear VIDEO', 'all').length, 1);
  assert.equal(filterTools(TOOL_CATALOG, 'ĐỌN', 'Video').length, 1);
  assert.deepEqual(filterTools(TOOL_CATALOG, 'dong dau', 'Ảnh').map((tool) => tool.id), ['watermark']);
  assert.equal(filterTools(TOOL_CATALOG, 'thu muc', 'Video').length, 1);
  assert.equal(filterTools(TOOL_CATALOG, 'unknown', 'all').length, 0);
  assert.deepEqual(filterTools(TOOL_CATALOG, 'chuyen doi', 'PDF').map((tool) => tool.id), ['chuyen-doi-file']);
  assert.equal(filterTools(TOOL_CATALOG, '', 'Âm thanh').length, 0);
});
