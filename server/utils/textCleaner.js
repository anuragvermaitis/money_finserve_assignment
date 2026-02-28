const DEFAULT_MAX_CHARS = 20000;

function isPageNumberLine(line) {
  return /^(page\s*)?\d{1,4}(\s*\/\s*\d{1,4})?$/i.test(line.trim());
}

function findRepeatedShortLines(lines) {
  const counts = new Map();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length > 90) continue;
    const key = trimmed.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const repeated = new Set();
  for (const [line, count] of counts.entries()) {
    if (count >= 3) repeated.add(line);
  }
  return repeated;
}

function truncateSafely(text, maxChars) {
  if (text.length <= maxChars) {
    return { value: text, truncated: false };
  }

  const hardCut = text.slice(0, maxChars);
  const searchWindow = hardCut.slice(Math.max(0, hardCut.length - 600));
  const lastBoundary = Math.max(
    searchWindow.lastIndexOf('. '),
    searchWindow.lastIndexOf('! '),
    searchWindow.lastIndexOf('? '),
    searchWindow.lastIndexOf('\n')
  );

  if (lastBoundary > 0) {
    const cutIndex = hardCut.length - searchWindow.length + lastBoundary + 1;
    return { value: hardCut.slice(0, cutIndex).trim(), truncated: true };
  }

  return { value: hardCut.trim(), truncated: true };
}

function cleanTranscript(rawText, maxChars = DEFAULT_MAX_CHARS) {
  const lines = (rawText || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\t+/g, ' ').trim());

  const repeatedShortLines = findRepeatedShortLines(lines);

  const filteredLines = lines.filter((line) => {
    if (!line) return false;
    if (isPageNumberLine(line)) return false;
    if (repeatedShortLines.has(line.toLowerCase())) return false;
    return true;
  });

  const collapsed = filteredLines.join(' ').replace(/\s+/g, ' ').trim();
  const { value, truncated } = truncateSafely(collapsed, maxChars);

  return {
    cleanedText: value,
    truncated,
    originalChars: (rawText || '').length,
    cleanedChars: value.length,
    maxChars,
  };
}

module.exports = {
  cleanTranscript,
};
