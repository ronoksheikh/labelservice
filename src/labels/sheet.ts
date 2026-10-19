// PDF points are physical units: 72 pt = 1 inch, 25.4 mm = 1 inch.
const mm = 72 / 25.4;
export const A4 = {
  width: 210 * mm,
  height: 297 * mm,
  labelSize: 216,
  gap: 5 * mm,
  columns: 2,
  rows: 3,
  capacity: 6,
};

export function sheetPosition(slot: number): { x: number; y: number } {
  const gridWidth = A4.columns * A4.labelSize + (A4.columns - 1) * A4.gap;
  const gridHeight = A4.rows * A4.labelSize + (A4.rows - 1) * A4.gap;
  return {
    x: (A4.width - gridWidth) / 2 + (slot % A4.columns) * (A4.labelSize + A4.gap),
    y: (A4.height - gridHeight) / 2 + Math.floor(slot / A4.columns) * (A4.labelSize + A4.gap),
  };
}

export function drawSheetGuides(doc: PDFKit.PDFDocument, sheetIndex: number, sheetCount: number, labelCount: number, cutMarks: boolean): void {
  doc.save();
  if (cutMarks) {
    const offset = mm;
    const length = 3 * mm;
    doc.lineWidth(0.35).strokeColor('#808080');
    for (let slot = 0; slot < labelCount; slot++) {
      const position = sheetPosition(slot);
      for (const dx of [0, A4.labelSize]) {
        for (const dy of [0, A4.labelSize]) {
          const x = position.x + dx;
          const y = position.y + dy;
          const directionX = dx === 0 ? -1 : 1;
          const directionY = dy === 0 ? -1 : 1;
          doc.moveTo(x + directionX * offset, y)
            .lineTo(x + directionX * (offset + length), y);
          doc.moveTo(x, y + directionY * offset)
            .lineTo(x, y + directionY * (offset + length));
        }
      }
    }
    doc.stroke();
  }
  const left = sheetPosition(0).x;
  const right = sheetPosition(1).x + A4.labelSize;
  const rulerY = A4.height - 35;
  // A physical one-inch reference for checking printer scaling with a ruler.
  doc.strokeColor('#666666').lineWidth(0.5)
    .moveTo(left, rulerY).lineTo(left + 72, rulerY)
    .moveTo(left, rulerY - 2.5).lineTo(left, rulerY + 2.5)
    .moveTo(left + 72, rulerY - 2.5).lineTo(left + 72, rulerY + 2.5).stroke();
  doc.font('regular').fontSize(6).fillColor('#666666')
    .text('1 IN / 25.4 MM', left, rulerY - 13, { lineBreak: false, baseline: 'top' });
  for (const [index, line] of [
    '3 × 3 IN (76.2 × 76.2 MM) · PRINT AT 100%',
    `SHEET ${sheetIndex + 1} OF ${sheetCount} · ${labelCount} LABEL${labelCount === 1 ? '' : 'S'}`,
  ].entries()) {
    const width = doc.font('regular').fontSize(6.5).widthOfString(line);
    doc.text(line, right - width, A4.height - 52 + index * 12, { lineBreak: false, baseline: 'top' });
  }
  doc.restore();
}
