const crypto = require('crypto');

const store = new Map();
const MAX_ITEMS = 200;

function enforceLimit() {
  if (store.size <= MAX_ITEMS) return;
  const entries = Array.from(store.entries()).sort(
    (a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0)
  );
  const toDelete = entries.slice(0, store.size - MAX_ITEMS);
  for (const [id] of toDelete) {
    store.delete(id);
  }
}

function saveSummary(payload) {
  const id = crypto.randomUUID();
  store.set(id, {
    ...payload,
    createdAt: Date.now(),
  });
  enforceLimit();
  return id;
}

function getSummary(id) {
  return store.get(id) || null;
}

module.exports = {
  saveSummary,
  getSummary,
};

