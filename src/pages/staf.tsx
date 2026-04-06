import { useState } from "react";
import { useListStaff, useCreateStaff, useUpdateStaff, useDeleteStaff, getListStaffQueryKey } from "@/lib/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, UserCheck, Phone, Percent, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface StaffForm {
  name: string;
  phone: string;
  position: string;
  commission: string;
  isActive: boolean;
}

function emptyForm(): StaffForm {
  return { name: "", phone: "", position: "", commission: "10", isActive: true };
}

export function Staf() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showDialog, setShowDialog] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<StaffForm>(emptyForm());

  const { data: staff, isLoading } = useListStaff();
  const createStaff = useCreateStaff();
  const updateStaff = useUpdateStaff();
  const deleteStaff = useDeleteStaff();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() });

  const openCreate = () => {
    setEditId(null);
    setForm(emptyForm());
    setShowDialog(true);
  };

  const openEdit = (s: NonNullable<typeof staff>[number]) => {
    setEditId(s.id);
    setForm({ name: s.name, phone: s.phone, position: s.position, commission: String(s.commission), isActive: s.isActive });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.phone || !form.position) {
      toast({ title: "Nama, HP, dan posisi wajib diisi", variant: "destructive" });
      return;
    }
    try {
      const data = { name: form.name, phone: form.phone, position: form.position, commission: parseFloat(form.commission) || 0, isActive: form.isActive };
      if (editId) {
        await updateStaff.mutateAsync({ id: editId, data });
        toast({ title: "Data staf diperbarui", variant: "success" });
      } else {
        await createStaff.mutateAsync({ data });
        toast({ title: "Staf baru ditambahkan", variant: "success" });
      }
      setShowDialog(false);
      invalidate();
    } catch {
      toast({ title: "Gagal menyimpan data", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteStaff.mutateAsync({ id });
      toast({ title: "Staf dihapus", variant: "success" });
      invalidate();
    } catch {
      toast({ title: "Gagal menghapus staf", variant: "destructive" });
    }
  };

  const active = staff?.filter(s => s.isActive) ?? [];
  const inactive = staff?.filter(s => !s.isActive) ?? [];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Data Staf</h1>
          <p className="text-muted-foreground text-xs">Kelola karyawan dan komisi</p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2 h-8 text-xs sm:h-9 sm:text-sm">
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Tambah
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Staf Aktif</p>
            <p className="text-2xl font-bold text-primary mt-1">{active.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-sm text-muted-foreground">Total Staf</p>
            <p className="text-2xl font-bold mt-1">{staff?.length ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}
        </div>
      ) : !staff?.length ? (
        <Card>
          <CardContent className="py-12 flex flex-col items-center text-center">
            <UserCheck className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground">Belum ada staf</p>
            <p className="text-sm text-muted-foreground/70">Tambah staf untuk mulai</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {staff.map((s) => (
            <Card key={s.id} className={!s.isActive ? "opacity-60" : ""}>
              <CardContent className="py-3 sm:py-4">
                <div className="flex items-start sm:items-center gap-3">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm sm:text-base font-bold shrink-0">
                    {s.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="font-semibold text-sm sm:text-base truncate">{s.name}</p>
                    </div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">{s.position}</p>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mt-1.5 min-w-0">
                      <span className="text-[11px] sm:text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                        <Phone className="w-3 h-3" />
                        <span className="truncate">{s.phone}</span>
                      </span>
                      <span className="text-[11px] sm:text-xs text-primary flex items-center gap-2 font-medium">
                        <Percent className="w-3 h-3" />
                        Komisi {s.commission}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={s.isActive ? "default" : "secondary"} className="text-[10px] sm:text-xs">
                      {s.isActive ? "Aktif" : "Nonaktif"}
                    </Badge>
                    <div className="flex items-center gap-1 mt-1">
                      <Button size="icon" variant="ghost" className="w-8 h-8 sm:w-9 sm:h-9" onClick={() => openEdit(s)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-8 h-8 sm:w-9 sm:h-9 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(s.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Staf" : "Tambah Staf"}</DialogTitle>
            <DialogDescription>
              {editId ? "Perbarui informasi profil staf." : "Tambahkan anggota tim baru ke salon Anda."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nama *</Label>
              <Input placeholder="Nama lengkap" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>No. HP *</Label>
              <Input placeholder="08xxxxxxxxxx" value={form.phone} onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Posisi *</Label>
              <Input placeholder="contoh: Senior Stylist" value={form.position} onChange={(e) => setForm(f => ({ ...f, position: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Komisi (%)</Label>
              <Input type="number" min="0" max="100" placeholder="10" value={form.commission} onChange={(e) => setForm(f => ({ ...f, commission: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <Label className="text-sm">Status Aktif</Label>
                <p className="text-xs text-muted-foreground">Staf bisa dipilih di kasir</p>
              </div>
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm(f => ({ ...f, isActive: v }))} />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="w-full sm:w-auto">Batal</Button>
            <Button onClick={handleSave} disabled={createStaff.isPending || updateStaff.isPending} className="w-full sm:w-auto">
              {createStaff.isPending || updateStaff.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
