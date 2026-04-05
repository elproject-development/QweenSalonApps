import { useState } from "react";
import { useListAppointments, useCreateAppointment, useUpdateAppointment, useDeleteAppointment, useListServices, useListStaff, getListAppointmentsQueryKey } from "@/lib/api-client-react";
import { formatDate, formatRupiah } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { Plus, Calendar, Clock, User, Scissors, Phone, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Menunggu", variant: "secondary" },
  confirmed: { label: "Dikonfirmasi", variant: "default" },
  completed: { label: "Selesai", variant: "outline" },
  cancelled: { label: "Dibatalkan", variant: "destructive" },
};

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function Janji() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    serviceId: "",
    staffId: "anyone",
    scheduledDate: getTodayStr(),
    scheduledTime: "09:00",
    notes: "",
  });

  const { data: appointments, isLoading } = useListAppointments({
    date: selectedDate || undefined,
    status: (filterStatus && filterStatus !== "all") ? filterStatus as any : undefined,
  });

  const { data: services } = useListServices();
  const { data: staff } = useListStaff();
  const createAppointment = useCreateAppointment();
  const updateAppointment = useUpdateAppointment();
  const deleteAppointment = useDeleteAppointment();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListAppointmentsQueryKey() });
  };

  const handleCreate = async () => {
    if (!form.customerName || !form.customerPhone || !form.serviceId || !form.scheduledDate || !form.scheduledTime) {
      toast({ title: "Lengkapi semua data yang diperlukan", variant: "destructive" });
      return;
    }
    try {
      const scheduledAt = new Date(`${form.scheduledDate}T${form.scheduledTime}`).toISOString();
      await createAppointment.mutateAsync({
        data: {
          customerName: form.customerName,
          customerPhone: form.customerPhone,
          serviceId: parseInt(form.serviceId),
          staffId: form.staffId && form.staffId !== "anyone" ? parseInt(form.staffId) : null,
          scheduledAt,
          notes: form.notes || null,
        },
      });
      toast({ title: "Janji temu berhasil dibuat", variant: "success" });
      setShowDialog(false);
      setForm({ customerName: "", customerPhone: "", serviceId: "", staffId: "anyone", scheduledDate: getTodayStr(), scheduledTime: "09:00", notes: "" });
      invalidate();
    } catch {
      toast({ title: "Gagal membuat janji temu", variant: "destructive" });
    }
  };

  const handleStatusUpdate = async (id: number, status: string) => {
    try {
      await updateAppointment.mutateAsync({ id, data: { status: status as "pending" | "confirmed" | "completed" | "cancelled" } });
      toast({ title: "Status diperbarui", variant: "success" });
      invalidate();
    } catch {
      toast({ title: "Gagal memperbarui status", variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteAppointment.mutateAsync({ id });
      toast({ title: "Janji temu dihapus", variant: "success" });
      invalidate();
    } catch {
      toast({ title: "Gagal menghapus janji temu", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Janji Temu</h1>
          <p className="text-muted-foreground text-xs">Kelola jadwal kunjungan pelanggan</p>
        </div>
        <Button onClick={() => setShowDialog(true)} size="sm" className="gap-2 h-8 text-xs sm:h-9 sm:text-sm">
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          Tambah
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">Tanggal</Label>
              <DatePicker value={selectedDate} onChange={(value) => setSelectedDate(value)} className="h-9 text-xs" />
            </div>
            <div>
              <Label className="text-xs mb-1 block text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Semua status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  <SelectItem value="pending">Menunggu</SelectItem>
                  <SelectItem value="confirmed">Dikonfirmasi</SelectItem>
                  <SelectItem value="completed">Selesai</SelectItem>
                  <SelectItem value="cancelled">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
        ) : !appointments?.length ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center">
              <Calendar className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Tidak ada janji temu</p>
              <p className="text-sm text-muted-foreground/70">Tambah janji temu baru untuk mulai</p>
            </CardContent>
          </Card>
        ) : appointments.map((appt) => {
          const statusInfo = STATUS_MAP[appt.status] ?? { label: appt.status, variant: "secondary" as const };
          return (
            <Card key={appt.id} className="overflow-hidden border-none shadow-sm bg-card/50">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-bold text-sm sm:text-base truncate ml-4.5">{appt.customerName}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                        <Phone className="w-3 h-3 text-primary/60" />
                        {appt.customerPhone}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                        <Scissors className="w-3 h-3 text-primary/60" />
                        {appt.serviceName}
                      </p>
                      {appt.staffName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5 truncate">
                          <User className="w-3 h-3 text-primary/60" />
                          {appt.staffName}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    {appt.status === "pending" && (
                      <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 font-semibold" onClick={() => handleStatusUpdate(appt.id, "confirmed")}>
                        <CheckCircle className="w-3 h-3" />
                        Konfirmasi
                      </Button>
                    )}
                    {appt.status === "confirmed" && (
                      <Button size="sm" variant="outline" className="h-8 text-[10px] sm:text-xs gap-1 font-semibold" onClick={() => handleStatusUpdate(appt.id, "completed")}>
                        <CheckCircle className="w-3 h-3 text-emerald-600" />
                        Selesai
                      </Button>
                    )}
                    {(appt.status === "pending" || appt.status === "confirmed") && (
                      <Button size="sm" variant="ghost" className="h-8 text-[10px] sm:text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/5 font-medium" onClick={() => handleStatusUpdate(appt.id, "cancelled")}>
                        <XCircle className="w-3 h-3" />
                        Batal
                      </Button>
                    )}
                    {appt.status === "cancelled" && (
                      <Button size="sm" variant="ghost" className="h-8 text-[10px] sm:text-xs text-destructive hover:bg-destructive/5 font-medium" onClick={() => handleDelete(appt.id)}>
                        Hapus
                      </Button>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between pt-2 border-t border-border/30">
                  <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-muted-foreground font-medium">
                    <Clock className="w-3 h-3 text-primary/60" />
                    <span className="flex items-center gap-3">
                      <span>{formatDate(appt.scheduledAt, "dd/MM/yyyy")}</span>
                      <span>{formatDate(appt.scheduledAt, "HH:mm")}</span>
                    </span>
                  </div>
                  <Badge variant={statusInfo.variant} className="text-[10px] px-2 py-0 font-bold uppercase shrink-0 mr-2">
                    {statusInfo.label}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>Tambah Janji Temu</DialogTitle>
            <DialogDescription>
              Catat jadwal kunjungan pelanggan baru.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Nama Pelanggan *</Label>
              <Input placeholder="Nama lengkap" value={form.customerName} onChange={(e) => setForm(f => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>No. HP *</Label>
              <Input placeholder="08xxxxxxxxxx" value={form.customerPhone} onChange={(e) => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Layanan *</Label>
              <Select value={form.serviceId} onValueChange={(v) => setForm(f => ({ ...f, serviceId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih layanan" />
                </SelectTrigger>
                <SelectContent>
                  {services?.filter(s => s.isActive).map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name} — {formatRupiah(s.price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Staf (opsional)</Label>
              <Select value={form.staffId} onValueChange={(v) => setForm(f => ({ ...f, staffId: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih staf" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anyone">Siapa saja</SelectItem>
                  {staff?.filter(s => s.isActive).map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Tanggal *</Label>
                <DatePicker value={form.scheduledDate} onChange={(value) => setForm(f => ({ ...f, scheduledDate: value }))} uiVariant="form" className="w-full" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Jam *</Label>
                <div className="flex gap-2">
                  <Select 
                    value={form.scheduledTime.split(':')[0]} 
                    onValueChange={(h) => setForm(f => ({ ...f, scheduledTime: `${h}:${f.scheduledTime.split(':')[1] || '00'}` }))}
                  >
                    <SelectTrigger className="h-10 text-sm flex-1">
                      <SelectValue placeholder="Jam" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {Array.from({ length: 24 }, (_, i) => {
                        const h = String(i).padStart(2, '0');
                        return <SelectItem key={h} value={h}>{h}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                  <span className="flex items-center">:</span>
                  <Select 
                    value={form.scheduledTime.split(':')[1]} 
                    onValueChange={(m) => setForm(f => ({ ...f, scheduledTime: `${f.scheduledTime.split(':')[0] || '09'}:${m}` }))}
                  >
                    <SelectTrigger className="h-10 text-sm flex-1">
                      <SelectValue placeholder="Menit" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {['00', '15', '30', '45'].map((m) => (
                        <SelectItem key={m} value={m}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Catatan</Label>
              <Textarea placeholder="Catatan tambahan..." value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setShowDialog(false)} className="w-full sm:w-auto">Batal</Button>
            <Button onClick={handleCreate} disabled={createAppointment.isPending} className="w-full sm:w-auto">
              {createAppointment.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
