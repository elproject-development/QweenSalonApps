import { useState } from "react";
import { useListTransactions, useDeleteTransaction, getListTransactionsQueryKey } from "@/lib/api-client-react";
import { formatRupiah, formatDate } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Printer, Receipt, Trash2 } from "lucide-react";
import { ReceiptPrint, type ReceiptData } from "@/components/receipt/receipt-print";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const deleteTransaction = useDeleteTransaction();

  const totalPages = transactions ? Math.ceil(transactions.length / itemsPerPage) : 0;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentTransactions = transactions?.slice(startIndex, endIndex) || [];

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

  const handleDelete = (id: number) => {
    deleteTransaction.mutate(
      { id },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
          toast({ title: "Transaksi dihapus", variant: "success" });
        },
        onError: () => {
          toast({ title: "Gagal menghapus transaksi", variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Riwayat Transaksi</h1>
          <p className="text-muted-foreground text-xs sm:text-sm">Daftar semua transaksi yang telah dilakukan.</p>
        </div>
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
          <>
            {currentTransactions.map((trx) => (
              <Card key={trx.id} className="relative">
                <CardContent className="p-3 sm:p-4">
                  <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
                    <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
                      {`${formatDate(trx.createdAt, "dd MMMM yyyy").toLowerCase()} - ${formatDate(trx.createdAt, "HH:mm")}`}
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start gap-2 flex-wrap min-w-0">
                        <span className="font-mono text-[10px] sm:text-xs text-muted-foreground">{trx.receiptNumber}</span>
                        {trx.staffName && (
                          <span className="text-[10px] sm:text-xs text-muted-foreground">- {trx.staffName}</span>
                        )}
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
                          variant="default"
                          className="text-[10px] sm:text-xs px-2 py-0.5 !bg-emerald-600 !text-white"
                        >
                          Selesai
                        </Badge>
                        <span className="text-[10px] sm:text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
                          {PAYMENT_LABEL[trx.paymentMethod] ?? trx.paymentMethod}
                        </span>
                      </div>
                    </div>

                    <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 text-right">
                      <span className="text-primary font-bold text-sm sm:text-base">{formatRupiah(trx.total)}</span>
                    </div>

                    <div className="shrink-0 self-center">
                      <div className="flex items-center gap-1 sm:gap-1.5">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0 sm:h-9"
                              disabled={deleteTransaction.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Hapus transaksi?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Tindakan ini tidak bisa dibatalkan.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Batal</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(trx.id)}>
                                Hapus
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 h-8 w-8 p-0 sm:h-9 sm:w-auto sm:px-3"
                          onClick={() => handlePrint(trx)}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Cetak</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-xs text-muted-foreground ml-1">
                  {startIndex + 1}-{Math.min(endIndex, transactions.length)} dari {transactions.length}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentPage(prev => Math.max(1, prev - 1));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    disabled={currentPage === 1}
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentPage(prev => Math.min(totalPages, prev + 1));
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    disabled={currentPage === totalPages}
                  >
                    Berikutnya
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <ReceiptPrint data={printData} onDone={() => setPrintData(null)} />
    </div>
  );
}
