import { useGetDashboardSummary, useGetRevenueChart, useGetTopServices, useGetRecentTransactions, useGetStaffSalesReport } from "@/lib/api-client-react";
import { formatRupiah } from "@/lib/format";
import { mockSummary, mockChartData, mockTopServices, mockRecentTransactions } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/ui/date-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, Receipt, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useToast } from "@/hooks/use-toast";

export function Dashboard() {
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("today");
  const [staffStartDate, setStaffStartDate] = useState<string>("");
  const [staffEndDate, setStaffEndDate] = useState<string>("");
  const { toast } = useToast();

  const handleConfirmDateFilter = () => {
    const formatDate = (dateStr: string) => {
      if (!dateStr) return "";
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      return dateStr;
    };

    if (staffStartDate && staffEndDate) {
      toast({
        title: "Filter tanggal diterapkan",
        description: `${formatDate(staffStartDate)} sampai ${formatDate(staffEndDate)}`,
        variant: "success",
      });
    } else if (staffStartDate || staffEndDate) {
      toast({
        title: "Tanggal tidak lengkap",
        description: "Mohon isi tanggal mulai dan tanggal akhir",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Filter periode default",
        description: "Menggunakan filter periode default",
      });
    }
  };

  const toDateOnlyString = (d: Date) => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const startOfWeekMonday = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const dayIndexMon0 = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - dayIndexMon0);
    return x;
  };
  
  const summaryRange = useMemo(() => {
    const now = new Date();
    const todayStr = toDateOnlyString(now);
    let startDateStr = todayStr;
    
    if (period === "week") {
      // Samakan dengan bulanan: dari tanggal 1 bulan berjalan
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      startDateStr = toDateOnlyString(start);
    } else if (period === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      startDateStr = toDateOnlyString(start);
    } else if (period === "year") {
      const start = new Date(2026, 0, 1);
      startDateStr = toDateOnlyString(start);
    }
    
    return {
      period,
      startDate: startDateStr,
      endDate: todayStr,
    };
  }, [period]);

  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary(summaryRange);
  const chartPeriod = period === "month" ? "year" : period;
  const { data: chartData = [], isLoading: loadingChart } = useGetRevenueChart({ period: chartPeriod });
  const { data: topServices = [], isLoading: loadingTop } = useGetTopServices();
  const { data: recentTransactions = [], isLoading: loadingRecent } = useGetRecentTransactions({ limit: 5 });

  const staffReportRange = useMemo(() => {
    // Jika filter tanggal custom diaktifkan, gunakan tanggal tersebut
    if (staffStartDate && staffEndDate) {
      const start = new Date(staffStartDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(staffEndDate);
      end.setHours(23, 59, 59, 999);
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    }

    // Gunakan periode default jika filter tanggal tidak aktif
    const end = new Date();
    const start = new Date(end);
    if (period === "today") {
      start.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      // Samakan dengan bulanan: dari tanggal 1 bulan berjalan
      const startOfMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      start.setTime(startOfMonth.getTime());
    } else if (period === "month") {
      const startOfMonth = new Date(end.getFullYear(), end.getMonth(), 1);
      start.setTime(startOfMonth.getTime());
    } else {
      const startOfYear = new Date(2026, 0, 1);
      start.setTime(startOfYear.getTime());
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    };
  }, [period, staffStartDate, staffEndDate]);

  const { data: staffSalesReport = [], isLoading: loadingStaffSales } = useGetStaffSalesReport(staffReportRange);

  // Use empty arrays/objects as fallback instead of mock data when data is explicitly empty
  const displaySummary = summary || { revenue: 0, transactionCount: 0, customerCount: 0, appointmentCount: 0 };
  const displayChartData = chartData;
  const displayTopServices = topServices;
  const displayRecentTransactions = recentTransactions;

  const [animatedRevenue, setAnimatedRevenue] = useState<number>(0);
  const revenueAnimRef = useRef<number | null>(null);
  const prevRevenueRef = useRef<number>(0);

  useEffect(() => {
    if (loadingSummary) return;

    const target = Number(displaySummary.revenue ?? 0) || 0;
    const from = prevRevenueRef.current;
    prevRevenueRef.current = target;

    if (revenueAnimRef.current != null) {
      cancelAnimationFrame(revenueAnimRef.current);
      revenueAnimRef.current = null;
    }

    if (from === target) {
      setAnimatedRevenue(target);
      return;
    }

    const durationMs = 650;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (target - from) * eased);
      setAnimatedRevenue(value);

      if (t < 1) {
        revenueAnimRef.current = requestAnimationFrame(tick);
      } else {
        revenueAnimRef.current = null;
      }
    };

    revenueAnimRef.current = requestAnimationFrame(tick);

    return () => {
      if (revenueAnimRef.current != null) {
        cancelAnimationFrame(revenueAnimRef.current);
        revenueAnimRef.current = null;
      }
    };
  }, [displaySummary.revenue, loadingSummary]);

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const monthLabelsFull = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];
  const dayLabels = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
  const dayLabelsFull = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  const monthIndexFromLabel = (label: any): number | null => {
    if (label == null) return null;
    const s = String(label).trim();

    const m1 = s.match(/^(\d{4})-(\d{2})$/);
    if (m1) {
      const idx = Number(m1[2]) - 1;
      return idx >= 0 && idx <= 11 ? idx : null;
    }

    const n = Number(s);
    if (!Number.isNaN(n) && n >= 1 && n <= 12) return n - 1;

    const idx = monthLabels.findIndex((m) => m.toLowerCase() === s.toLowerCase());
    return idx >= 0 ? idx : null;
  };

  const formatXAxisLabel = (label: any) => {
    if (label == null) return "";
    const s = String(label).trim();

    if (chartPeriod === "year") {
      const idx = monthIndexFromLabel(s);
      if (idx != null) return monthLabels[idx] ?? s;
    }

    if (chartPeriod === "week" && /^m\d+$/i.test(s)) {
      return s.toUpperCase();
    }

    // For daily chart (DD/MM format), show only DD
    if (chartPeriod === "today") {
      const parts = s.split("/");
      if (parts.length === 2) {
        return parts[0]; // Return only day
      }
    }

    return s;
  };

  const formatTooltipLabel = (label: any, payload?: any) => {
    if (label == null) return "";
    const s = String(label).trim();

    if (chartPeriod === "year") {
      const idx = monthIndexFromLabel(s);
      if (idx != null) return monthLabelsFull[idx] ?? s;
      return s;
    }

    if (chartPeriod === "week" && /^m\d+$/i.test(s)) {
      return s.toUpperCase();
    }

    // For date labels (e.g., 01/04), show fuller date if possible
    if (chartPeriod === "today" || chartPeriod === "week" || chartPeriod === "month") {
      // Try parsing DD/MM
      const parts = s.split('/');
      if (parts.length === 2) {
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]) - 1;
        if (!isNaN(d) && !isNaN(m)) {
          const year = new Date().getFullYear();
          return `${String(d).padStart(2, '0')} ${monthLabels[m]} ${year}`;
        }
      }
    }

    return s;
  };

  const yearLabels = ["2026", "2027", "2028", "2029", "2030", "2031", "2032", "2033", "2034"];

  const monthlyChartData = useMemo(() => {
    const base = monthLabels.map((m) => ({ label: m, revenue: 0 }));
    for (const p of displayChartData as Array<any>) {
      const idx = monthIndexFromLabel(p?.label);
      if (idx == null) continue;
      base[idx] = { label: monthLabels[idx], revenue: Number(p?.revenue ?? 0) || 0 };
    }
    return base;
  }, [displayChartData]);

  const normalizedYearlyChartData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const base = yearLabels.map((year) => ({
      label: year,
      revenue: 0,
      year: parseInt(year)
    }));

    for (const p of (displayChartData as Array<any>) || []) {
      const raw = p?.label;
      if (raw == null) continue;
      const cleaned = String(raw).trim();

      let yearIdx = -1;
      const yearMatch = cleaned.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        const yearStr = yearMatch[1];
        yearIdx = yearLabels.indexOf(yearStr);
      }
      if (yearIdx < 0) {
        yearIdx = yearLabels.indexOf(String(currentYear));
      }

      if (yearIdx >= 0) {
        const rev = Number(p?.revenue ?? 0) || 0;
        base[yearIdx] = {
          ...base[yearIdx],
          revenue: (Number(base[yearIdx].revenue) || 0) + rev
        };
      }
    }

    return base;
  }, [displayChartData, yearLabels]);

  const normalizedChartData = useMemo(() => {
    if (chartPeriod !== "year") return displayChartData;
    return normalizedYearlyChartData;
  }, [chartPeriod, normalizedYearlyChartData, displayChartData]);

  const finalChartData = useMemo(() => {
    if (period === "month") return monthlyChartData;
    if (chartPeriod === "year") return normalizedYearlyChartData;
    return normalizedChartData;
  }, [period, chartPeriod, monthlyChartData, normalizedYearlyChartData, normalizedChartData]);

  const staffSalesTotal = useMemo(() => {
    return (staffSalesReport ?? []).reduce((acc, row) => acc + (Number((row as any)?.totalRevenue ?? 0) || 0), 0);
  }, [staffSalesReport]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Ringkasan Bisnis</h1>
          <p className="text-muted-foreground text-xs">Pantau performa Glam Studio Anda hari ini.</p>
        </div>
        <Select value={period} onValueChange={(val: any) => setPeriod(val)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Pilih periode" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hari Ini</SelectItem>
            <SelectItem value="week">Minggu Ini</SelectItem>
            <SelectItem value="month">Bulan Ini</SelectItem>
            <SelectItem value="year">Tahun Ini</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Pendapatan</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-lg md:text-2xl font-bold text-primary">{formatRupiah(animatedRevenue)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Transaksi</CardTitle>
            <Receipt className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-lg md:text-2xl font-bold">{displaySummary.transactionCount}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Pelanggan</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-lg md:text-2xl font-bold">{displaySummary.customerCount}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Reservasi</CardTitle>
            <CalendarIcon className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-lg md:text-2xl font-bold">{displaySummary.appointmentCount}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
              <CardTitle>Grafik Pendapatan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] sm:h-[300px]">
                {loadingChart ? (
                  <Skeleton className="h-full w-full" />
                ) : displayChartData && displayChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={finalChartData}
                      margin={{ top: 12, right: 0, left: 0, bottom: 0 }}
                    >
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: isMobile ? 10 : 12, fill: "hsl(var(--muted-foreground))", textAnchor: "middle" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={formatXAxisLabel}
                        interval={(chartPeriod === "week" || chartPeriod === "year") ? 0 : "preserveEnd"}
                        tickMargin={10}
                        padding={{ left: 0, right: 0 }}
                        minTickGap={(chartPeriod === "week" || chartPeriod === "year") ? 0 : 12}
                      />
                      <YAxis hide />
                      <Tooltip
                        cursor={false}
                        labelFormatter={(value: any, payload: any) => {
                          const data = Array.isArray(payload) ? payload[0]?.payload : payload?.payload;
                          if (data?.range) return `${value} (${data.range})`;
                          return formatTooltipLabel(value, data);
                        }}
                        formatter={(value: any) => [formatRupiah(Number(value) || 0), "Pendapatan"]}
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 10,
                          boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                    Belum ada data pendapatan
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Layanan Terpopuler</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingTop ? (
                  Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
                ) : Array.isArray(displayTopServices) && displayTopServices.length > 0 ? (
                  displayTopServices.map((service) => (
                    <div key={service.serviceId} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-xs md:text-sm">{service.serviceName}</p>
                        <p className="text-[10px] md:text-xs text-muted-foreground">{service.count} kali</p>
                      </div>
                      <div className="text-xs md:text-sm font-semibold">{formatRupiah(service.revenue)}</div>
                    </div>
                  ))
                ) : (
                  <div className="text-center text-xs md:text-sm text-muted-foreground py-4">Belum ada data layanan</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="w-full">
          <CardHeader className="flex flex-col space-y-4 pb-4">
            <div className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold">Kalkulator Salon</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">Rincian performa anggota</p>
              </div>
              {!loadingStaffSales && staffSalesReport.length > 0 && (
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Total Omset</p>
                  <p className="text-xl font-black text-primary tracking-tight">{formatRupiah(staffSalesTotal)}</p>
                </div>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <DatePicker
                  value={staffStartDate}
                  onChange={setStaffStartDate}
                  placeholder="Tanggal Mulai"
                  className="text-xs"
                />
              </div>
              <div className="flex-1">
                <DatePicker
                  value={staffEndDate}
                  onChange={setStaffEndDate}
                  placeholder="Tanggal Akhir"
                  className="text-xs"
                />
              </div>
              <button
                onClick={handleConfirmDateFilter}
                className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-2 rounded-md font-medium transition-colors"
              >
                Konfirmasi
              </button>
              <button
                onClick={() => {
                  setStaffStartDate("");
                  setStaffEndDate("");
                }}
                className="text-xs bg-secondary hover:bg-secondary/80 text-secondary-foreground px-3 py-2 rounded-md font-medium transition-colors"
              >
                Reset
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingStaffSales ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
              </div>
            ) : Array.isArray(staffSalesReport) && staffSalesReport.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {staffSalesReport.map((row: any) => (
                  <div key={row.staffId} className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-transparent hover:border-primary/20 hover:bg-primary/5 transition-all group">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-bold group-hover:text-primary transition-colors">{row.staffName}</span>
                      <div className="flex items-center gap-1.5">
                        <span className="flex h-1.5 w-1.5 rounded-full bg-primary/40" />
                        <span className="text-[10px] font-medium text-muted-foreground">{row.totalTransactions} Transaksi</span>
                      </div>
                    </div>
                    <div className="text-sm font-black tabular-nums text-right">
                      {formatRupiah(row.totalRevenue)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 opacity-60">
                <Users className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm font-medium text-muted-foreground">Belum ada data penjualan staff</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
