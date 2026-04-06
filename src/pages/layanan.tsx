import { useState } from "react";
import { useListServices, useCreateService, useUpdateService, useDeleteService, getListServicesQueryKey } from "@/lib/api-client-react";
import { formatRupiah, formatNumber, parseNumber } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Scissors, Clock, Pencil, Trash2, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const CATEGORIES = ["Potong Rambut", "Perawatan Rambut", "Nail Art", "Perawatan Wajah","Eyelash Extension", "Lainnya"];

interface ServiceForm {
  name: string;
  category: string;
  price: string;
  duration: string;
  description: string;
  isActive: boolean;
}

function emptyForm(): ServiceForm {
  return { name: "", category: "", price: "", duration: "30", description: "", isActive: true };
}

export function Layanan() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceForm>(emptyForm());

  const { data: services, isLoading } = useListServices({ category: filterCategory === "all" ? undefined : filterCategory || undefined });
  const createService = useCreateService();
  const updateService = useUpdateService();
  const deleteService = useDeleteService();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListServicesQueryKey() });

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowDialog(true);
  };

  const openEdit = (s: NonNullable<typeof services>[number]) => {
    setEditId(s.id);
    setForm({
      name: s.name,
      category: s.category,
      price: formatNumber(s.price),
      duration: String(s.duration),
      description: s.description ?? "",
      isActive: s.isActive,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.category || !form.price) {
      toast({ title: "Nama, kategori, dan harga wajib diisi", variant: "destructive" });
      return;
    }
    try {
      const data = {
        name: form.name,
        category: form.category,
        price: parseNumber(form.price),
        duration: parseInt(form.duration),
        description: form.description || null,
        isActive: form.isActive,
      };
      if (editId) {
        await updateService.mutateAsync({ id: editId, data });
        toast({ title: "Layanan diperbarui", variant: "success" });
      } else {
        await createService.mutateAsync({ data });
        toast({ title: "Layanan baru ditambahkan", variant: "success" });
      }
      setShowDialog(false);
      invalidate();
    } catch {
      toast({ title: "Gagal menyimpan layanan", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteService.mutateAsync({ id });
      toast({ title: "Layanan dihapus", variant: "success" });
      invalidate();
    } catch {
      toast({ title: "Gagal menghapus layanan", variant: "destructive" });
    }
  };

  // Group by category
  const grouped = (services ?? []).reduce<Record<string, typeof services>>((acc, s) => {
    if (!acc[s!.category]) acc[s!.category] = [];
    acc[s!.category]!.push(s);
    return acc;
  }, {});

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Daftar Layanan</h1>
          <p className="text-muted-foreground text-xs">Kelola layanan dan harga salon</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2 h-8 text-xs sm:h-9 sm:text-sm">
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Tambah
        </Button>
      </div>

      {/* Category filter */}
      <Select value={filterCategory} onValueChange={setFilterCategory}>
        <SelectTrigger>
          <SelectValue placeholder="Semua kategori" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua Kategori</SelectItem>
          {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
        </SelectContent>
      </Select>

      {/* Grouped list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
      ) : !services?.length ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <Scissors className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Belum ada layanan</p>
            <p className="text-sm text-muted-foreground/70">Tambah layanan pertama Anda</p>
          </CardContent>
        </Card>
      ) : Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-2">
          <div className="flex items-center gap-2">
            <Tag className="w-3.5 h-3.5 text-primary" />
            <h3 className="text-sm font-semibold text-primary">{category}</h3>
            <span className="text-xs text-muted-foreground">({items?.length})</span>
          </div>
          {items?.map((s) => s && (
            <Card key={s.id} className={!s.isActive ? "opacity-60" : ""}>
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{s.name}</p>
                      {!s.isActive && <Badge variant="secondary" className="text-xs">Nonaktif</Badge>}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-primary font-bold text-sm">{formatRupiah(s.price)}</span>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {s.duration} mnt
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="w-8 h-8" onClick={() => openEdit(s)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-destructive hover:text-destructive" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Layanan" : "Tambah Layanan"}</DialogTitle>
            <DialogDescription>
              {editId ? "Perbarui detail layanan dan harga." : "Buat layanan baru untuk ditampilkan di menu kasir."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nama Layanan *</Label>
              <Input placeholder="contoh: Creambath" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
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
                <Label>Harga (Rp) *</Label>
                <Input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="75.000" 
                  value={form.price} 
                  onChange={(e) => setForm(f => ({ ...f, price: formatNumber(e.target.value) }))} 
                />
              </div>
              <div className="space-y-1">
                <Label>Durasi (menit)</Label>
                <Input type="number" placeholder="30" value={form.duration} onChange={(e) => setForm(f => ({ ...f, duration: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Deskripsi</Label>
              <Textarea placeholder="Deskripsi layanan..." value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="text-sm">Aktif</Label>
                <p className="text-xs text-muted-foreground">Tampilkan di kasir</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="w-full sm:w-auto">Batal</Button>
            <Button onClick={handleSave} disabled={createService.isPending || updateService.isPending} className="w-full sm:w-auto">
              {createService.isPending || updateService.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
