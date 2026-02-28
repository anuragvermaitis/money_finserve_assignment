const crypto = require('crypto');

const jobs = new Map();
const MAX_JOBS = 500;

function pruneJobs() {
  if (jobs.size <= MAX_JOBS) return;
  const sorted = Array.from(jobs.entries()).sort(
    (a, b) => (a[1]?.createdAt || 0) - (b[1]?.createdAt || 0)
  );
  const overflow = sorted.slice(0, jobs.size - MAX_JOBS);
  for (const [id] of overflow) {
    jobs.delete(id);
  }
}

function createJob(payload = {}) {
  const id = crypto.randomUUID();
  jobs.set(id, {
    id,
    status: 'queued',
    result: null,
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...payload,
  });
  pruneJobs();
  return id;
}

function updateJob(id, patch) {
  const current = jobs.get(id);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  jobs.set(id, next);
  return next;
}

function getJob(id) {
  return jobs.get(id) || null;
}

module.exports = {
  createJob,
  updateJob,
  getJob,
};

