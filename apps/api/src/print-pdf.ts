import { StreamableFile } from "@nestjs/common";
import PDFDocument from "pdfkit";

export type PrintCell = string | number | null | undefined;
export type PrintTable = {
  headers: string[];
  rows: PrintCell[][];
  summary?: Array<[string, PrintCell]>;
  closingNote?: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-KE", {
  timeZone: "Africa/Nairobi",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const moneyFormatter = new Intl.NumberFormat("en-KE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export const printDate = (value: Date | null | undefined) =>
  value ? dateFormatter.format(value) : null;
export const printMoney = (
  value: number | null | undefined,
  currency = "KES",
) =>
  value == null
    ? null
    : `${currency} ${moneyFormatter.format(value / 100)}`;

export async function renderPrintPdf(
  document: PrintTable & {
    title: string;
    organization: string;
    context: string;
  },
) {
  const pdf = new PDFDocument({
    size: "A4",
    layout: document.headers.length > 5 ? "landscape" : "portrait",
    margin: 36,
    bufferPages: true,
    info: { Title: document.title, Author: document.organization },
  });
  const buffer = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.once("end", () => resolve(Buffer.concat(chunks)));
    pdf.once("error", reject);
  });
  const margin = 36;
  const width = pdf.page.width - margin * 2;
  const bottom = pdf.page.height - margin - 18;
  const columnWidth = width / document.headers.length;
  const text = (value: PrintCell) =>
    String(value ?? "-")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, 240) || "-";
  let y = margin;

  const header = (continued: boolean, showTable = true) => {
    pdf.rect(margin, margin, 32, 4).fill("#1374C4");
    pdf
      .fillColor("#33506A")
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(text(document.organization), margin, margin + 13, {
        width,
        height: 14,
        ellipsis: true,
      });
    pdf
      .fillColor("#162B41")
      .fontSize(23)
      .text(document.title, margin, margin + 32, {
        width,
        height: 29,
        ellipsis: true,
      });
    pdf
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#415A71")
      .text(document.context, margin, margin + 64, {
        width,
        height: 24,
        ellipsis: true,
      });
    y = margin + 91;
    if (!continued && document.summary?.length) {
      document.summary.forEach(([label, value]) => {
        pdf
          .font("Helvetica")
          .fontSize(9)
          .fillColor("#415A71")
          .text(label, margin + 8, y, { width: width * 0.48 });
        pdf
          .font("Helvetica-Bold")
          .fillColor("#162B41")
          .text(text(value), margin + width * 0.5, y, {
            width: width * 0.48,
            height: 12,
            ellipsis: true,
          });
        y += 15;
      });
      y += 8;
    }
    if (!showTable) return;
    pdf.rect(margin, y, width, 24).fill("#183F63");
    pdf.fillColor("white").font("Helvetica-Bold").fontSize(9);
    document.headers.forEach((label, index) =>
      pdf.text(label, margin + index * columnWidth + 6, y + 7, {
        width: columnWidth - 12,
        height: 12,
        ellipsis: true,
      }),
    );
    y += 24;
  };
  header(false);
  document.rows.forEach((row, rowIndex) => {
    pdf.font("Helvetica").fontSize(9);
    const cells = document.headers.map((_, index) => text(row[index]));
    const height = Math.min(
      72,
      Math.max(
        25,
        ...cells.map(
          (cell) => pdf.heightOfString(cell, { width: columnWidth - 12 }) + 12,
        ),
      ),
    );
    if (y + height > bottom) {
      pdf.addPage();
      header(true);
    }
    if (rowIndex % 2 === 0) pdf.rect(margin, y, width, height).fill("#F0F5FA");
    pdf.fillColor("#162B41").font("Helvetica").fontSize(9);
    cells.forEach((cell, index) =>
      pdf.text(cell, margin + index * columnWidth + 6, y + 6, {
        width: columnWidth - 12,
        height: height - 10,
        ellipsis: true,
      }),
    );
    y += height;
  });
  if (!document.rows.length)
    pdf
      .fillColor("#415A71")
      .font("Helvetica")
      .fontSize(10)
      .text("No records match these filters.", margin + 6, y + 14);

  if (document.closingNote) {
    if (y + 42 > bottom) {
      pdf.addPage();
      header(true, false);
    }
    pdf.rect(margin, y + 8, width, 32).fill("#F0F5FA");
    pdf.fillColor("#162B41").font("Helvetica-Bold").fontSize(9)
      .text(text(document.closingNote), margin + 8, y + 16, { width: width - 16, height: 21, ellipsis: true });
  }

  const pages = pdf.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    pdf.switchToPage(index);
    pdf
      .moveTo(margin, bottom + 5)
      .lineTo(margin + width, bottom + 5)
      .strokeColor("#CDDAE6")
      .stroke();
    const footer = `AllShops  |  Page ${index + 1} of ${pages.count}`;
    pdf.fillColor("#415A71").font("Helvetica").fontSize(8);
    pdf.text(footer, margin + width - pdf.widthOfString(footer), bottom + 8, {
      lineBreak: false,
    });
  }
  pdf.end();
  return buffer;
}

export async function printPdfFile(
  filename: string,
  data: Parameters<typeof renderPrintPdf>[0],
) {
  const body = await renderPrintPdf(data);
  return new StreamableFile(body, {
    type: "application/pdf",
    disposition: `attachment; filename="${filename.replace(/[^a-z0-9_-]/gi, "-")}.pdf"`,
  });
}
