import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Settings, Palette, Bell, Shield, HelpCircle, Trash2, Receipt, Moon, Sun, Type, Download, Mail, Phone, ExternalLink, FileSpreadsheet, BookOpen, DollarSign, FileText, BarChart3, Users, Calendar, LogOut } from "lucide-react";
import * as XLSX from "xlsx-js-style";
import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";
import { useNotifications } from "@/components/notification-provider";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export default function Setting() {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeletingTransactions, setIsDeletingTransactions] = useState(false);
  const [deleteTxConfirmText, setDeleteTxConfirmText] = useState("");
  const [resetConfirmText, setResetConfirmText] = useState("");
  const DELETE_TX_CONFIRM_PHRASE = "HAPUS";
  const RESET_CONFIRM_PHRASE = "RESET";
  const [isExporting, setIsExporting] = useState(false);
  const { theme, setTheme, fontSize, setFontSize } = useTheme();
  const { toast } = useToast();
  const { settings: notifSettings, setSettings: setNotifSettings, requestPermission, sendNotification, permissionStatus, schedulePrayerReminders, cancelPrayerReminders } = useNotifications();

  const PRAYER_SETTINGS_STORAGE_KEY = "qweensalon:prayer_notifications";
  const [prayerEnabled, setPrayerEnabled] = useState(false);
  const [prayerCity, setPrayerCity] = useState("Yogyakarta");

  const FOREGROUND_SETTINGS_STORAGE_KEY = "qweensalon:foreground_service";
  const [foregroundEnabled, setForegroundEnabled] = useState(false);

  const ForegroundService = registerPlugin<any>("QweenForegroundService");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PRAYER_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setPrayerEnabled(Boolean(parsed?.enabled));
      setPrayerCity(String(parsed?.city || "Yogyakarta"));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FOREGROUND_SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setForegroundEnabled(Boolean(parsed?.enabled));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(PRAYER_SETTINGS_STORAGE_KEY, JSON.stringify({ enabled: prayerEnabled, city: prayerCity }));
    } catch {
      // ignore
    }
  }, [prayerEnabled, prayerCity]);

  useEffect(() => {
    try {
      localStorage.setItem(FOREGROUND_SETTINGS_STORAGE_KEY, JSON.stringify({ enabled: foregroundEnabled }));
    } catch {
      // ignore
    }
  }, [foregroundEnabled]);

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast({
        title: "Berhasil Logout",
        description: "Sampai jumpa kembali!",
        variant: "success",
      });
      window.location.href = "/login";
    } catch (error: any) {
      toast({
        title: "Gagal Logout",
        description: error.message || "Terjadi kesalahan saat logout",
        variant: "destructive",
      });
    }
  };

  const APP_BRAND_STORAGE_KEY = "qweensalon:app_brand";
  const DEFAULT_APP_BRAND = "qweenSalon";
  const [appBrand, setAppBrand] = useState(() => {
    try {
      return localStorage.getItem(APP_BRAND_STORAGE_KEY) ?? DEFAULT_APP_BRAND;
    } catch {
      return DEFAULT_APP_BRAND;
    }
  });

  const RECEIPT_SETTINGS_STORAGE_KEY = "qweensalon:receipt_settings";
  const DEFAULT_RECEIPT_SETTINGS = {
    companyName: "QweenSalon",
    tagline: "Tempatnya Perawatan Kecantikan",
    phone: "+62 838-6718-0887",
    footerLine1: "Terima Kasih Sampai jumpa kembali!",
    footerLine2: "www.qweensalon.web.id",
    qrEnabled: false,
    qrMode: "website" as "receipt" | "website" | "custom",
    qrCustom: "",
  };

  const [receiptSettings, setReceiptSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(RECEIPT_SETTINGS_STORAGE_KEY);
      if (!raw) return DEFAULT_RECEIPT_SETTINGS;
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_RECEIPT_SETTINGS, ...parsed };
    } catch {
      return DEFAULT_RECEIPT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(RECEIPT_SETTINGS_STORAGE_KEY, JSON.stringify(receiptSettings));
    } catch {
      // ignore
    }
  }, [receiptSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(APP_BRAND_STORAGE_KEY, appBrand);
    } catch {
      // ignore
    }

    try {
      window.dispatchEvent(new Event("qweensalon:app_brand_changed"));
    } catch {
      // ignore
    }
  }, [appBrand]);

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      // Ambil data dari semua tabel secara terpisah untuk menghindari error relasi/join
      const [txRes, custRes, servRes, staffRes] = await Promise.all([
        supabase.from("transactions").select("*").order("created_at", { ascending: false }),
        supabase.from("customers").select("id, name, phone"),
        supabase.from("services").select("id, name"),
        supabase.from("staff").select("id, name")
      ]);

      if (txRes.error) throw new Error(`Gagal mengambil transaksi: ${txRes.error.message}`);
      
      const rawData = txRes.data;
      const customerMap = new Map(custRes.data?.map(c => [c.id, c]) || []);
      const serviceMap = new Map(servRes.data?.map(s => [s.id, s.name]) || []);
      const staffMap = new Map(staffRes.data?.map(s => [s.id, s.name]) || []);

      if (!rawData || rawData.length === 0) {
        toast({
          title: "Data Kosong",
          description: "Tidak ada riwayat transaksi untuk diekspor",
          variant: "default",
        });
        return;
      }

      // Format data secara manual menggunakan Map dengan pengaman tambahan
      const formattedData = rawData.map((item: any, index: number) => {
        try {
          const customerData = item.customer_id ? customerMap.get(item.customer_id) : (item.customerId ? customerMap.get(item.customerId) : null);
          const staffData = item.staff_id ? staffMap.get(item.staff_id) : (item.staffId ? staffMap.get(item.staffId) : null);
          
          const customerName = typeof customerData === 'object' ? customerData?.name : customerData;
          const customerPhone = typeof customerData === 'object' ? customerData?.phone : "-";
          
          // Debugging staf: cek berbagai kemungkinan field staff
          let staffName = "-";
          
          // 1. Cek dari staffData (hasil lookup manual di baris 112)
          if (typeof staffData === 'object' && staffData?.name) {
            staffName = staffData.name;
          } 
          // 2. Jika staffData string (mungkin ID atau nama langsung)
          else if (typeof staffData === 'string' && staffData !== "-") {
            staffName = staffData;
          }
          // 3. Cek lookup manual dari staff_id/staffId mentah di item
          else {
            const rawStaffId = item.staff_id || item.staffId;
            if (rawStaffId) {
              const lookupName = staffMap.get(Number(rawStaffId)) || staffMap.get(String(rawStaffId));
              if (lookupName) {
                staffName = typeof lookupName === 'object' ? (lookupName as any).name : lookupName;
              }
            }
          }

          // 4. Fallback ke field nama langsung jika ada
          if (staffName === "-" || !staffName) {
            if (item.staff_name || item.staffName) {
              staffName = item.staff_name || item.staffName;
            } else if (Array.isArray(item.items) && item.items.length > 0) {
              const firstItemWithStaff = item.items.find((i: any) => i.staffName || i.staff_name || i.staff_id || i.staffId);
              if (firstItemWithStaff) {
                const sVal = firstItemWithStaff.staffName || firstItemWithStaff.staff_name;
                if (sVal) {
                  staffName = sVal;
                } else {
                  const sId = firstItemWithStaff.staff_id || firstItemWithStaff.staffId;
                  const lName = staffMap.get(Number(sId)) || staffMap.get(String(sId));
                  if (lName) staffName = typeof lName === 'object' ? (lName as any).name : lName;
                }
              }
            }
          }
          
          if (!staffName) staffName = "-";
          
          // Ambil nama-nama layanan dari array items
          let itemNames = "-";
          try {
            if (Array.isArray(item.items)) {
              itemNames = item.items.map((i: any) => {
                // Berdasarkan api/routes/transactions-supabase.ts, field-nya adalah service_id atau serviceName
                const sId = i.service_id || i.serviceId;
                return i.service_name || i.serviceName || serviceMap.get(Number(sId)) || serviceMap.get(String(sId)) || "Layanan dihapus";
              }).join(", ");
            }
          } catch (e) {
            console.warn("Error parsing items for row", index, e);
          }

          // Hitung atau ambil nilai harga dengan pengecekan field database yang sangat teliti
          // Berdasarkan kasir.tsx, field yang dikirim adalah: subtotal, discount, tax, total
          const subtotalValue = Number(item.subtotal || item.total_price || item.totalPrice || 0);
          const discountValue = Number(item.discount || 0);
          const taxValue = Number(item.tax || 0);
          // Prioritaskan 'total' (dari kasir.tsx) atau 'total_amount' (dari API)
          const totalAmount = Number(item.total || item.total_amount || item.final_price || item.finalPrice || (subtotalValue - discountValue + taxValue));

          return {
            "No": index + 1,
            "Tanggal": item.created_at ? new Date(item.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-",
            "Waktu": item.created_at ? new Date(item.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-",
            "Nama Pelanggan": customerName || "Umum",
            "No. Telepon": customerPhone || "-",
            "Daftar Layanan": itemNames,
            "Staf": staffName,
            "Pembayaran": item.payment_method?.toUpperCase() || "-",
            "Total (Rp)": subtotalValue,
            "Diskon (Rp)": discountValue,
            "PPN (Rp)": taxValue,
            "Total Akhir (Rp)": totalAmount
          };
        } catch (err) {
          console.error("Error formatting row", index, item, err);
          return {
            "No": index + 1,
            "Tanggal & Waktu": "Error data",
            "Nama Pelanggan": "Error",
            "No. Telepon": "-",
            "Daftar Layanan": "-",
            "Staf": "-",
            "Metode Pembayaran": "-",
            "Total (Rp)": 0,
            "Diskon (Rp)": 0,
            "PPN (Rp)": 0,
            "Total Akhir (Rp)": 0
          };
        }
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(formattedData);

      const headerAlignByCol: ("left" | "center" | "right")[] = [
        "center", // No
        "center", // Tanggal
        "center", // Waktu
        "left",   // Nama Pelanggan
        "center",   // No. Telepon
        "left",   // Daftar Layanan
        "center",   // Staf
        "center", // Pembayaran
        "right",  // Total (Rp)
        "right",  // Diskon (Rp)
        "right",  // PPN (Rp)
        "right",  // Total Akhir (Rp)
      ];
      const bodyAlignByCol: ("left" | "center" | "right")[] = [
        "center", // No
        "center", // Tanggal
        "center", // Waktu
        "left",   // Nama Pelanggan
        "center",   // No. Telepon
        "left",   // Daftar Layanan
        "center",   // Staf
        "center", // Pembayaran
        "right",  // Total (Rp)
        "right",  // Diskon (Rp)
        "right",  // PPN (Rp)
        "right",  // Total Akhir (Rp)
      ];

      const styleCell = (r: number, c: number, horizontal: "left" | "center" | "right", isHeader: boolean) => {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell: any = ws[addr];
        if (!cell) return;
        const existing = cell.s || {};
        
        // Warna selang-seling: Kuning Soft (FFF9C4) dan Biru Soft (E3F2FD)
        // Baris data pertama (r=1) adalah ganjil, r=2 genap, dst.
        const isEvenRow = r % 2 === 0;
        const rowColor = isEvenRow ? "E3F2FD" : "FFF9C4";

        cell.s = {
          ...existing,
          alignment: {
            ...(existing.alignment || {}),
            horizontal,
            vertical: "center",
          },
          ...(isHeader
            ? { 
                font: { ...(existing.font || {}), bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "000000" } }
              }
            : {
                fill: { fgColor: { rgb: rowColor } }
              }),
        };
      };

      const styleRange = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let c = styleRange.s.c; c <= styleRange.e.c; c++) {
        styleCell(styleRange.s.r, c, headerAlignByCol[c] || "left", true);
      }
      for (let r = styleRange.s.r + 1; r <= styleRange.e.r; r++) {
        for (let c = styleRange.s.c; c <= styleRange.e.c; c++) {
          styleCell(r, c, bodyAlignByCol[c] || "left", false);
        }
      }

      // Format kolom uang agar tampil ribuan (contoh 15.000) tetapi tetap numeric
      // Setelah pemisahan tanggal & waktu, kolom uang ada di I-L: Total, Diskon, PPN, Total Akhir
      const moneyColIndexes = [8, 9, 10, 11];
      const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
      for (let r = range.s.r + 1; r <= range.e.r; r++) {
        for (const c of moneyColIndexes) {
          const addr = XLSX.utils.encode_cell({ r, c });
          const cell: any = ws[addr];
          if (!cell) continue;

          // pastikan bertipe number
          if (typeof cell.v === "string") {
            const parsed = Number(String(cell.v).replace(/\./g, "").replace(/,/g, "."));
            if (!Number.isNaN(parsed)) cell.v = parsed;
          }
          cell.t = "n";
          cell.z = "#,##0";
        }
      }

      // Atur lebar kolom agar rapi
      const wscols = [
        { wch: 5 },  // No
        { wch: 14 }, // Tanggal
        { wch: 10 }, // Waktu
        { wch: 20 }, // Nama Pelanggan
        { wch: 15 }, // No. Telepon
        { wch: 30 }, // Layanan
        { wch: 10 }, // Staf
        { wch: 15 }, // Metode
        { wch: 10 }, // Total
        { wch: 10 }, // Diskon
        { wch: 10 }, // PPN
        { wch: 15 }  // Total Akhir
      ];
      ws["!cols"] = wscols;

      XLSX.utils.book_append_sheet(wb, ws, "Riwayat Laporan");

      const dateStr = new Date().toISOString().split("T")[0];
      const fileName = `Laporan_Transaksi_Salon_${dateStr}.xlsx`;

      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
        const base64 = XLSX.write(wb, { type: "base64", bookType: "xlsx" });
        await Filesystem.writeFile({
          path: fileName,
          data: base64,
          directory: Directory.Documents,
        });

        const { uri } = await Filesystem.getUri({ path: fileName, directory: Directory.Documents });
        await Share.share({
          title: fileName,
          text: "Laporan transaksi",
          url: uri,
          dialogTitle: "Bagikan / Buka Excel",
        });
      } else {
        XLSX.writeFile(wb, fileName);
      }
      
      toast({
        title: "Berhasil",
        description: "Laporan riwayat transaksi berhasil diunduh",
        variant: "success",
      });
    } catch (error: any) {
      console.error("Export error:", error);
      toast({
        title: "Gagal Ekspor",
        description: error.message || "Terjadi kesalahan saat mengekspor data",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteReports = async () => {
    setIsDeleting(true);
    try {
      const tables = ["transactions", "appointments", "expenses", "customers", "staff", "services"];
      
      for (const table of tables) {
        const { error } = await supabase
          .from(table)
          .delete()
          .not("id", "is", null);
        
        if (error) {
          console.warn(`Warning: Could not clear table ${table}:`, error.message);
        }
      }

      toast({
        title: "Berhasil",
        description: "Semua data telah direset ke pengaturan pabrik",
        variant: "success",
      });
      setResetConfirmText("");
    } catch (error) {
      console.error("Error factory reset:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Gagal",
        description: `Gagal melakukan reset: ${message}`,
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteTransactions = async () => {
    setIsDeletingTransactions(true);
    try {
      const { error } = await supabase
        .from("transactions")
        .delete()
        .not("id", "is", null);

      if (error) throw error;

      toast({
        title: "Berhasil",
        description: "Semua data transaksi berhasil dihapus",
        variant: "success",
      });
    } catch (error) {
      console.error("Error deleting transactions:", error);
      const message = error instanceof Error ? error.message : String(error);
      toast({
        title: "Gagal",
        description: `Gagal menghapus data transaksi: ${message}`,
        variant: "destructive",
      });
    } finally {
      setIsDeletingTransactions(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="w-6 h-6" />
        <h1 className="text-xl font-bold">Pengaturan</h1>
      </div>

      <div className="grid gap-4">
        {/* Tampilan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Tampilan
            </CardTitle>
            <CardDescription>Sesuaikan tampilan aplikasi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app-brand">Nama Brand (Header)</Label>
              <Input
                id="app-brand"
                value={appBrand}
                onChange={(e) => setAppBrand(e.target.value)}
                placeholder="Contoh: qweenSalon"
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => setAppBrand(DEFAULT_APP_BRAND)}>
                  Reset Default
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {theme === "dark" ? <Moon className="w-4 h-4 text-primary" /> : <Sun className="w-4 h-4 text-primary" />}
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Mode Gelap</p>
                  <p className="text-xs text-muted-foreground">Aktifkan tema gelap</p>
                </div>
              </div>
              <Switch checked={theme === "dark"} onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")} />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-primary" />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">Ukuran Font</p>
                  <p className="text-xs text-muted-foreground">Sesuaikan ukuran teks</p>
                </div>
              </div>
              <Select value={fontSize} onValueChange={(val: any) => setFontSize(val)}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Pilih ukuran" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sm">Kecil</SelectItem>
                  <SelectItem value="base">Sedang</SelectItem>
                  <SelectItem value="lg">Besar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Notifikasi */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4" />
              Notifikasi
            </CardTitle>
            <CardDescription>Kelola notifikasi perangkat</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {permissionStatus !== "granted" && (
              <Button variant="outline" className="w-full border-primary text-primary hover:bg-primary/5" onClick={requestPermission}>
                Aktifkan Izin Notifikasi Perangkat
              </Button>
            )}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Notifikasi Janji</p>
                <p className="text-xs text-muted-foreground">Booking baru</p>
              </div>
              <Switch checked={notifSettings.appointments} onCheckedChange={(checked) => setNotifSettings({ ...notifSettings, appointments: checked })} />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Notifikasi Pembayaran</p>
                <p className="text-xs text-muted-foreground">Transaksi berhasil</p>
              </div>
              <Switch checked={notifSettings.payments} onCheckedChange={(checked) => setNotifSettings({ ...notifSettings, payments: checked })} />
            </div>
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => sendNotification("Tes Notifikasi", { body: "Sudah aktif!" })} disabled={permissionStatus !== "granted"}>
              Kirim Notifikasi Percobaan
            </Button>

            {Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android" && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Mode Background</p>
                    <p className="text-xs text-muted-foreground">Aktifkan layanan foreground agar notifikasi lebih stabil</p>
                  </div>
                  <Switch
                    checked={foregroundEnabled}
                    onCheckedChange={async (checked) => {
                      setForegroundEnabled(checked);
                      try {
                        if (checked) {
                          await ForegroundService.start();
                        } else {
                          await ForegroundService.stop();
                        }
                      } catch {
                        // ignore
                      }
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Pengingat Sholat</p>
                    <p className="text-xs text-muted-foreground">Notifikasi 10 menit sebelum waktu sholat</p>
                  </div>
                  <Switch
                    checked={prayerEnabled}
                    onCheckedChange={async (checked) => {
                      setPrayerEnabled(checked);
                      if (checked) {
                        await schedulePrayerReminders(prayerCity);
                      } else {
                        await cancelPrayerReminders();
                      }
                    }}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="prayer-city">Kota</Label>
                  <Input
                    id="prayer-city"
                    value={prayerCity}
                    readOnly
                    placeholder="Contoh: Jakarta"
                    disabled={!prayerEnabled}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={!prayerEnabled}
                    onClick={async () => {
                      await schedulePrayerReminders(prayerCity);
                    }}
                  >
                    Jadwalkan Ulang Hari Ini
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Keamanan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Keamanan & Data
            </CardTitle>
            <CardDescription>Pengaturan keamanan akun</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button 
              variant="outline" 
              className="w-full justify-start text-destructive hover:text-destructive"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>

                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={exportToExcel}
                    disabled={isExporting}
                  >
                    {isExporting ? (
                      <>
                        <FileSpreadsheet className="w-4 h-4 mr-2 animate-pulse" />
                        Mengekspor...
                      </>
                    ) : (
                      <>
                        <FileSpreadsheet className="w-4 h-4 mr-2" />
                       Download Laporan (Excel)
                      </>
                    )}
                  </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start" disabled={isDeletingTransactions}>
                  <Receipt className="w-4 h-4 mr-2" />
                  Hapus Data Transaksi
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Hapus Semua Transaksi?</AlertDialogTitle>
                  <AlertDialogDescription className="text-center text-destructive">
                    Data transaksi akan dihapus permanen.
                    <br /><br />
                    <Input value={deleteTxConfirmText} onChange={(e) => setDeleteTxConfirmText(e.target.value)} placeholder={`Ketik ${DELETE_TX_CONFIRM_PHRASE}`} className="mx-auto max-w-xs text-center text-red-500 placeholder:text-red-500" />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setDeleteTxConfirmText("")}>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteTransactions} disabled={deleteTxConfirmText.trim().toUpperCase() !== DELETE_TX_CONFIRM_PHRASE} className="bg-destructive text-destructive-foreground">
                    Ya, Hapus
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start" disabled={isDeleting}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Reset Pengaturan Pabrik
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Pengaturan Pabrik?</AlertDialogTitle>
                  <AlertDialogDescription className="text-center text-destructive">
                    Semua data (Layanan, Pelanggan, Staf, Transaksi) akan dihapus.
                    <br /><br />
                    <Input value={resetConfirmText} onChange={(e) => setResetConfirmText(e.target.value)} placeholder={`Ketik ${RESET_CONFIRM_PHRASE}`} className="mx-auto max-w-xs text-center text-red-500 placeholder:text-red-500" />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setResetConfirmText("")}>Batal</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteReports} disabled={resetConfirmText.trim().toUpperCase() !== RESET_CONFIRM_PHRASE} className="bg-destructive text-destructive-foreground">
                    Ya, Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Nota / Struk */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-4 h-4" />
              Nota / Struk
            </CardTitle>
            <CardDescription>Atur teks yang tampil di nota/struk</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="receipt-company">Nama Company</Label>
              <Input
                id="receipt-company"
                value={receiptSettings.companyName}
                onChange={(e) => setReceiptSettings((p: any) => ({ ...p, companyName: e.target.value }))}
                placeholder="Nama usaha"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="receipt-tagline">Tagline</Label>
              <Input
                id="receipt-tagline"
                value={receiptSettings.tagline}
                onChange={(e) => setReceiptSettings((p: any) => ({ ...p, tagline: e.target.value }))}
                placeholder="Contoh: Tempatnya Perawatan Kecantikan"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="receipt-phone">whatsapp</Label>
              <Input
                id="receipt-phone"
                value={receiptSettings.phone}
                onChange={(e) => setReceiptSettings((p: any) => ({ ...p, phone: e.target.value }))}
                placeholder="Contoh: +62 8xx-xxxx-xxxx"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="receipt-footer-1">Footer Baris 1</Label>
              <Input
                id="receipt-footer-1"
                value={receiptSettings.footerLine1}
                onChange={(e) => setReceiptSettings((p: any) => ({ ...p, footerLine1: e.target.value }))}
                placeholder="Contoh: Terima Kasih"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="receipt-footer-2">Footer Baris 2</Label>
              <Input
                id="receipt-footer-2"
                value={receiptSettings.footerLine2}
                onChange={(e) => setReceiptSettings((p: any) => ({ ...p, footerLine2: e.target.value }))}
                placeholder="Contoh: www.websiteanda.com"
              />
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="receipt-qr-enabled">QR Code di Struk</Label>
                  <p className="text-xs text-muted-foreground">Tampilkan QR Code saat cetak struk</p>
                </div>
                <Switch
                  id="receipt-qr-enabled"
                  checked={!!(receiptSettings as any).qrEnabled}
                  onCheckedChange={(v) => setReceiptSettings((p: any) => ({ ...p, qrEnabled: v }))}
                />
              </div>

              <div className="grid gap-2">
                <Label>Isi QR Code</Label>
                <Select
                  value={((receiptSettings as any).qrMode ?? "website") as any}
                  onValueChange={(val: any) => setReceiptSettings((p: any) => ({ ...p, qrMode: val }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih isi QR" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receipt">Teks No. Struk (Tanpa QR)</SelectItem>
                    <SelectItem value="website">Website (Footer Baris 2)</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {((receiptSettings as any).qrMode ?? "website") === "custom" && (
                <div className="grid gap-2">
                  <Label htmlFor="receipt-qr-custom">QR Custom</Label>
                  <Input
                    id="receipt-qr-custom"
                    value={(receiptSettings as any).qrCustom ?? ""}
                    onChange={(e) => setReceiptSettings((p: any) => ({ ...p, qrCustom: e.target.value }))}
                    placeholder="Contoh: https://websiteanda.com"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                className="w-full"
                onClick={() => {
                  try {
                    localStorage.setItem(RECEIPT_SETTINGS_STORAGE_KEY, JSON.stringify(receiptSettings));
                    toast({ title: "Berhasil", description: "Pengaturan nota berhasil disimpan", variant: "success" });
                  } catch {
                    toast({ title: "Gagal", description: "Tidak dapat menyimpan ke localStorage", variant: "destructive" });
                  }
                }}
              >
                Simpan
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setReceiptSettings(DEFAULT_RECEIPT_SETTINGS);
                  toast({ title: "Berhasil", description: "Pengaturan nota dikembalikan ke default", variant: "success" });
                }}
              >
                Reset Default
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Bantuan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-4 h-4" />
              Bantuan
            </CardTitle>
            <CardDescription>Dapatkan bantuan teknis</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <BookOpen className="w-4 h-4 mr-2" />
                  Panduan Penggunaan
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" />
                    Panduan Penggunaan Aplikasi
                  </DialogTitle>
                  <DialogDescription className="text-left ml-7">
                    Panduan Aplikasi ELKasirApps v.1.0
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-6 py-4">
                  {/* Overview */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-4 rounded-lg border bg-muted/50">
                      <Settings className="h-5 w-5 text-primary" />
                      <div>
                        <p className="text-sm font-bold">Management System</p>
                        <p className="text-xs text-muted-foreground">Sistem manajemen salon modern dan terintegrasi</p>
                      </div>
                    </div>
                  </div>

                  {/* Main Features */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Fitur Utama
                    </h3>
                    <div className="grid gap-3">
                      <div className="flex items-start gap-3 p-3 rounded-md border">
                        <Users className="h-4 w-4 mt-0.5 text-blue-500" />
                        <div>
                          <p className="text-sm font-medium">Manajemen Pelanggan</p>
                          <p className="text-xs text-muted-foreground">Tambah, edit, dan kelola data pelanggan dengan mudah</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-md border">
                        <Calendar className="h-4 w-4 mt-0.5 text-green-500" />
                        <div>
                          <p className="text-sm font-medium">Penjadwalan Janji Temu</p>
                          <p className="text-xs text-muted-foreground">Kelola janji temu dan booking pelanggan secara efisien</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-md border">
                        <DollarSign className="h-4 w-4 mt-0.5 text-yellow-500" />
                        <div>
                          <p className="text-sm font-medium">Manajemen Layanan & Harga</p>
                          <p className="text-xs text-muted-foreground">Atur layanan, harga, dan promosi salon</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 rounded-md border">
                        <FileText className="h-4 w-4 mt-0.5 text-purple-500" />
                        <div>
                          <p className="text-sm font-medium">Laporan & Analitik</p>
                          <p className="text-xs text-muted-foreground">Pantau performa bisnis dengan laporan detail</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Quick Start Guide */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <BookOpen className="w-4 h-4" />
                      Panduan Mulai Cepat
                    </h3>
                    <div className="space-y-3">
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">1</div>
                        <div>
                          <p className="text-sm font-medium">Setup Data Dasar</p>
                          <p className="text-xs text-muted-foreground">Tambah layanan, harga, dan informasi staf salon</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">2</div>
                        <div>
                          <p className="text-sm font-medium">Registrasi Pelanggan</p>
                          <p className="text-xs text-muted-foreground">Input data pelanggan dan preferensi layanan</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">3</div>
                        <div>
                          <p className="text-sm font-medium">Buat Janji Temu</p>
                          <p className="text-xs text-muted-foreground">Jadwalkan appointment dan konfirmasi ke pelanggan</p>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">4</div>
                        <div>
                          <p className="text-sm font-medium">Proses Transaksi</p>
                          <p className="text-xs text-muted-foreground">Catat layanan yang diberikan dan proses pembayaran</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <p className="text-[10px] text-center w-full text-muted-foreground italic">
                    Panduan Penggunaan Aplikasi ELKasirApps v1.0
                  </p>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full justify-start">
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Hubungi Support
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-primary">
                    <HelpCircle className="w-5 h-5 text-primary" />
                    Dukungan Teknis
                  </DialogTitle>
                  <DialogDescription className="text-left">Copyright © 2026 ELkasirApps v 1.0</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/50">
                    <div>
                      <p className="text-sm font-bold">EL Project Development</p>
                      <p className="text-xs text-muted-foreground">Official System Developer</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <a href="mailto:support@elproject.dev" className="flex items-center gap-3 p-3 rounded-md hover:bg-muted transition-colors group">
                      <Mail className="h-4 w-4" />
                      <span className="text-sm">elproject.dev@gmail.com</span>
                      <ExternalLink className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100" />
                    </a>
                    <a href="https://wa.me/628123456789" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-md hover:bg-muted transition-colors group">
                      <Phone className="h-4 w-4" />
                      <span className="text-sm">+62 838-6718-0887</span>
                      <ExternalLink className="h-3 w-3 ml-auto opacity-0 group-hover:opacity-100" />
                    </a>
                  </div>
                </div>
                <DialogFooter>
                  <p className="text-[10px] text-center w-full text-muted-foreground italic">Kami Siap Membantu Anda Setiap Saat</p>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
