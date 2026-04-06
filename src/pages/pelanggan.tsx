import { useState } from "react";
import { useListCustomers, useCreateCustomer, useUpdateCustomer, useDeleteCustomer, useListTransactions, getListCustomersQueryKey } from "@/lib/api-client-react";
import { formatRupiah, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Phone, Mail, Pencil, Trash2, History, Star, ShoppingBag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CustomerFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

function emptyForm(): CustomerFormData {
  return { name: "", phone: "", email: "", address: "", notes: "" };
}

function HistorySheet({ 
  customerId, 
  customerName,
  customerPhone,
  open, 
  onClose,
  allTransactions 
}: { 
  customerId: number; 
  customerName: string;
  customerPhone: string;
  open: boolean; 
  onClose: () => void;
  allTransactions: any[] | undefined;
}) {
  const history = allTransactions?.filter((tx: any) => {
    const txCustId = tx.customerId || tx.customer_id;
    const idMatch = txCustId && String(txCustId).trim() === String(customerId).trim();
    const txName = (tx.customerName || tx.customer_name || "").toLowerCase().trim();
    const currentName = (customerName || "").toLowerCase().trim();
    const nameMatch = txName !== "" && txName === currentName;
    const txPhone = (tx.customerPhone || tx.customer_phone || "").replace(/\D/g, "");
    const currentPhone = (customerPhone || "").replace(/\D/g, "");
    const phoneMatch = txPhone !== "" && txPhone === currentPhone;
    return idMatch || nameMatch || phoneMatch;
  }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-hidden border-none shadow-2xl">
        <SheetHeader className="p-6 bg-primary/5 text-left">
          <SheetTitle className="text-xl font-bold flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Riwayat Kunjungan
          </SheetTitle>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{customerName}</p>
        </SheetHeader>
        <div className="p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)] pb-20">
          {!history?.length ? (
            <div className="text-center py-20 flex flex-col items-center gap-3">
              <div className="p-4 rounded-full bg-muted/30">
                <ShoppingBag className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">Belum ada riwayat transaksi</p>
            </div>
          ) : history.map((tx: any) => (
            <Card key={tx.id} className="border-none shadow-sm bg-card overflow-hidden ring-1 ring-border/50">
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="space-y-1">
                    <p className="text-[10px] font-bold text-primary bg-primary/5 px-2 py-0.5 rounded-full w-fit uppercase tracking-tighter">
                      {tx.receiptNumber}
                    </p>
                    <p className="text-lg font-black text-foreground">{formatRupiah(tx.total || tx.total_amount || 0)}</p>
                  </div>
                </div>
                
                <div className="space-y-2 border-t border-dashed pt-3">
                  {tx.items?.map((item: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <span className="text-muted-foreground font-medium">{item.serviceName || item.service_name}</span>
                      <span className="font-bold text-foreground/80 whitespace-nowrap">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
                
                <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/30">
                  <div className="text-[10px] text-muted-foreground font-medium italic flex flex-col">
                    <span>{formatDate(tx.createdAt, "eeee, dd MMMM yyyy")}</span>
                    <span>{formatDate(tx.createdAt, "HH:mm")} WIB</span>
                  </div>
                  <Badge variant={tx.status === "completed" || tx.status === "Selesai" ? "default" : "destructive"} className="text-[10px] px-2 py-0 font-bold uppercase shrink-0">
                    {tx.status === "completed" || tx.status === "Selesai" ? "Selesai" : "Void"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function Pelanggan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<CustomerFormData>(emptyForm());
  const [activeCustomer, setActiveCustomer] = useState<{id: number, name: string, phone: string} | null>(null);

  const { data: customers, isLoading: loadingCustomers } = useListCustomers({ search: search || undefined });
  const { data: allTransactions } = useListTransactions();

  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
  };

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowDialog(true);
  };

  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({ name: c.name, phone: c.phone, email: c.email ?? "", address: c.address ?? "", notes: c.notes ?? "" });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.phone) {
      toast({ title: "Nama dan nomor HP wajib diisi", variant: "destructive" });
      return;
    }
    try {
      const data = { name: form.name, phone: form.phone, email: form.email || null, address: form.address || null, notes: form.notes || null };
      if (editId) {
        await updateCustomer.mutateAsync({ id: editId, data });
        toast({ title: "Data pelanggan diperbarui", variant: "success" });
      } else {
        await createCustomer.mutateAsync({ data });
        toast({ title: "Pelanggan baru ditambahkan", variant: "success" });
      }
      setShowDialog(false);
      invalidate();
    } catch {
      toast({ title: "Gagal menyimpan data", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteCustomer.mutateAsync({ id });
      toast({ title: "Pelanggan dihapus", variant: "success" });
      invalidate();
    } catch {
      toast({ title: "Gagal menghapus pelanggan", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Data Pelanggan</h1>
          <p className="text-muted-foreground text-xs">Kelola daftar pelanggan setia Anda</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" />
          Tambah
        </Button>
      </div>

      {/* Search */}
      <div className="relative group">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
        <Input
          placeholder="Cari nama pelanggan..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 h-11 bg-card/50 border-none shadow-sm focus-visible:ring-primary focus-within:ring-1 ring-primary/20"
        />
      </div>

      {/* List */}
      <div className="space-y-3 pb-20">
        {loadingCustomers ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)
        ) : !customers?.length ? (
          <Card className="border-none shadow-sm bg-card/50">
            <CardContent className="py-12 flex flex-col items-center text-center">
              <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground font-medium">{search ? "Pelanggan tidak ditemukan" : "Belum ada pelanggan"}</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Tambahkan pelanggan baru untuk mulai</p>
            </CardContent>
          </Card>
        ) : customers.map((c: any) => (
          <Card key={c.id} className="overflow-hidden border-none shadow-sm bg-card/50">
            <CardContent className="p-4">
              <div className="flex items-end justify-between gap-3">
                {/* Avatar & Main Info */}
                <div className="flex gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 ring-1 ring-primary/20 mb-0.5">
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-2.5">
                      <p className="font-bold text-sm sm:text-base truncate ml-4.5">
                        {c.name.length > 15 ? `${c.name.substring(0, 15)}...` : c.name}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate mb-0.5">
                      <Phone className="w-3 h-3 text-primary/60" /> {c.phone}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2 shrink-0">
                  <div className="flex gap-1">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="w-8 h-8 text-muted-foreground hover:text-primary" 
                      onClick={() => setActiveCustomer({ id: c.id, name: c.name, phone: c.phone })}
                    >
                      <History className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="w-8 h-8 text-muted-foreground hover:text-primary" 
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="w-8 h-8 text-muted-foreground hover:text-destructive" 
                      onClick={() => handleDelete(c.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 justify-end">
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/10 text-[10px] py-0 px-1.5 font-semibold">
                      {c.visitCount || 0}x kunjungan
                    </Badge>
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 text-[10px] py-0 px-1.5 font-semibold">
                      {formatRupiah(c.totalSpend || 0)}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {activeCustomer && (
        <HistorySheet 
          customerId={activeCustomer.id} 
          customerName={activeCustomer.name}
          customerPhone={activeCustomer.phone}
          open={!!activeCustomer} 
          onClose={() => setActiveCustomer(null)} 
          allTransactions={allTransactions}
        />
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto rounded-2xl p-0 overflow-hidden border-none shadow-2xl">
          <DialogHeader className="p-6 pb-2 bg-primary/5">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <div className="p-2 rounded-full bg-primary/10 text-primary">
                {editId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </div>
              {editId ? "Edit Pelanggan" : "Tambah Pelanggan"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {editId ? "Perbarui data kontak pelanggan setia Anda." : "Daftarkan pelanggan baru ke dalam sistem Qween Salon."}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 ml-1">
                Nama Lengkap *
              </Label>
              <Input 
                placeholder="Masukkan nama pelanggan" 
                value={form.name} 
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                className="h-11 bg-muted/30 border-none shadow-inner focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 ml-1">
                Nomor HP *
              </Label>
              <Input 
                placeholder="08xxxxxxxxxx" 
                value={form.phone} 
                onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                className="h-11 bg-muted/30 border-none shadow-inner focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 ml-1">
                Email (Opsional)
              </Label>
              <Input 
                type="email" 
                placeholder="email@contoh.com" 
                value={form.email} 
                onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                className="h-11 bg-muted/30 border-none shadow-inner focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 ml-1">
                Alamat
              </Label>
              <Input 
                placeholder="Alamat lengkap" 
                value={form.address} 
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                className="h-11 bg-muted/30 border-none shadow-inner focus-visible:ring-primary/30"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold flex items-center gap-1.5 ml-1">
                Catatan
              </Label>
              <Textarea 
                placeholder="Catatan tambahan tentang pelanggan..." 
                value={form.notes} 
                onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} 
                rows={2} 
                className="bg-muted/30 border-none shadow-inner focus-visible:ring-primary/30 resize-none"
              />
            </div>
          </div>
          <DialogFooter className="p-6 pt-2 flex flex-col gap-2">
            <Button 
              onClick={handleSave} 
              disabled={createCustomer.isPending || updateCustomer.isPending}
              className="w-full bg-primary hover:bg-primary/90 shadow-lg shadow-primary/20 order-1"
            >
              {createCustomer.isPending || updateCustomer.isPending ? "Menyimpan..." : "Simpan Data"}
            </Button>
            <Button variant="ghost" onClick={() => setShowDialog(false)} className="w-full order-2">
              Batal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
