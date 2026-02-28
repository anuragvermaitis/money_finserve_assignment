const express = require('express');
const multer = require('multer');
const { createJob, updateJob } = require('../services/jobStore');
const { processTranscriptFile } = require('../services/transcriptProcessor');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

function makeRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

router.post('/', upload.single('transcript'), async (req, res) => {
  const requestId = makeRequestId();
  if (!req.file) {
    return res.status(400).json({ error: 'No PDF uploaded. Use field name: transcript' });
  }

  const jobId = createJob({
    status: 'queued',
    requestId,
    fileName: req.file.originalname,
  });

  setImmediate(async () => {
    const startedAt = Date.now();
    updateJob(jobId, { status: 'processing' });

    try {
      const result = await processTranscriptFile(req.file, requestId);
      const durationMs = Date.now() - startedAt;
      updateJob(jobId, {
        status: 'completed',
        result,
      });
      console.info(`[summary_generated] request_id=${requestId} job_id=${jobId} duration_ms=${durationMs}`);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      updateJob(jobId, {
        status: 'failed',
        error: {
          message: error.message,
          details: error.details || null,
          raw_output: error.rawOutput || error.cleanedOutput || null,
          status_code: error.statusCode || null,
        },
      });
      console.error(`[summary_failed] request_id=${requestId} job_id=${jobId} duration_ms=${durationMs} error="${error.message}"`);
    }
  });

  return res.status(202).json({
    job_id: jobId,
    request_id: requestId,
    status: 'queued',
  });
});

module.exports = router;
