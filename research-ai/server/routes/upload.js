const express = require('express');
const multer = require('multer');
const { cleanTranscript } = require('../utils/textCleaner');
const { extractPdfText } = require('../utils/pdfExtractor');
const { getConcallSummary } = require('../aiService');
const { normalizeSummary } = require('../summaryFormatter');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
  },
});

router.post('/', upload.single('transcript'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF uploaded. Use field name: transcript' });
    }

    const looksLikePdf =
      req.file.mimetype === 'application/pdf' ||
      req.file.originalname.toLowerCase().endsWith('.pdf');

    if (!looksLikePdf) {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const extraction = await extractPdfText(req.file.buffer);
    const extractedText = extraction.text || '';

    if (!extractedText.trim()) {
      return res.status(400).json({
        error:
          'Could not extract text from PDF. The file may be scanned/image-only. Please upload a text-based transcript PDF.',
      });
    }

    const cleaned = cleanTranscript(extractedText, 20000);
    const rawSummary = await getConcallSummary(cleaned.cleanedText);
    const summary = normalizeSummary(rawSummary);

    return res.json({
      summary,
      meta: {
        original_chars: cleaned.originalChars,
        cleaned_chars: cleaned.cleanedChars,
        max_chars: cleaned.maxChars,
        was_truncated: cleaned.truncated,
        extraction_method: extraction.method,
      },
    });
  } catch (error) {
    if (error.message?.includes('Invalid JSON')) {
      return res.status(502).json({
        error: 'Model returned invalid JSON',
        details: error.message,
      });
    }

    if (error.message?.includes('Poe API request failed')) {
      return res.status(502).json({
        error: 'Failed to fetch response from Poe API',
        details: error.message,
        provider_details: error.details || null,
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
});

module.exports = router;

