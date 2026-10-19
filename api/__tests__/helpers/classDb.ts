/** Transactional Firestore test double: commits together and rejects reads after writes. */
export class ClassDb {
  store = new Map<string, any>();
  /** Server-set update times (ms) by path, like DocumentSnapshot.updateTime. */
  updateTimes = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  clone(value: any): any {
    if (value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => this.clone(v));
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, this.clone(v)]));
  }
  doc = (path: string): any => ({
    path, id: path.split('/').pop(),
    get: async () => ({ id: path.split('/').pop(), ref: this.doc(path), exists: this.store.has(path), data: () => this.clone(this.store.get(path)),
      updateTime: this.updateTimes.has(path) ? { toMillis: () => this.updateTimes.get(path)! } : undefined }),
    set: async (data: any) => { this.store.set(path, this.clone(data)); },
    delete: async () => { this.store.delete(path); },
    collection: (name: string) => this.collection(`${path}/${name}`),
  });
  collection = (path: string, filters: any[] = [], cap = Infinity): any => ({
    doc: (id: string) => this.doc(`${path}/${id}`),
    where: (key: string, op: string, val: any) => this.collection(path, [...filters, [key, op, val]], cap),
    limit: (limit: number) => this.collection(path, filters, limit),
    get: async () => {
      const entries = [...this.store.entries()].filter(([key, data]) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1
        && filters.every(([field, op, value]) => op === 'array-contains' ? data[field]?.includes(value) : data[field] === value)).slice(0, cap);
      const docs = await Promise.all(entries.map(([key]) => this.doc(key).get()));
      return { docs, size: docs.length, empty: !docs.length };
    },
  });
  getAll = (...refs: any[]) => Promise.all(refs.map((r) => r.get()));
  recursiveDelete = async (ref: any) => { for (const key of this.store.keys()) if (key === ref.path || key.startsWith(`${ref.path}/`)) this.store.delete(key); };
  runTransaction = <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    const run = this.tail.then(async () => {
      const writes: Array<() => void> = [];
      const tx = {
        get: async (ref: any) => { if (writes.length) throw new Error('read after write'); return ref.get(); },
        set: (ref: any, data: any) => { const copy = this.clone(data); writes.push(() => { this.store.set(ref.path, copy); }); },
        create: (ref: any, data: any) => { const copy = this.clone(data); writes.push(() => { if (this.store.has(ref.path)) throw new Error('already exists'); this.store.set(ref.path, copy); }); },
        delete: (ref: any) => { writes.push(() => { this.store.delete(ref.path); }); },
      };
      const out = await fn(tx); writes.forEach((write) => write()); return out;
    });
    this.tail = run.catch(() => undefined);
    return run;
  };
}
