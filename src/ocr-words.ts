export interface OcrWord { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
export interface OcrReading { words: OcrWord[]; coverage: number }

export function wordConfidence(words: OcrWord[]): number {
  const length = words.reduce((total, word) => total + Math.max(1, [...word.text].length), 0);
  return length ? words.reduce((total, word) => total + word.confidence * Math.max(1, [...word.text].length), 0) / length : 0;
}

/** A difficult proper noun must not discard all the other words in an address. */
export function combineReadings(readings: OcrReading[]): { words: OcrWord[]; confidence: number; coverage: number } | undefined {
  const ranked = readings.filter((reading) => reading.words.length).toSorted((a, b) =>
    b.coverage - a.coverage || wordConfidence(b.words) - wordConfidence(a.words));
  const base = ranked[0];
  if (!base) return undefined;
  const words = base.words.map((word) => {
    let best = word;
    for (const reading of ranked) for (const alternative of reading.words) {
      const overlap = Math.max(0, Math.min(word.bbox.x1, alternative.bbox.x1) - Math.max(word.bbox.x0, alternative.bbox.x0));
      const union = Math.max(word.bbox.x1, alternative.bbox.x1) - Math.min(word.bbox.x0, alternative.bbox.x0);
      // Match the same physical word, not a larger token spanning two words or a comma.
      if (union > 0 && overlap / union >= 0.7 && alternative.confidence > best.confidence) best = alternative;
    }
    return best;
  });
  return { words, confidence: Math.round(wordConfidence(words)), coverage: base.coverage };
}
