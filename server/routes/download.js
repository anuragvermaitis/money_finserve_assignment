const express = require('express');
const { getSummary } = require('../services/summaryStore');
const { generateSummaryPdf } = require('../utils/pdfGenerator');

const router = express.Router();

router.get('/:id', async (req, res) => {
  const record = getSummary(req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'Summary not found or expired' });
  }

  try {
    const pdfBuffer = await generateSummaryPdf(record);
    const safeCompany = (record.summary.company || 'company').replace(/[^a-z0-9]+/gi, '_');
    const safeQuarter = (record.summary.quarter || 'quarter').replace(/[^a-z0-9]+/gi, '_');
    const fileName = `Concall_Summary_${safeCompany}_${safeQuarter}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to generate PDF',
      details: error.message,
    });
  }
});

module.exports = router;

