const express = require('express');
const { getJob } = require('../services/jobStore');

const router = express.Router();

router.get('/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.status === 'completed') {
    return res.json({
      status: 'completed',
      ...job.result,
    });
  }

  if (job.status === 'failed') {
    const statusCode = job.error?.status_code || 502;
    return res.status(statusCode).json({
      status: 'failed',
      error: job.error?.message || 'Processing failed',
      details: job.error?.details || null,
      raw_output: job.error?.raw_output || null,
      request_id: job.requestId,
    });
  }

  return res.json({
    status: job.status,
    request_id: job.requestId,
  });
});

module.exports = router;

