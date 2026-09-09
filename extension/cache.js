// Browser-session cache only. Never store collections, memberships or sessions.
export class LookupCache {
  constructor({storage, now = Date.now, ttl = 5 * 60 * 1000, limit = 100} = {}) {
    this.storage = storage; this.now = now; this.ttl = ttl; this.limit = limit;
    this.entries = new Map(); this.loaded = null; this.writes = Promise.resolve();
  }
  async load() {
    this.loaded ??= (async () => {
      try {
        const saved = await this.storage?.get('lookupCacheV1');
        for (const [key, entry] of (saved?.lookupCacheV1 || []).slice(-this.limit)) {
          if (typeof key === 'string' && entry?.expires > this.now() && entry.expires <= this.now() + this.ttl) this.entries.set(key, entry);
        }
      } catch { /* Storage failure is a cache miss, not a lookup failure. */ }
    })();
    await this.loaded;
  }
  async get(key) {
    await this.load();
    const entry = this.entries.get(key);
    if (!entry || entry.expires <= this.now()) { this.entries.delete(key); return null; }
    return structuredClone(entry.value);
  }
  async set(key, value) {
    await this.load(); this.entries.delete(key);
    this.entries.set(key, {value: structuredClone(value), expires: this.now() + this.ttl});
    while (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value);
    await this.persist();
  }
  async delete(key) { await this.load(); this.entries.delete(key); await this.persist(); }
  async clear() { await this.load(); this.entries.clear(); await this.persist(); }
  async persist() {
    const snapshot = [...this.entries];
    this.writes = this.writes.then(() => this.storage?.set({lookupCacheV1: snapshot})).catch(() => {});
    await this.writes;
  }
}

export async function lookupKey(metadata) {
  // Keys include the exact search inputs but never persist paper titles/queries.
  const bytes = new TextEncoder().encode(JSON.stringify(metadata));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}
