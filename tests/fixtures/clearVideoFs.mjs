// In-memory file handles; tests never read or delete real user files.
export function fileHandle(name, { valid = true, size = 1024, lastModified = 1 } = {}) {
  const handle = {
    kind: 'file', name, data: { name, valid, size, lastModified },
    async getFile() { return { ...handle.data }; },
    async isSameEntry(other) { return other === handle; },
  };
  return handle;
}

export function directoryHandle(name, children = []) {
  const entries = new Map(children.map((child) => [child.name, child]));
  const directory = {
    kind: 'directory', name, children: entries, removed: [], permissions: [], permission: 'granted',
    async *entries() { yield* entries; },
    async requestPermission(options) { directory.permissions.push(options.mode); return directory.permission; },
    async getFileHandle(key, options) {
      if (options?.create) throw new Error('Tests must not create files.');
      if (!entries.has(key)) throw new DOMException('Missing', 'NotFoundError');
      return entries.get(key);
    },
    async resolve(target) {
      for (const [key, handle] of entries) {
        if (handle === target) return [key];
        if (handle.kind === 'directory') {
          const path = await handle.resolve(target);
          if (path) return [key, ...path];
        }
      }
      return null;
    },
    async removeEntry(key, options) {
      if (options?.recursive !== false || entries.get(key)?.kind !== 'file') throw new Error('Only file deletion is allowed.');
      directory.removed.push(key); entries.delete(key);
    },
  };
  return directory;
}

export const validMetadata = async (file) => ({ valid: file.valid, width: 640, height: 480, reason: 'Giữ lại: không có luồng video.' });
