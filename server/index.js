require('dotenv').config();

const path = require('path');
const express = require('express');
const uploadRoute = require('./routes/upload');
const downloadRoute = require('./routes/download');
const jobRoute = require('./routes/job');

const app = express();
const port = Number(process.env.PORT || 3000);
const selfPingEnabled = String(process.env.SELF_PING_ENABLED || 'false').toLowerCase() === 'true';
const selfPingIntervalMs = Number(process.env.SELF_PING_INTERVAL_MS || 480000);

function buildSelfPingUrl() {
  if (process.env.SELF_PING_URL) {
    return process.env.SELF_PING_URL;
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return `${process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '')}/health`;
  }

  return null;
}

function startSelfPing() {
  if (!selfPingEnabled) return;

  const targetUrl = buildSelfPingUrl();
  if (!targetUrl) {
    console.warn('[self_ping] enabled but SELF_PING_URL/RENDER_EXTERNAL_URL is missing');
    return;
  }

  const interval = Number.isFinite(selfPingIntervalMs) && selfPingIntervalMs > 0
    ? selfPingIntervalMs
    : 480000;

  const ping = async () => {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { 'User-Agent': 'concall-self-ping' },
      });
      console.info(`[self_ping] status=${response.status} url=${targetUrl}`);
    } catch (error) {
      console.error(`[self_ping] failed url=${targetUrl} error="${error.message}"`);
    }
  };

  const timer = setInterval(ping, interval);
  if (typeof timer.unref === 'function') timer.unref();

  console.info(`[self_ping] started interval_ms=${interval} url=${targetUrl}`);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/upload', uploadRoute);
app.use('/api/job', jobRoute);
app.use('/download-summary', downloadRoute);

app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'PDF too large. Max allowed size is 20MB.' });
  }

  return res.status(500).json({
    error: 'Unhandled server error',
    details: err?.message || 'Unknown error',
  });
});

app.listen(port, () => {
  console.log(`server running on http://localhost:${port}`);
  startSelfPing();
});
