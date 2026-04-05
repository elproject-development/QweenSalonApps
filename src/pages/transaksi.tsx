import { useState } from "react";
import { useListTransactions } from "@/lib/api-client-react";
import { formatRupiah, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Printer, Receipt } from "lucide-react";
import { ReceiptPrint, type ReceiptData } from "@/components/receipt/receipt-print";

const PAYMENT_LABEL: Record<string, string> = {
  cash: "Tunai",
  transfer: "Transfer",
  qris: "QRIS",
  debit: "Debit",
  credit: "Kredit",
};

export function Transaksi() {
  const { data: transactions, isLoading } = useListTransactions();
  const [printData, setPrintData] = useState<ReceiptData | null>(null);

  const handlePrint = (trx: NonNullable<typeof transactions>[number]) => {
    const data: ReceiptData = {
      receiptNumber: trx.receiptNumber,
      createdAt: trx.createdAt,
      staffName: trx.staffName,
      customerName: trx.customerName,
      paymentMethod: trx.paymentMethod,
      items: trx.items.map(item => ({
        serviceName: item.serviceName,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.subtotal,
      })),
      subtotal: trx.subtotal,
      discount: trx.discount,
      tax: trx.tax,
      total: trx.total,
    };
    setPrintData(data);
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Riwayat Transaksi</h1>
        <p className="text-muted-foreground text-xs sm:text-sm">Daftar semua transaksi yang telah dilakukan.</p>
      </div>

      <div className="space-y-2 sm:space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 sm:h-28 w-full rounded-xl" />
          ))
        ) : !transactions?.length ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <Receipt className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground/30 mb-3 sm:mb-4" />
              <p className="text-muted-foreground">Belum ada transaksi</p>
            </CardContent>
          </Card>
        ) : (
          transactions.map((trx) => (
            <Card key={trx.id} className="relative">
              <CardContent className="p-3 sm:p-4">
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
                  <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(trx.createdAt, "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-start gap-2 flex-wrap min-w-0">
                      <span className="font-mono text-[10px] sm:text-xs text-muted-foreground">{trx.receiptNumber}</span>
                    </div>
                    <p className="font-semibold text-sm sm:text-base">{trx.customerName || "Pelanggan Umum"}</p>
                    <div className="space-y-1 my-2">
                      {trx.items.map((item, index) => (
                        <p key={`${trx.id}-item-${index}`} className="text-[10px] sm:text-xs text-muted-foreground border-b border-border/10 pb-1 last:border-0 flex justify-between items-center gap-2 max-w-[215px]">
                          <span className="flex-1 min-w-0">
                            <span className="text-primary font-medium inline-block w-5">{item.quantity}x</span> 
                            <span>{item.serviceName}</span>
                          </span>
                          <span className="font-medium whitespace-nowrap">{formatRupiah(item.subtotal)}</span>
                        </p>
                      ))}
                    </div>
                    <div className="flex items-center flex-wrap gap-2 pt-1">
                      <Badge
                        variant={trx.status === "completed" ? "default" : "destructive"}
                        className="text-[10px] sm:text-xs px-2 py-0.5"
                      >
                        {trx.status === "completed" ? "Selesai" : "Selesai"}
                      </Badge>
                      <span className="text-[10px] sm:text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
                        {PAYMENT_LABEL[trx.paymentMethod] ?? trx.paymentMethod}
                      </span>
                    </div>
                  </div>

                  <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 text-right">
                    <span className="text-primary font-bold text-sm sm:text-base">{formatRupiah(trx.total)}</span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 shrink-0 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3 self-center"
                    onClick={() => handlePrint(trx)}
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cetak</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <ReceiptPrint data={printData} onDone={() => setPrintData(null)} />
    </div>
  );
}
