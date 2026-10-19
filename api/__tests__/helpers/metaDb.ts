import { ClassDb } from './classDb';

/**
 * ClassDb plus the two Admin SDK features the share and ambassador code use:
 * server write metadata (`createTime`, with ClassDb's `updateTimes`) and
 * `select()` field projection, which really drops the unselected fields so a
 * test can prove they were never read.
 */
export class MetaDb extends ClassDb {
  createTimes = new Map<string, number>();
  constructor() {
    super();
    const baseDoc = this.doc;
    this.doc = (path: string): any => {
      const d = baseDoc(path);
      return {
        ...d,
        get: async () => {
          const snap = await d.get();
          return { ...snap, ref: this.doc(path), createTime: this.createTimes.has(path) ? { toMillis: () => this.createTimes.get(path)! } : undefined };
        },
        collection: (name: string) => this.collection(`${path}/${name}`),
      };
    };
    const baseCollection = this.collection;
    const wrap = (c: any, fields: string[] | null = null): any => ({
      ...c,
      where: (...args: any[]) => wrap(c.where(...args), fields),
      limit: (n: number) => wrap(c.limit(n), fields),
      select: (...picked: string[]) => wrap(c, picked),
      get: async () => {
        const out = await c.get();
        if (!fields) return out;
        const docs = out.docs.map((s: any) => {
          const data = s.data() || {};
          const kept = Object.fromEntries(Object.entries(data).filter(([k]) => fields.includes(k)));
          return { ...s, data: () => kept };
        });
        return { ...out, docs };
      },
    });
    this.collection = (path: string, filters: any[] = [], cap = Infinity): any => wrap(baseCollection(path, filters, cap));
  }
  /** Seed a document with server times (ms). */
  put(path: string, data: any, createdAt?: number, updatedAt?: number) {
    this.store.set(path, data);
    if (createdAt != null) this.createTimes.set(path, createdAt);
    if (updatedAt != null || createdAt != null) this.updateTimes.set(path, (updatedAt ?? createdAt)!);
  }
}
