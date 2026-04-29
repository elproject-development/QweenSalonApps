/**
 * ESC/POS Receipt Builder for Thermal Printer 58mm
 * Builds raw ESC/POS command string for Bluetooth printing
 */

export interface EscPosReceiptData {
  companyName: string;
  tagline?: string;
  phone?: string;
  receiptNumber: string;
  date: string;
  customer: string;
  items: { name: string; qty: number; price: number; subtotal: number }[];
  subtotal: number;
  discount?: number;
  tax?: number;
  total: number;
  paymentMethod: string;
  footer1?: string;
  footer2?: string;
}

// Paper width for 58mm thermal printer (32 chars)
const PAPER_WIDTH = 32;

/**
 * Format number to Indonesian Rupiah
 */
function formatRupiah(amount: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID").format(amount);
}

/**
 * Format price without Rp prefix (e.g., "35.000")
 */
function formatPrice(amount: number): string {
  return new Intl.NumberFormat("id-ID").format(amount);
}

/**
 * Format date to "dd MMM yyyy,  HH:mm" format (e.g., "11 Apr 2026,  10:12")
 */
function formatDate(dateStr: string): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const date = new Date(dateStr);
  const day = date.getDate().toString().padStart(2, "0");
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${day} ${month} ${year},   ${hours}:${minutes}`;
}

/**
 * Truncate string to max length
 */
function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}

/**
 * Wrap text to fit within paper width
 */
function wrapText(s: string, maxLen: number): string[] {
  if (s.length <= maxLen) return [s];
  const lines: string[] = [];
  let current = "";
  const words = s.split(" ");

  for (const word of words) {
    if (current.length + word.length + 1 <= maxLen) {
      current += (current ? " " : "") + word;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  return lines;
}

/**
 * Create separator line
 */
function line(): string {
  return "=".repeat(PAPER_WIDTH);
}

/**
 * Create dashed line
 */
function dashedLine(): string {
  return "-".repeat(PAPER_WIDTH);
}

/**
 * Center text (uppercase)
 */
function center(text: string): string {
  const clean = text.trim().toUpperCase();
  if (clean.length >= PAPER_WIDTH) return clean.slice(0, PAPER_WIDTH);

  const space = PAPER_WIDTH - clean.length;
  const left = Math.floor(space / 2);
  const right = space - left;

  return " ".repeat(left) + clean + " ".repeat(right);
}

/**
 * Center text (preserve case)
 */
function centerNoCase(text: string): string {
  const clean = text.trim();
  if (clean.length >= PAPER_WIDTH) return clean.slice(0, PAPER_WIDTH);

  const space = PAPER_WIDTH - clean.length;
  const left = Math.floor(space / 2);
  const right = space - left;

  return " ".repeat(left) + clean + " ".repeat(right);
}

/**
 * Center text for Font B (smaller font, ~42 chars width)
 */
function centerFooter(text: string): string {
  const fontBWidth = 42;
  const clean = text.trim();
  if (clean.length >= fontBWidth) return clean.slice(0, fontBWidth);

  const space = fontBWidth - clean.length;
  const left = Math.floor(space / 2);
  const right = space - left;

  return " ".repeat(left) + clean + " ".repeat(right);
}

/**
 * Center text for Double Size font (~16 chars width)
 */
function centerDoubleSize(text: string): string {
  const doubleWidth = 16;
  const clean = text.trim();
  if (clean.length >= doubleWidth) return clean.slice(0, doubleWidth);

  const space = doubleWidth - clean.length;
  const left = Math.floor(space / 2);
  const right = space - left;

  return " ".repeat(left) + clean + " ".repeat(right);
}

/**
 * Pad string to the right
 */
function padRight(s: string, len: number): string {
  if (s.length >= len) return s.slice(0, len);
  return s + " ".repeat(len - s.length);
}

/**
 * Create right-aligned label: value pair
 */
function row(label: string, value: string): string {
  const space = PAPER_WIDTH - label.length - value.length;
  const spaceStr = space > 0 ? " ".repeat(space) : " ";
  return label + spaceStr + value;
}

/**
 * Remove ESC/POS escape sequences for preview
 */
export function removeEscapeSequences(escpos: string): string {
  let cleaned = escpos
    .replace(/\x1B[@A-Z\[\]^_\\]/g, "") // ESC commands
    .replace(/\x1D[@A-Z\[\]^_\\]/g, "") // GS commands
    .replace(/\x1B\x33[\x00-\xFF]/g, "") // Line spacing (ESC 3 n)
    .replace(/\x1D\x21[\x00-\xFF]/g, "") // Font size (GS ! n)
    .replace(/\x1D\x56[\x00-\xFF]/g, "") // Cut (GS V n)
    .replace(/\x1B\x45[\x00-\x01]/g, "") // Bold on/off
    .replace(/\x1B\x61[\x00-\x02]/g, "") // Alignment
    .replace(/\x1D[\x00-\xFF]/g, "") // Remove remaining GS commands
    .replace(/\x1B[\x00-\xFF]/g, ""); // Remove remaining ESC commands

  // Remove non-printable characters except newline and carriage return
  cleaned = cleaned.replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F]/g, "");

  return cleaned;
}

/**
 * Build complete ESC/POS receipt string
 */
export function buildEscPosReceipt(data: EscPosReceiptData): string {
  // ESC/POS Commands
  const init = "\x1B\x40";           // Initialize printer
  const alignCenter = "\x1B\x61\x01"; // Center alignment
  const alignLeft = "\x1B\x61\x00";   // Left alignment
  const boldOn = "\x1B\x45\x01";      // Bold on
  const boldOff = "\x1B\x45\x00";     // Bold off
  const normalSize = "\x1D\x21\x00";  // Normal font size
  const doubleSize = "\x1D\x21\x11";  // Double width + height (2x larger)
  const fontA = "\x1B\x21\x00";       // Font A (normal)
  const fontB = "\x1B\x21\x01";       // Font B (smaller)
  const lineSpacing = "\x1B\x33\x22"; // Line spacing 34/360 inch (balanced)
  const cut = "\x1D\x56\x00";         // Full cut

  let out = "";

  // Initialize
  out += init;
  out += lineSpacing;
  out += normalSize;

  // ================= HEADER =================
  out += alignCenter;
  out += "\n"; // Extra blank line at top
  out += boldOn + doubleSize + centerDoubleSize(data.companyName) + normalSize + boldOff + "\n";

  if (data.tagline) {
    const taglineLines = wrapText(data.tagline, PAPER_WIDTH);
    for (const l of taglineLines) {
      out += centerNoCase(l) + "\n";
    }
  }

  // ================= INFO =================
  out += alignLeft;
  out += line() + "\n";
  out += "No        : " + data.receiptNumber + "\n";
  out += "Tanggal   : " + formatDate(data.date) + "\n";
  out += "Pelanggan : " + data.customer + "\n";
  out += line() + "\n";

  // ================= ITEMS =================
  out += boldOn + "Rincian Layanan" + boldOff + "\n";
  out += dashedLine() + "\n";

  for (const item of data.items) {
    // Single line: qty x name = price (right aligned, without Rp)
    const leftStr = `${item.qty} x ${truncate(item.name, 18)}`;
    const rightStr = formatPrice(item.subtotal);
    out += row(leftStr, rightStr) + "\n";
  }

  out += dashedLine() + "\n";

  // ================= SUMMARY =================
  out += row("Total", formatPrice(data.subtotal)) + "\n";

  if (data.discount && data.discount > 0) {
    out += row("Diskon", "-" + formatPrice(data.discount)) + "\n";
  }

  if (data.tax && data.tax > 0) {
    out += row("PPN", formatPrice(data.tax)) + "\n";
  }

  out += dashedLine() + "\n";
  out += boldOn + row("GRAND TOTAL", formatPrice(data.total)) + boldOff + "\n";
  out += row("Pembayaran", data.paymentMethod.toUpperCase()) + "\n";
  out += line() + "\n";

  // ================= FOOTER =================
  out += alignCenter;
  out += fontB; // Switch to Font B (smaller, can fit ~42 chars)

  if (data.footer1) {
    out += centerFooter(data.footer1) + "\n";
  }

  if (data.footer2) {
    out += centerFooter(data.footer2) + "\n";
  }

  out += fontA; // Switch back to Font A (normal)

  out += "\n\n\n"; // Feed before cut
  out += cut;

  return out;
}

/**
 * Build test print ESC/POS string
 */
export function buildTestPrint(companyName: string = "QweenSalon"): string {
  const init = "\x1B\x40";
  const alignCenter = "\x1B\x61\x01";
  const boldOn = "\x1B\x45\x01";
  const boldOff = "\x1B\x45\x00";
  const doubleSize = "\x1D\x21\x11";
  const normalSize = "\x1D\x21\x00";
  const lineSpacing = "\x1B\x33\x22";
  const cut = "\x1D\x56\x00";

  let out = "";
  out += init;
  out += lineSpacing;
  out += alignCenter;
  out += "\n";
  out += boldOn + center("TEST PRINT") + boldOff + "\n";
  out += boldOn + doubleSize + centerDoubleSize(companyName) + normalSize + boldOff + "\n";
  out += "\n";
  out += centerNoCase("Printer OK!") + "\n";
  out += centerNoCase(new Date().toLocaleString("id-ID")) + "\n";
  out += "\n\n\n";
  out += cut;

  return out;
}
