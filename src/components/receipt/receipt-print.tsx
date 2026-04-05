import { useEffect, useRef } from "react";
import { formatRupiah, formatDate } from "@/lib/format";
import QRCode from "qrcode";

export interface ReceiptData {
  receiptNumber: string;
  createdAt: string;
  staffName?: string | null;
  customerName?: string | null;
  paymentMethod: string;
  items: { serviceName: string; quantity: number; price: number; subtotal: number }[];
  subtotal: number;
  discount?: number | null;
  tax?: number | null;
  total: number;
}

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Tunai",
  transfer: "Transfer Bank",
  qris: "QRIS",
  debit: "Kartu Debit",
  credit: "Kartu Kredit",
};

/**
 * Cetak struk menggunakan hidden iframe.
 *
 * Cara kerja:
 * 1. Buat iframe kecil tak terlihat, inject ke DOM
 * 2. Tulis HTML struk lengkap ke dalam iframe (doc sendiri, terpisah dari halaman utama)
 * 3. Panggil iframe.contentWindow.print() → Android/browser hanya mencetak konten iframe itu
 * 4. Hapus iframe setelah dialog print selesai
 *
 * Ini JAUH lebih andal daripada @media print pada halaman utama karena:
 * - Konten iframe 100% terisolasi — tidak ada CSS/HTML halaman utama yang ikut tercetak
 * - Tidak perlu window.open() (tidak ada popup blocker)
 * - @page size di dalam iframe berlaku hanya untuk iframe tersebut
 */
export async function printReceipt(data: ReceiptData): Promise<void> {
  // Gunakan window.open untuk isolasi total di Android Chrome
  // Ini mencegah Android mencetak halaman utama (riwayat transaksi)
  const printWindow = window.open("", "_blank", "width=800,height=800");
  
  if (!printWindow) {
    alert("Gagal membuka jendela cetak. Pastikan popup tidak diblokir.");
    return;
  }

  const html = await buildCompleteHTML(data);
  
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  // Tunggu sebentar agar Poppins font dan CSS ter-render
  printWindow.onload = () => {
    printWindow.focus();
    // Berikan sedikit jeda tambahan untuk Android
    setTimeout(() => {
      printWindow.print();
      // Jangan langsung close, biarkan user berinteraksi dengan dialog print
      // printWindow.close(); 
    }, 500);
  };
}

// ─────────────────────────────────────────────
// React component wrapper
// ─────────────────────────────────────────────
interface ReceiptPrintProps {
  data: ReceiptData | null;
  onDone?: () => void;
}

export function ReceiptPrint({ data, onDone }: ReceiptPrintProps) {
  const triggered = useRef(false);

  useEffect(() => {
    if (!data || triggered.current) return;
    triggered.current = true;

    void printReceipt(data);

    // Reset state setelah sedikit delay agar tidak trigger dua kali
    const t = setTimeout(() => {
      triggered.current = false;
      onDone?.();
    }, 600);

    return () => clearTimeout(t);
  }, [data, onDone]);

  return null;
}

