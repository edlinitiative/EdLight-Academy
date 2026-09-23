/**
 * A small in-memory Firestore, just enough of the Admin SDK surface that
 * api/tournois/* uses: doc/collection refs, where('==' | '<=')/orderBy/limit,
 * count(), batches, and transactions whose writes land together at commit.
 *
 * Not a general emulator — it exists so the tournament engine can be driven
 * end to end (create → join → tick → answer → reveal → finish) in jest
 * without credentials.
 */

type Data = Record<string, any>;

const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export class FakeDb {
  store = new Map<string, Data>();
  private autoId = 0;

  doc(path: string) {
    return new FakeDocRef(this, path);
  }

  collection(path: string) {
    return new FakeQuery(this, path, [], null, null);
  }

  batch() {
    const ops: Array<() => void> = [];
    return {
      set: (ref: FakeDocRef, data: Data, opts?: { merge?: boolean }) => { ops.push(() => ref.applySet(data, opts)); },
      update: (ref: FakeDocRef, data: Data) => { ops.push(() => ref.applyUpdate(data)); },
      delete: (ref: FakeDocRef) => { ops.push(() => this.store.delete(ref.path)); },
      commit: async () => { ops.forEach((op) => op()); },
    };
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const ops: Array<() => void> = [];
    let wrote = false;
    const tx = {
      get: async (target: FakeDocRef | FakeQuery) => {
        if (wrote) throw new Error('Firestore transactions require all reads before all writes');
        return target.get();
      },
      getAll: async (...refs: FakeDocRef[]) => Promise.all(refs.map((r) => r.get())),
      set: (ref: FakeDocRef, data: Data, opts?: { merge?: boolean }) => { wrote = true; ops.push(() => ref.applySet(data, opts)); },
      update: (ref: FakeDocRef, data: Data) => { wrote = true; ops.push(() => ref.applyUpdate(data)); },
      create: (ref: FakeDocRef, data: Data) => {
        wrote = true;
        ops.push(() => {
          if (this.store.has(ref.path)) throw new Error('ALREADY_EXISTS');
          ref.applySet(data);
        });
      },
      delete: (ref: FakeDocRef) => { wrote = true; ops.push(() => this.store.delete(ref.path)); },
    };
    const out = await fn(tx);
    ops.forEach((op) => op());
    return out;
  }

  nextId(): string {
    this.autoId += 1;
    return `auto${String(this.autoId).padStart(6, '0')}xyz`;
  }

  /** Direct children docs of a collection path. */
  childrenOf(colPath: string): Array<[string, Data]> {
    const depth = colPath.split('/').length + 1;
    return [...this.store.entries()].filter(([p]) => p.startsWith(`${colPath}/`) && p.split('/').length === depth);
  }
}

function snap(path: string, data: Data | undefined) {
  return {
    id: path.split('/').pop() as string,
    exists: data !== undefined,
    data: () => clone(data),
    ref: path,
  };
}

export class FakeDocRef {
  constructor(private db: FakeDb, public path: string) {}
  get id() { return this.path.split('/').pop() as string; }
  async get() { return snap(this.path, this.db.store.get(this.path)); }
  async set(data: Data, opts?: { merge?: boolean }) { this.applySet(data, opts); }
  async update(data: Data) { this.applyUpdate(data); }
  async create(data: Data) {
    if (this.db.store.has(this.path)) throw new Error('ALREADY_EXISTS');
    this.applySet(data);
  }
  async delete() { this.db.store.delete(this.path); }
  applySet(data: Data, opts?: { merge?: boolean }) {
    const prev = opts?.merge ? this.db.store.get(this.path) || {} : {};
    this.db.store.set(this.path, { ...clone(prev), ...clone(data) });
  }
  applyUpdate(data: Data) {
    const prev = this.db.store.get(this.path);
    if (!prev) throw new Error(`NOT_FOUND: ${this.path}`);
    this.db.store.set(this.path, { ...prev, ...clone(data) });
  }
}

type Filter = { field: string; op: '==' | '<='; value: any };

export class FakeQuery {
  constructor(
    private db: FakeDb,
    private path: string,
    private filters: Filter[],
    private order: { field: string; dir: 'asc' | 'desc' } | null,
    private max: number | null,
  ) {}
  doc(id?: string) { return new FakeDocRef(this.db, `${this.path}/${id || this.db.nextId()}`); }
  where(field: string, op: '==' | '<=', value: any) {
    return new FakeQuery(this.db, this.path, [...this.filters, { field, op, value }], this.order, this.max);
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(this.db, this.path, this.filters, { field, dir }, this.max);
  }
  limit(n: number) { return new FakeQuery(this.db, this.path, this.filters, this.order, n); }
  private rows() {
    let rows = this.db.childrenOf(this.path).filter(([, d]) => this.filters.every((f) => {
      const v = d[f.field];
      if (f.op === '==') return v === f.value;
      return typeof v === 'number' && v <= f.value;
    }));
    if (this.order) {
      const { field, dir } = this.order;
      rows = rows.sort((a, b) => (a[1][field] - b[1][field]) * (dir === 'asc' ? 1 : -1));
    }
    if (this.max != null) rows = rows.slice(0, this.max);
    return rows;
  }
  async get() {
    const docs = this.rows().map(([p, d]) => snap(p, d));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
  count() {
    return { get: async () => ({ data: () => ({ count: this.rows().length }) }) };
  }
}
