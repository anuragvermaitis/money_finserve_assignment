require('dotenv').config();

const path = require('path');
const express = require('express');
const uploadRoute = require('./routes/upload');
const downloadRoute = require('./routes/download');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/upload', uploadRoute);
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
});