// ─────────────────────────────────────────────
// HTML builder — menghasilkan dokumen HTML lengkap
// ─────────────────────────────────────────────
async function buildCompleteHTML(d: ReceiptData): Promise<string> {
  const payLabel = PAYMENT_LABEL[d.paymentMethod] ?? d.paymentMethod;

  const receiptSettings = (() => {
    const defaults = {
      companyName: "QweenSalon",
      tagline: "Tempatnya Perawatan Kecantikan",
      phone: "+62 812-3456-7890",
      footerLine1: "Terima Kasih Sampai jumpa kembali!",
      footerLine2: "www.qweensalon.web.id",
      qrEnabled: false,
      qrMode: "website" as "receipt" | "website" | "custom",
      qrCustom: "",
    };

    try {
      const raw = localStorage.getItem("qweensalon:receipt_settings");
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  })();

  const itemRows = d.items
    .map(
      (item) => `
      <div class="item">
        <div class="item-name">${escHtml(item.serviceName)}</div>
        <div class="row item-meta">
          <span>${item.quantity} x ${formatRupiah(item.price)}</span>
          <span>${formatRupiah(item.subtotal)}</span>
        </div>
      </div>`
    )
    .join("");

  const discountRow = d.discount
    ? `<div class="row"><span>Diskon</span><span>-${formatRupiah(d.discount)}</span></div>`
    : "";

  const taxRow = d.tax
    ? `<div class="row"><span>PPN</span><span>${formatRupiah(d.tax)}</span></div>`
    : "";

  const qrValue = (() => {
    // 1. Ambil setting terbaru dari localStorage secara paksa
    const storedSettings = (() => {
      try {
        const raw = localStorage.getItem("qweensalon:receipt_settings");
        if (raw) {
          const parsed = JSON.parse(raw);
          // Pastikan qrEnabled benar-benar boolean true
          return parsed;
        }
        return null;
      } catch {
        return null;
      }
    })();

    const activeSettings = storedSettings || receiptSettings;
    
    // DEBUG: sangat penting untuk melihat ini di console saat print
    console.log("QR LOGIC START");
    console.log("Active Settings Object:", JSON.stringify(activeSettings));
    
    if (!activeSettings || activeSettings.qrEnabled === false || activeSettings.qrEnabled === undefined) {
      console.log("QR ABORT: qrEnabled is not true");
      return "";
    }
    
    if (activeSettings.qrMode === "receipt") {
      console.log("QR ABORT: Mode is receipt (No Barcode per request)");
      return "";
    }
    
    let val = "";
    if (activeSettings.qrMode === "website") {
      val = String(activeSettings.footerLine2 || "").trim();
      console.log("QR MODE: website, Value:", val);
    } else if (activeSettings.qrMode === "custom") {
      val = String(activeSettings.qrCustom || "").trim();
      console.log("QR MODE: custom, Value:", val);
    } else {
      // fallback jika qrMode tidak terdefinisi tapi enabled
      val = String(activeSettings.footerLine2 || d.receiptNumber).trim();
      console.log("QR MODE: fallback, Value:", val);
    }
    
    return val;
  })();

  let qrDataUrl = "";
  if (qrValue) {
    try {
      qrDataUrl = await QRCode.toDataURL(qrValue, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 160,
      });
      console.log("QR Data URL generated successfully");
    } catch (err) {
      console.error("Failed to generate QR Code:", err);
    }
  }

  const qrBlock = qrDataUrl
    ? `
    <div class="qr">
      <img class="qr-img" src="${qrDataUrl}" alt="QR" />
    </div>
    `
    : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet">
  <title>Struk ${escHtml(d.receiptNumber)}</title>
  <style>
    /* Ukuran kertas termal 58mm */
    @page {
      size: 58mm auto;
      margin: 0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Poppins', system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
      font-size: 8pt;
      color: #000;
      background: #fff;
      width: 100%;
      margin: 0;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .paper {
      width: 58mm;
      margin: 0 auto;
      padding: 3mm 2.5mm 1mm 2.5mm;
      zoom: 1.2; /* Perbesar skala keseluruhan sedikit */
    }

    .center { text-align: center; }
    .bold   { font-weight: bold; }
    .big    { font-size: 11pt; letter-spacing: 0.2px; }
    .small  { font-size: 6.5pt; }
    .muted  { color: #222; }
    .mt-1   { margin-top: 1mm; }
    .mt-2   { margin-top: 2mm; }
    .mb-1   { margin-bottom: 1mm; }
    .mb-2   { margin-bottom: 2mm; }

    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 2mm 0;
    }

    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 2mm;
      margin-bottom: 1mm;
    }

    .row > span:first-child {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .row > span:last-child {
      flex-shrink: 0;
      text-align: right;
      white-space: nowrap;
    }

    .row-bold {
      display: flex;
      justify-content: space-between;
      font-weight: bold;
      font-size: 7pt;
      margin-bottom: 1mm;
    }

    .row-bold > span:last-child {
      white-space: nowrap;
    }

    .block-title {
      font-weight: bold;
      margin: 0 0 1mm;
    }

    .kv {
      display: grid;
      grid-template-columns: 12mm 1fr;
      row-gap: 0.7mm;
      column-gap: 4mm;
      line-height: 1.2;
      font-size: 6.5pt;
    }

    .kv .k {
      white-space: nowrap;
    }

    .kv .v {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .items {
      display: grid;
      gap: 1.2mm;
    }

    .qr {
      display: flex;
      justify-content: center;
      margin-top: 2mm;
      margin-bottom: 2mm;
    }

    .qr-img {
      width: 22mm;
      height: 22mm;
      image-rendering: pixelated;
    }

    .item {
      display: grid;
      gap: 0.4mm;
    }

    .item-name {
      font-weight: 400;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .item-meta {
      font-size: 7pt;
    }

    .totals {
      line-height: 1.2;
    }

    .totals .row {
      margin-bottom: 0.4mm;
    }

    .footer {
      text-align: center;
      margin-top: 3mm;
      font-size: 7pt;
    }
  </style>
</head>
<body>
  <div class="paper">
    <div class="center bold big">${escHtml(receiptSettings.companyName)}</div>
    <div class="center small muted">${escHtml(receiptSettings.tagline)}</div>
    

    <hr class="divider">

    <div class="kv">
      <div class="k">No</div><div class="v">: ${escHtml(d.receiptNumber)}</div>
      <div class="k">Tanggal</div><div class="v">: ${formatDate(d.createdAt, "dd/MM/yyyy HH:mm")}</div>
      <div class="k">Kasir</div><div class="v">: ${escHtml(d.staffName || "-")}</div>
      <div class="k">Pelanggan</div><div class="v">: ${escHtml(d.customerName || "Umum")}</div>
    </div>

    <hr class="divider">

    <div class="block-title">Rincian Layanan</div>
    <div class="items">
      ${itemRows}
    </div>

    <hr class="divider">

    <div class="totals">
      <div class="row">
        <span>Subtotal</span>
        <span>${formatRupiah(d.subtotal)}</span>
      </div>
      ${discountRow}
      ${taxRow}
    </div>

    <hr class="divider">

    <div class="row-bold">
      <span>GRAND TOTAL</span>
      <span>${formatRupiah(d.total)}</span>
    </div>
    <div class="row">
      <span>Pembayaran</span>
      <span>${escHtml(payLabel)}</span>
    </div>

    <hr class="divider">

    <div class="footer">
      ${escHtml(receiptSettings.footerLine1)}<br>
      ${receiptSettings.footerLine2 ? `🌐 ${escHtml(receiptSettings.footerLine2)}<br>` : ""}
      ${receiptSettings.phone ? `📞 ${escHtml(receiptSettings.phone)}` : ""}
    </div>

    ${qrBlock}
  </div>
</body>
</html>`;
}

function escHtml(str: string | undefined | null): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
