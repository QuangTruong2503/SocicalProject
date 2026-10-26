// In-memory File System Access handles for /watermark/auto tests. Names are
// case-insensitive like Windows/macOS by default. Fault injection:
//   root.fs.failWrite = (name) => error | null   (thrown by write/close)
//   root.fs.permission = 'granted' | 'prompt' | 'denied' (per handle: handle.permission)
//   root.fs.writes      → log of committed files
export const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1];
export const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
export const WEBP = [...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0)));

const domError = (name, message = name) => new DOMException(message, name);
let clock = 1_700_000_000_000;

class FakeFileHandle {
  kind = 'file';
  constructor(parent, name) {
    this.parent = parent;
    this.name = name;
  }
  get entry() {
    return this.parent.children.get(this.name);
  }
  async getFile() {
    const entry = this.entry;
    if (!entry || entry.handle !== this) throw domError('NotFoundError');
    this.parent.fs.reads.push(`${this.parent.path}/${this.name}`);
    return new File([entry.data], this.name, { lastModified: entry.lastModified, type: entry.type });
  }
  async createWritable() {
    const fs = this.parent.fs;
    const chunks = [];
    const handle = this;
    if (fs.failCreateWritable?.(this.name)) throw fs.failCreateWritable(this.name);
    return {
      async write(data) {
        const failure = fs.failWrite?.(handle.name);
        if (failure) throw failure;
        chunks.push(data);
      },
      async close() {
        const failure = fs.failClose?.(handle.name);
        if (failure) throw failure;
        const data = new Blob(chunks);
        const entry = handle.entry;
        entry.data = data;
        entry.lastModified = (clock += 1000);
        entry.committed = true;
        fs.writes.push({ path: `${handle.parent.path}/${handle.name}`, size: data.size, data });
      },
      async abort() { chunks.length = 0; },
    };
  }
  async isSameEntry(other) { return other === this; }
  async queryPermission() { return this.parent.permissionState(); }
}

export class FakeDirectoryHandle {
  kind = 'directory';
  constructor(name, { parent = null, fs = null } = {}) {
    this.name = name;
    this.parentDir = parent;
    this.fs = fs ?? parent?.fs ?? { writes: [], reads: [], permission: 'granted', requests: [] };
    this.children = new Map();
    this.permission = undefined;
  }
  get path() {
    return this.parentDir ? `${this.parentDir.path}/${this.name}` : this.name;
  }
  find(name) {
    const lower = name.toLowerCase();
    for (const [key, value] of this.children) if (key.toLowerCase() === lower) return [key, value];
    return null;
  }
  addFile(name, bytes, { type = 'image/jpeg', lastModified = (clock += 1000) } = {}) {
    const handle = new FakeFileHandle(this, name);
    this.children.set(name, { kind: 'file', handle, data: new Blob([new Uint8Array(bytes)]), type, lastModified, committed: true });
    return handle;
  }
  addDir(name) {
    const handle = new FakeDirectoryHandle(name, { parent: this });
    this.children.set(name, { kind: 'directory', handle });
    return handle;
  }
  file(name) {
    return this.find(name)?.[1];
  }
  async *values() {
    for (const entry of [...this.children.values()]) yield entry.handle;
  }
  async *keys() {
    for (const key of [...this.children.keys()]) yield key;
  }
  async getDirectoryHandle(name, { create = false } = {}) {
    if (this.fs.lost) throw domError('NotFoundError');
    const found = this.find(name);
    if (found) {
      if (found[1].kind !== 'directory') throw domError('TypeMismatchError');
      return found[1].handle;
    }
    if (!create) throw domError('NotFoundError');
    if (this.permissionState() !== 'granted') throw domError('NotAllowedError');
    return this.addDir(name);
  }
  async getFileHandle(name, { create = false } = {}) {
    if (/[\\/]/.test(name) || name === '..') throw new TypeError('Invalid name');
    const found = this.find(name);
    if (found) {
      if (found[1].kind !== 'file') throw domError('TypeMismatchError');
      return found[1].handle;
    }
    if (!create) throw domError('NotFoundError');
    if (this.permissionState() !== 'granted') throw domError('NotAllowedError');
    if (this.fs.diskFull) throw domError('QuotaExceededError');
    const handle = new FakeFileHandle(this, name);
    this.children.set(name, { kind: 'file', handle, data: new Blob([]), type: 'image/jpeg', lastModified: (clock += 1000), committed: false });
    return handle;
  }
  async removeEntry(name) {
    const found = this.find(name);
    if (!found) throw domError('NotFoundError');
    this.children.delete(found[0]);
    this.fs.removed = [...(this.fs.removed || []), `${this.path}/${found[0]}`];
  }
  permissionState() {
    return this.permission ?? this.parentDir?.permissionState() ?? this.fs.permission;
  }
  async queryPermission() { return this.permissionState(); }
  async requestPermission() {
    this.fs.requests.push(this.path);
    if (this.fs.grantOnRequest) this.permission = 'granted';
    return this.permissionState();
  }
  async isSameEntry(other) { return other === this; }
}


/**
 * makeTree('SanPham', { 'Máy khoan': { 'IMG_1.jpg': JPEG, Named: { 'x.jpg': JPEG } }, 'root.jpg': JPEG })
 */
export function makeTree(name, spec) {
  const root = new FakeDirectoryHandle(name);
  const fill = (dir, node) => {
    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) dir.addFile(key, value, { type: /\.png$/i.test(key) ? 'image/png' : /\.webp$/i.test(key) ? 'image/webp' : 'image/jpeg' });
      else fill(dir.addDir(key), value);
    }
  };
  fill(root, spec);
  return root;
}

export function imagesSpec(count, prefix = 'IMG_', bytes = JPEG) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [`${prefix}${index + 1}.jpg`, bytes]));
}
