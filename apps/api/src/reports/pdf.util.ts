import PDFDocument from 'pdfkit';

export interface PdfSection {
  heading: string;
  lines: string[];
}

/**
 * Build a simple, text-based PDF report (plan.md §13). Returns a Buffer suitable
 * for an HTTP response. Kept intentionally minimal — headings + line lists.
 */
export function buildPdf(
  title: string,
  subtitle: string,
  sections: PdfSection[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text(title, { underline: false });
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor('#666').text(subtitle);
    doc.moveDown(1);

    for (const section of sections) {
      doc.fillColor('#0f172a').fontSize(13).text(section.heading);
      doc.moveDown(0.3);
      doc.fillColor('#222').fontSize(10);
      for (const line of section.lines) {
        doc.text(line);
      }
      doc.moveDown(0.8);
    }

    doc.end();
  });
}
