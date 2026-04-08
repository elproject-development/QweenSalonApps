import { useGetDashboardSummary, useGetRevenueChart, useGetTopServices, useGetRecentTransactions } from "@/lib/api-client-react";
import { formatRupiah } from "@/lib/format";
import { mockSummary, mockChartData, mockTopServices, mockRecentTransactions } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Users, Receipt, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export function Dashboard() {
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("today");
  
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({ period });
  const chartPeriod = period === "today" ? "week" : period === "month" ? "year" : period;
  const { data: chartData = [], isLoading: loadingChart } = useGetRevenueChart({ period: chartPeriod });
  const { data: topServices = [], isLoading: loadingTop } = useGetTopServices();
  const { data: recentTransactions = [], isLoading: loadingRecent } = useGetRecentTransactions({ limit: 5 });

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
    const s = String(label);

    if (chartPeriod === "year") {
      const idx = monthIndexFromLabel(s);
      if (idx != null) return monthLabels[idx] ?? s;
    }

    if (chartPeriod === "week") {
      // For weekly chart (period "week"), show M1, M2, M3... format
      if (s.toLowerCase().startsWith("minggu")) {
        const num = s.replace(/^minggu\s*/i, "");
        return `M${num}`;
      }
      
      // For daily chart (period "today"), convert day labels
      const dayIdx = (() => {
        const cleaned = String(s).trim();

        const direct = dayLabels.findIndex((d) => d.toLowerCase() === cleaned.toLowerCase());
        if (direct >= 0) return direct;

        const enMap: Record<string, number> = {
          mon: 0,
          tue: 1,
          wed: 2,
          thu: 3,
          fri: 4,
          sat: 5,
          sun: 6,
        };
        const key3 = cleaned.slice(0, 3).toLowerCase();
        if (key3 in enMap) return enMap[key3];

        const d = new Date(cleaned);
        if (!Number.isNaN(d.getTime())) {
          const js = d.getDay();
          const map = [6, 0, 1, 2, 3, 4, 5];
          return map[js] ?? null;
        }

        return null;
      })();

      if (dayIdx != null) return dayLabels[dayIdx] ?? s;
    }

    return s;
  };

  const formatTooltipLabel = (label: any, payload?: any) => {
    if (label == null) return "";
    if (chartPeriod === "year") {
      const idx = monthIndexFromLabel(label);
      if (idx != null) return monthLabelsFull[idx] ?? String(label);
      return String(label);
    }

    if (chartPeriod !== "week") return formatXAxisLabel(label);

    // For daily chart (period "today"), show day with date
    if (payload?.date) {
      const date = new Date(payload.date);
      if (!Number.isNaN(date.getTime())) {
        const dayIdx = dayLabels.findIndex((d) => String(label).trim().toLowerCase() === d.toLowerCase());
        const dayName = dayIdx >= 0 ? dayLabelsFull[dayIdx] : String(label);
        const dateNum = date.getDate();
        const monthName = monthLabels[date.getMonth()];
        const year = date.getFullYear();
        return `${dayName}, ${dateNum} ${monthName} ${year}`;
      }
    }

    // For weekly chart (period "week"), show week label with date range
    if (payload?.dateRange) {
      const startDate = new Date(payload.dateRange.start);
      const endDate = new Date(payload.dateRange.end);
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        const startDay = startDate.getDate();
        const endDay = endDate.getDate();
        const startMonth = monthLabels[startDate.getMonth()];
        const endMonth = monthLabels[endDate.getMonth()];
        const year = startDate.getFullYear();
        
        if (startMonth === endMonth) {
          if (startDay === endDay) {
            return `${label} (${startDay} ${startMonth} ${year})`;
          }
          return `${label} (${startDay} - ${endDay} ${startMonth} ${year})`;
        } else {
          return `${label} (${startDay} ${startMonth} - ${endDay} ${endMonth} ${year})`;
        }
      }
    }
    return String(label);
  };

  // Year labels for 8 years (2026-2034)
  const yearLabels = ["2026", "2027", "2028", "2029", "2030", "2031", "2032", "2033", "2034"];
  
  // Monthly chart data (12 months) - for period "month"
  const monthlyChartData = useMemo(() => {
    const base = monthLabels.map((m) => ({ label: m, revenue: 0 }));
    for (const p of displayChartData as Array<any>) {
      const idx = monthIndexFromLabel(p?.label);
      if (idx == null) continue;
      base[idx] = { label: monthLabels[idx], revenue: Number(p?.revenue ?? 0) || 0 };
    }
    return base;
  }, [displayChartData]);

  // Yearly chart data (8 years) - for period "year"
  const normalizedYearlyChartData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    
    // Build 8 years of data
    const base = yearLabels.map((year) => ({
      label: year,
      revenue: 0,
      year: parseInt(year)
    }));

    // Aggregate revenue by year from displayChartData (which contains monthly data)
    for (const p of (displayChartData as Array<any>) || []) {
      const raw = p?.label;
      if (raw == null) continue;
      
      const cleaned = String(raw).trim();
      
      // Try to extract year from the label
      // Labels could be "Jan", "Feb", etc. or "2026-01", "2026-02", etc.
      let yearIdx = -1;
      
      // Check if label contains a year
      const yearMatch = cleaned.match(/\b(20\d{2})\b/);
      if (yearMatch) {
        const yearStr = yearMatch[1];
        yearIdx = yearLabels.indexOf(yearStr);
      }
      
      // If no year found, assume current year's data
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

    // Hide future years by setting revenue to null
    const currentYearIdx = yearLabels.indexOf(String(currentYear));
    return base.map((item, idx) => ({
      ...item,
      revenue: idx <= currentYearIdx ? item.revenue : null
    }));
  }, [displayChartData, yearLabels]);

  // Select which chart data to use for year period
  const normalizedChartData = useMemo(() => {
    if (chartPeriod !== "year") return displayChartData;
    // Use monthly chart for "month" period, yearly chart for "year" period
    return period === "month" ? monthlyChartData : normalizedYearlyChartData;
  }, [chartPeriod, period, monthlyChartData, normalizedYearlyChartData, displayChartData]);

  // Calculate dates for each day of current week (Monday to Sunday) - for daily chart
  const weekDates = useMemo(() => {
    const today = new Date();
    const jsDay = today.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
    
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    return dayLabels.map((_, idx) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + idx);
      return date;
    });
  }, [dayLabels]);

  // Daily chart data (7 days) - for period "today"
  const dailyChartData = useMemo(() => {
    if (chartPeriod !== "week") return normalizedChartData;

    const base = dayLabels.map((d, idx) => ({ 
      label: d, 
      revenue: 0,
      date: weekDates[idx].toISOString()
    }));

    for (const p of (displayChartData as Array<any>) || []) {
      const idx = (() => {
        const raw = p?.label;
        if (raw == null) return null;
        const cleaned = String(raw).trim();

        const direct = dayLabels.findIndex((d) => d.toLowerCase() === cleaned.toLowerCase());
        if (direct >= 0) return direct;

        const enMap: Record<string, number> = {
          mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
        };
        const key3 = cleaned.slice(0, 3).toLowerCase();
        if (key3 in enMap) return enMap[key3];

        const d = new Date(cleaned);
        if (!Number.isNaN(d.getTime())) {
          const js = d.getDay();
          const map = [6, 0, 1, 2, 3, 4, 5];
          return map[js] ?? null;
        }

        return null;
      })();

      if (idx == null) continue;
      const rev = Number(p?.revenue ?? 0) || 0;
      base[idx] = { ...base[idx], label: dayLabels[idx], revenue: (Number(base[idx].revenue) || 0) + rev, date: base[idx].date };
    }

    // Hide bars for future days
    const jsDay = new Date().getDay();
    const currentDayIndex = jsDay === 0 ? 6 : jsDay - 1;

    return base.map((item, idx) => ({
      ...item,
      revenue: idx <= currentDayIndex ? item.revenue : null
    }));
  }, [chartPeriod, dayLabels, displayChartData, normalizedChartData, weekDates]);

  // Calculate 8 weeks (2 months) - for weekly chart
  const weekLabels = ["Minggu 1", "Minggu 2", "Minggu 3", "Minggu 4", "Minggu 5", "Minggu 6", "Minggu 7", "Minggu 8"];
  
  const twoMonthWeekDates = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const weeks = [];
    for (let w = 0; w < 8; w++) {
      let startDay: number, m: number, y: number;
      if (w < 4) {
        m = month;
        y = year;
        startDay = w * 7 + 1;
      } else {
        m = month + 1;
        y = month + 1 > 11 ? year + 1 : year;
        startDay = (w - 4) * 7 + 1;
      }
      
      const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
      const endDay = Math.min(startDay + 6, lastDayOfMonth);
      
      if (startDay <= lastDayOfMonth) {
        weeks.push({
          start: new Date(y, m, startDay),
          end: new Date(y, m, endDay),
          weekNum: w + 1
        });
      }
    }
    return weeks;
  }, []);

  // Weekly chart data (8 weeks) - for period "week"
  const weeklyChartData = useMemo(() => {
    const today = new Date();
    
    // Determine current week index (0-7)
    let currentWeekIdx = 0;
    for (let i = 0; i < twoMonthWeekDates.length; i++) {
      const week = twoMonthWeekDates[i];
      if (today >= week.start && today <= week.end) {
        currentWeekIdx = i;
        break;
      }
    }

    // Build 8 weeks of data
    const base = weekLabels.slice(0, twoMonthWeekDates.length).map((label, idx) => {
      const weekData = twoMonthWeekDates[idx];
      return {
        label,
        revenue: 0,
        dateRange: weekData ? {
          start: weekData.start.toISOString(),
          end: weekData.end.toISOString()
        } : null
      };
    });

    // Map day labels to dates for the past 7 days
    const jsDay = today.getDay();
    const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
    
    const dayLabelToDate = new Map<string, Date>();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - (dayOfWeek - i));
      d.setHours(0, 0, 0, 0);
      dayLabelToDate.set(dayLabels[i], d);
    }

    // Aggregate revenue by week from displayChartData
    for (const p of (displayChartData as Array<any>) || []) {
      const raw = p?.label;
      if (raw == null) continue;
      
      const cleaned = String(raw).trim();
      
      const date = dayLabelToDate.get(cleaned);
      if (!date) {
        const d = new Date(cleaned);
        if (Number.isNaN(d.getTime())) continue;
        
        for (let i = 0; i < twoMonthWeekDates.length; i++) {
          const week = twoMonthWeekDates[i];
          if (d >= week.start && d <= week.end) {
            const rev = Number(p?.revenue ?? 0) || 0;
            base[i] = {
              ...base[i],
              revenue: (Number(base[i].revenue) || 0) + rev
            };
            break;
          }
        }
      } else {
        for (let i = 0; i < twoMonthWeekDates.length; i++) {
          const week = twoMonthWeekDates[i];
          if (date >= week.start && date <= week.end) {
            const rev = Number(p?.revenue ?? 0) || 0;
            base[i] = {
              ...base[i],
              revenue: (Number(base[i].revenue) || 0) + rev
            };
            break;
          }
        }
      }
    }

    return base.map((item, idx) => ({
      ...item,
      revenue: idx <= currentWeekIdx ? item.revenue : null
    }));
  }, [displayChartData, twoMonthWeekDates, dayLabels]);

  // Select which chart data to use based on period
  const normalizedWeekChartData = useMemo(() => {
    if (chartPeriod !== "week") return normalizedChartData;
    // Use daily chart for "today" period, weekly chart for "week" period
    return period === "today" ? dailyChartData : weeklyChartData;
  }, [chartPeriod, period, dailyChartData, weeklyChartData, normalizedChartData]);

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
                    data={chartPeriod === "week" ? normalizedWeekChartData : normalizedChartData}
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
                        // payload is an array, get the first item's payload
                        const data = Array.isArray(payload) ? payload[0]?.payload : payload?.payload;
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
    </div>
  );
}
