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

  /** Every collection named `id`, at any depth. */
  collectionGroup(id: string) {
    return new FakeQuery(this, id, [], null, null, true);
  }

  /** The doc and everything stored beneath it. */
  async recursiveDelete(ref: FakeDocRef) {
    for (const p of [...this.store.keys()])
      if (p === ref.path || p.startsWith(`${ref.path}/`)) this.store.delete(p);
  }

  async getAll(...refs: FakeDocRef[]) {
    return Promise.all(refs.map((r) => r.get()));
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

  /**
   * Opt-in: run transactions one at a time, the outcome Firestore's
   * optimistic concurrency guarantees (contending transactions retry until
   * they commit in some serial order). Race tests fire requests together.
   */
  serializeTransactions = false;
  private txQueue: Promise<unknown> = Promise.resolve();

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    if (!this.serializeTransactions) return this.runTransactionNow(fn);
    const run = this.txQueue.then(() => this.runTransactionNow(fn));
    this.txQueue = run.catch(() => undefined);
    return run;
  }

  private async runTransactionNow<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const ops: Array<() => void> = [];
    const creates: string[] = [];
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
        creates.push(ref.path);
        ops.push(() => {
          if (this.store.has(ref.path)) throw new Error('ALREADY_EXISTS');
          ref.applySet(data);
        });
      },
      delete: (ref: FakeDocRef) => { wrote = true; ops.push(() => this.store.delete(ref.path)); },
    };
    const out = await fn(tx);
    // A commit is all or nothing: a create that would collide aborts every write.
    if (creates.some((p) => this.store.has(p))) throw new Error('ALREADY_EXISTS');
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

function snap(path: string, data: Data | undefined, db: FakeDb) {
  return {
    id: path.split('/').pop() as string,
    exists: data !== undefined,
    data: () => clone(data),
    ref: db.doc(path),
  };
}

export class FakeDocRef {
  constructor(private db: FakeDb, public path: string) {}
  get id() { return this.path.split('/').pop() as string; }
  async get() { return snap(this.path, this.db.store.get(this.path), this.db); }
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

type Filter = { field: string; op: '==' | '<=' | 'in' | 'array-contains'; value: any };

export class FakeQuery {
  constructor(
    private db: FakeDb,
    private path: string,
    private filters: Filter[],
    private order: { field: string; dir: 'asc' | 'desc' } | null,
    private max: number | null,
    private group = false,
  ) {}
  doc(id?: string) { return new FakeDocRef(this.db, `${this.path}/${id || this.db.nextId()}`); }
  where(field: string, op: '==' | '<=' | 'in' | 'array-contains', value: any) {
    return new FakeQuery(this.db, this.path, [...this.filters, { field, op, value }], this.order, this.max, this.group);
  }
  orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
    return new FakeQuery(this.db, this.path, this.filters, { field, dir }, this.max, this.group);
  }
  limit(n: number) { return new FakeQuery(this.db, this.path, this.filters, this.order, n, this.group); }
  private rows() {
    const docs = this.group
      ? [...this.db.store.entries()].filter(([p]) => {
          const s = p.split('/');
          return s.length % 2 === 0 && s[s.length - 2] === this.path;
        })
      : this.db.childrenOf(this.path);
    let rows = docs.filter(([, d]) => this.filters.every((f) => {
      // Dotted paths reach into maps, as Firestore field paths do.
      const v = f.field.split('.').reduce<any>((o, k) => (o == null ? o : o[k]), d);
      if (f.op === '==') return v === f.value;
      if (f.op === 'in') return Array.isArray(f.value) && f.value.includes(v);
      if (f.op === 'array-contains') return Array.isArray(v) && v.includes(f.value);
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
    const docs = this.rows().map(([p, d]) => snap(p, d, this.db));
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
  count() {
    return { get: async () => ({ data: () => ({ count: this.rows().length }) }) };
  }
}
