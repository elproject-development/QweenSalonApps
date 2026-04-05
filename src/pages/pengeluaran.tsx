import { useState } from "react";
import { useListExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense, getListExpensesQueryKey } from "@/lib/api-client-react";
import { formatRupiah, formatDate, formatNumber, parseNumber } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Calculator, Calendar, Pencil, Trash2, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["Bahan Habis Pakai", "Peralatan", "Utilitas", "Gaji", "Sewa", "Pemasaran", "Lainnya"];

interface ExpenseForm {
  description: string;
  category: string;
  amount: string;
  date: string;
  notes: string;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): ExpenseForm {
  return { description: "", category: "", amount: "", date: todayStr(), notes: "" };
}

export function Pengeluaran() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(emptyForm());

  const { data: expenses, isLoading } = useListExpenses({
    category: (filterCategory && filterCategory !== "all") ? filterCategory : undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListExpensesQueryKey() });

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowDialog(true);
  };

  const openEdit = (e: NonNullable<typeof expenses>[number]) => {
    setEditId(e.id);
    setForm({ description: e.description, category: e.category, amount: formatNumber(e.amount), date: e.date, notes: e.notes ?? "" });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.description || !form.category || !form.amount || !form.date) {
      toast({ title: "Lengkapi semua data yang diperlukan", variant: "destructive" });
      return;
    }
    try {
      const data = { description: form.description, category: form.category, amount: parseNumber(form.amount), date: form.date, notes: form.notes || null };
      if (editId) {
        await updateExpense.mutateAsync({ id: editId, data });
        toast({ title: "Pengeluaran diperbarui", variant: "success" });
      } else {
        await createExpense.mutateAsync({ data });
        toast({ title: "Pengeluaran dicatat", variant: "success" });
      }
      setShowDialog(false);
      invalidate();
    } catch {
      toast({ title: "Gagal menyimpan pengeluaran", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteExpense.mutateAsync({ id });
      toast({ title: "Pengeluaran dihapus", variant: "success" });
      invalidate();
    } catch {
      toast({ title: "Gagal menghapus pengeluaran", variant: "destructive" });
    }
  };

  const total = (expenses ?? []).reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Pengeluaran</h1>
          <p className="text-muted-foreground text-xs">Catat semua biaya operasional</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2 h-8 text-xs sm:h-9 sm:text-sm">
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Catat
        </Button>
      </div>

      {/* Total Card */}
      <Card className="bg-destructive/5 border-destructive/20">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Pengeluaran</p>
              <p className="text-2xl font-bold text-destructive mt-1">{formatRupiah(total)}</p>
            </div>
            <TrendingDown className="w-8 h-8 text-destructive/30" />
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-3">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Semua kategori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Kategori</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs mb-1 block text-muted-foreground">Dari tanggal</Label>
                <DatePicker value={startDate} onChange={(value) => setStartDate(value)} className="h-9" />
              </div>
              <div>
                <Label className="text-xs mb-1 block text-muted-foreground">Sampai tanggal</Label>
                <DatePicker value={endDate} onChange={(value) => setEndDate(value)} className="h-9" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
        ) : !expenses?.length ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <Calculator className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Tidak ada pengeluaran</p>
              <p className="text-sm text-muted-foreground/70">Catat pengeluaran pertama Anda</p>
            </CardContent>
          </Card>
        ) : expenses.map((e) => (
          <Card key={e.id}>
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sm">{e.description}</p>
                      {e.notes && <p className="text-xs text-muted-foreground mt-1 truncate">{e.notes}</p>}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          {formatDate(e.date)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 mt-2">
                    <Badge variant="secondary" className="text-xs w-fit">{e.category}</Badge>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="font-bold text-destructive text-sm shrink-0">{formatRupiah(e.amount)}</p>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => openEdit(e)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(e.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Pengeluaran" : "Catat Pengeluaran"}</DialogTitle>
            <DialogDescription>
              {editId ? "Perbarui catatan biaya operasional." : "Masukkan rincian pengeluaran baru."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Keterangan *</Label>
              <Input placeholder="contoh: Beli sampo" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Kategori *</Label>
              <Select value={form.category} onValueChange={(v) => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kategori" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Jumlah (Rp) *</Label>
                <Input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="50.000" 
                  value={form.amount} 
                  onChange={(e) => setForm(f => ({ ...f, amount: formatNumber(e.target.value) }))} 
                />
              </div>
              <div className="space-y-1">
                <Label>Tanggal *</Label>
                <DatePicker value={form.date} onChange={(value) => setForm(f => ({ ...f, date: value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Catatan</Label>
              <Textarea placeholder="Catatan tambahan..." value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="w-full sm:w-auto">Batal</Button>
            <Button onClick={handleSave} disabled={createExpense.isPending || updateExpense.isPending} className="w-full sm:w-auto">
              {createExpense.isPending || updateExpense.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
