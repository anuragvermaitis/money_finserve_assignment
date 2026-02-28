const PDFDocument = require('pdfkit');

function addSection(doc, title, items) {
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(12).text(title);
  doc.moveDown(0.3);

  if (!Array.isArray(items) || items.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text('Not explicitly mentioned.');
    doc.fillColor('#111827');
    return;
  }

  for (const item of items) {
    doc.font('Helvetica').fontSize(10).fillColor('#111827').text(`- ${item}`, {
      lineGap: 3,
    });
  }
}

function generateSummaryPdf({ summary, meta }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Concall Summary - ${summary.quarter}`,
        Author: 'Concall Intelligence Engine',
      },
    });

    const buffers = [];
    doc.on('data', (chunk) => buffers.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#111827').text('Concall Summary');
    doc.moveDown(0.4);

    doc.font('Helvetica').fontSize(11).text(`Company: ${summary.company}`);
    doc.text(`Quarter: ${summary.quarter}`);

    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(10).fillColor('#374151').text(summary.sentiment_explanation);
    doc.fillColor('#111827');

    if (meta?.was_truncated) {
      doc.moveDown(0.8);
      doc
        .font('Helvetica-Oblique')
        .fontSize(9.5)
        .fillColor('#4b5563')
        .text(
          `Note: Summary generated from the first ${meta.cleaned_chars} characters of the transcript. Additional context may exist beyond this range.`
        );
      doc.fillColor('#111827');
    }

    addSection(doc, '1. Overall Sentiment', [
      `${summary.rule_based_sentiment || summary.financial_sentiment} (${summary.confidence_level} confidence)`,
      summary.sentiment_explanation,
    ]);
    addSection(doc, '2. Key Highlights', summary.key_highlights);
    addSection(doc, '3. Risks & Concerns', summary.risks_and_concerns);
    addSection(doc, '4. Management Commitments', summary.management_commitments);
    addSection(doc, '5. Guidance / Outlook', summary.guidance_outlook);
    addSection(doc, '6. Analyst Focus Areas', summary.analyst_focus_areas);

    doc.end();
  });
}

module.exports = {
  generateSummaryPdf,
};
