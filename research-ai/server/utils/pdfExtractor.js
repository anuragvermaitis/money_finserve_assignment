const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const pdfParse = require('pdf-parse');

async function extractWithPdfParse(buffer) {
  try {
    const parsed = await pdfParse(buffer);
    return (parsed?.text || '').trim();
  } catch {
    return '';
  }
}

function runPdftotext(inputPath) {
  return new Promise((resolve) => {
    const child = spawn('pdftotext', ['-layout', '-enc', 'UTF-8', inputPath, '-']);
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', () => resolve(''));
    child.on('close', (code) => {
      if (code !== 0) return resolve('');
      if (stderr.toLowerCase().includes('error')) return resolve('');
      return resolve(stdout.trim());
    });
  });
}

async function extractWithPdftotext(buffer) {
  const tempFile = path.join(os.tmpdir(), `concall-${Date.now()}-${Math.random().toString(16).slice(2)}.pdf`);

  try {
    await fs.writeFile(tempFile, buffer);
    return await runPdftotext(tempFile);
  } catch {
    return '';
  } finally {
    await fs.unlink(tempFile).catch(() => {});
  }
}

async function extractPdfText(buffer) {
  const primary = await extractWithPdfParse(buffer);
  if (primary) {
    return { text: primary, method: 'pdf-parse' };
  }

  const fallback = await extractWithPdftotext(buffer);
  if (fallback) {
    return { text: fallback, method: 'pdftotext' };
  }

  return { text: '', method: 'none' };
}

module.exports = {
  extractPdfText,
};

