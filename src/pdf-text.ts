export interface PositionedText { str: string; transform: number[]; width: number; height: number }
export interface FieldLine { key: string; items: PositionedText[]; value: string; start: boolean; combined: boolean }
export const damagedText = /[\x00-\x08\x0b-\x1f\x7f\ufffd\ue000-\uf8ff]/u;
export const cleanPdfText = (text: string) => text.replace(/[\x00-\x08\x0b-\x1f\x7f\ue000-\uf8ff]/gu, '�').trim().normalize('NFC');
const vowelSigns = '[\u09BE-\u09C4\u09C7\u09C8\u09CB\u09CC\u09D7]';
/** Detect obvious visual-order damage without trying to guess the intended spelling. */
export function brokenBanglaOrder(text: string): boolean {
  const normalized = text.normalize('NFC');
  return new RegExp(`${vowelSigns}{2}`, 'u').test(normalized) || /(^|[\s,;:()\-])[\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7]/u.test(normalized);
}

/** Real gaps separate words; dependent marks and viramas stay with their base. */
export function joinPdfText(items: PositionedText[]): string {
  let value = '';
  let previous: PositionedText | undefined;
  for (const item of items) {
    if (previous && !/\s$/.test(value) && !/^\s/.test(item.str) &&
        !/^[\u09BC\u09BE-\u09C4\u09C7\u09C8\u09CB-\u09CD\u09D7\u09E2\u09E3]/u.test(item.str) && !/\u09CD$/u.test(value) &&
        item.transform[4]! - previous.transform[4]! - previous.width > Math.max(0.55, Math.min(item.height, previous.height) * 0.14)) value += ' ';
    value += item.str;
    previous = item;
  }
  return value.trim();
}

const anchorPattern = /^(SF\s*[-–]?\s*ID|NAME|PHONE|ADDRESS|AREA|NOTE|INVOICE|DELIVERY|WEIGHT|CASH\s+ON\s+DELIVERY)\s*:?\s*$/i;
const combinedPattern = /^(SF\s*[-–]?\s*ID|NAME|PHONE|ADDRESS|AREA|NOTE|INVOICE|DELIVERY|WEIGHT|CASH\s+ON\s+DELIVERY)\s*:\s*(.+)$/i;
export function fieldLines(items: PositionedText[]): FieldLine[] {
  const rows: { y: number; items: PositionedText[] }[] = [];
  for (const item of items.filter((item) => item.str.trim()).sort((a, b) => b.transform[5]! - a.transform[5]!)) {
    const y = item.transform[5]!;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 1.8);
    if (!row) { row = { y, items: [] }; rows.push(row); }
    row.items.push(item);
  }
  const bodyX = Math.min(...items.filter((item) => /^(NAME|PHONE|ADDRESS)\s*:?\s*$/i.test(item.str.trim())).map((item) => item.transform[4]!));
  const lines: FieldLine[] = [];
  let active = '';
  for (const row of rows) {
    row.items.sort((a, b) => a.transform[4]! - b.transform[4]!);
    const first = row.items[0]!;
    const anchor = first.str.trim().match(anchorPattern);
    const combined = anchor ? null : first.str.trim().match(combinedPattern);
    const key = anchor || combined ? (anchor ?? combined)![1]!.replace(/[\s:–-]/g, '').toUpperCase() : '';
    const inLabelColumn = !['NAME', 'PHONE', 'ADDRESS', 'AREA', 'NOTE'].includes(key) || first.transform[4]! <= bodyX + 2;
    if ((anchor || combined) && inLabelColumn) {
      active = key;
      const valueItems = row.items.slice(1);
      const value = combined ? [combined[2]!, joinPdfText(valueItems)].filter(Boolean).join(' ') : joinPdfText(valueItems);
      lines.push({ key, items: valueItems, value, start: true, combined: !!combined });
    } else if (active && !/^(Printed\s*:|steadfast\.|https?:\/\/)/i.test(first.str.trim())) {
      if (['ADDRESS', 'NAME', 'AREA', 'NOTE'].includes(active)) lines.push({ key: active, items: row.items, value: joinPdfText(row.items), start: false, combined: false });
    } else active = '';
  }
  return lines;
}
