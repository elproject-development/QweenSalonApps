import { useMemo, useState } from "react";
import { useGetDashboardSummary, useGetRevenueChart, useGetTopServices, useListCustomers, useListTransactions, useListExpenses } from "@/lib/api-client-react";
import { formatRupiah } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, CartesianGrid, Legend, Tooltip
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";
import { endOfDay, endOfMonth, endOfWeek, endOfYear, isWithinInterval, parseISO, startOfDay, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

const CHART_COLORS = ["#e8527a", "#f48fb1", "#f7c6d4", "#c62a66", "#ff8a9e"];

export function Laporan() {
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("month");
  const [chartPeriod, setChartPeriod] = useState<"week" | "month" | "year">("month");

  // For weekly filter, use month period in API call for summary
  const summaryPeriod = period === "week" ? "month" : period;
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({ period: summaryPeriod });
  // For monthly and yearly view, use month period to get 30 days of daily data, then aggregate by month
  const chartQueryPeriod = (chartPeriod === "month" || chartPeriod === "year") ? "month" : chartPeriod;
  const { data: chartData, isLoading: loadingChart } = useGetRevenueChart({ period: chartQueryPeriod });
  const { data: topServicesAllTime, isLoading: loadingTopAllTime } = useGetTopServices();
  const { data: customers, isLoading: loadingCustomers } = useListCustomers();
  const { data: transactions, isLoading: loadingTransactions } = useListTransactions();
  const { data: expenses, isLoading: loadingExpenses } = useListExpenses();

  const now = new Date();
  const periodRange = (() => {
    switch (period) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "week":
        // Use monthly range for weekly filter in summary cards
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "year":
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  })();

  const safeParseDate = (value: any): Date | null => {
    if (!value) return null;
    try {
      const d = typeof value === "string" ? parseISO(value) : new Date(value);
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const computedNewCustomers = (customers ?? []).filter((c: any) => {
    const createdAt = c?.createdAt ?? c?.created_at;
    if (!createdAt) return false;
    let createdDate: Date;
    try {
      createdDate = typeof createdAt === "string" ? parseISO(createdAt) : new Date(createdAt);
    } catch {
      return false;
    }
    if (isNaN(createdDate.getTime())) return false;
    return isWithinInterval(createdDate, periodRange);
  }).length;

  const newCustomersValue = summary?.newCustomers ?? computedNewCustomers;

  const computedExpenses = (expenses ?? []).filter((ex: any) => {
    const d = safeParseDate(ex?.date ?? ex?.createdAt ?? ex?.created_at);
    if (!d) return false;
    return isWithinInterval(d, periodRange);
  }).reduce((acc: number, ex: any) => acc + (Number(ex?.amount ?? 0) || 0), 0);

  const computedRevenue = (transactions ?? []).filter((tx: any) => {
    const d = safeParseDate(tx?.createdAt ?? tx?.created_at ?? tx?.date);
    if (!d) return false;
    return isWithinInterval(d, periodRange);
  }).reduce((acc: number, tx: any) => acc + (Number(tx?.total ?? tx?.total_amount ?? tx?.amount ?? 0) || 0), 0);

  const expensesValue = summary?.expenses ?? computedExpenses;
  const revenueValue = summary?.revenue ?? computedRevenue;
  const profitValue = summary?.profit ?? (revenueValue - expensesValue);

  const filteredTransactionsForTop = (transactions ?? []).filter((tx: any) => {
    const d = safeParseDate(tx?.createdAt ?? tx?.created_at ?? tx?.date);
    if (!d) return false;
    return isWithinInterval(d, periodRange);
  });

  const serviceMap = new Map<string, { count: number; revenue: number; name: string }>();
  filteredTransactionsForTop.forEach((tx: any) => {
    const items = tx?.items ?? tx?.services ?? tx?.transaction_items ?? tx?.details ?? [];
    if (Array.isArray(items)) {
      items.forEach((item: any) => {
        const serviceId = item?.serviceId ?? item?.service_id ?? item?.id ?? item?.service?.id;
        const serviceName = item?.serviceName ?? item?.service_name ?? item?.name ?? item?.service?.name ?? item?.services?.name ?? "Unknown";
        const price = Number(item?.price ?? item?.amount ?? item?.total ?? item?.subtotal ?? 0);
        const quantity = Number(item?.quantity || 1);
        const itemRevenue = price * quantity;
        
        if (serviceId || serviceName !== "Unknown") {
          const key = String(serviceId ?? serviceName);
          const existing = serviceMap.get(key);
          if (existing) {
            existing.count += quantity;
            existing.revenue += itemRevenue;
          } else {
            serviceMap.set(key, { count: quantity, revenue: itemRevenue, name: serviceName });
          }
        }
      });
    }
  });

  const topServices = Array.from(serviceMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((s, i) => ({
      serviceId: i,
      serviceName: s.name,
      count: s.count,
      revenue: s.revenue
    })) as Array<{ serviceId: number; serviceName: string; count: number; revenue: number }>;

  const loadingTop = loadingTransactions;

  const monthLabels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

  // Get 6 months starting from March (current month - 1)
  const getRolling6Months = () => {
    const now = new Date();
    const currentMonth = now.getMonth(); // 0-11
    const currentYear = now.getFullYear();

    const months = [];
    for (let i = 0; i < 6; i++) {
      const monthIndex = (currentMonth - 1 + i + 12) % 12;
      const year = currentMonth - 1 + i < 0 ? currentYear - 1 : (currentMonth - 1 + i >= 12 ? currentYear + 1 : currentYear);
      months.push({
        label: monthLabels[monthIndex],
        monthIndex,
        year,
        fullLabel: `${monthLabels[monthIndex]} ${year}`
      });
    }
    return months;
  };

  const rolling6Months = getRolling6Months();
  const formatXAxisLabel = (label: any) => {
    if (label == null) return "";
    const s = String(label);

    if (chartPeriod === "month") {
      // For monthly view, labels are day numbers (01, 02, 03, etc.)
      return s;
    }

    if (chartPeriod === "year") {
      const m1 = s.match(/^\d{4}-(\d{2})$/);
      if (m1) {
        const idx = Number(m1[1]) - 1;
        return monthLabels[idx] ?? s;
      }

      const n = Number(s);
      if (!Number.isNaN(n) && n >= 1 && n <= 12) {
        return monthLabels[n - 1] ?? s;
      }
    }

    return s;
  };

  const normalizedChartData = useMemo(() => {
    const raw = (chartData ?? []) as Array<any>;
    // For "month" and "year" period, aggregate daily data (DD/MM) by month (last 6 months rolling)
    if (chartPeriod === "month" || chartPeriod === "year") {
      const base = rolling6Months.map((m) => ({ label: m.label, revenue: 0, expenses: 0 }));

      // Aggregate daily data by month
      const monthMap = new Map<number, { revenue: number; expenses: number }>();
      for (const p of raw) {
        const s = String(p?.label ?? "").trim();
        // Parse DD/MM format to get month
        const parts = s.split('/');
        if (parts.length === 2) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10);
          if (month >= 1 && month <= 12) {
            const idx = month - 1;
            const existing = monthMap.get(idx) || { revenue: 0, expenses: 0 };
            monthMap.set(idx, {
              revenue: existing.revenue + (Number(p?.revenue ?? 0) || 0),
              expenses: existing.expenses + (Number(p?.expenses ?? 0) || 0),
            });
          }
        }
      }

      // Merge aggregated data into base array (only for months in rolling 6 months)
      for (const [idx, data] of monthMap.entries()) {
        const rollingMonth = rolling6Months.find(m => m.monthIndex === idx);
        if (rollingMonth) {
          const baseIdx = rolling6Months.indexOf(rollingMonth);
          base[baseIdx] = {
            label: rollingMonth.label,
            revenue: data.revenue,
            expenses: data.expenses,
          };
        }
      }

      return base;
    }
    // For "week" period, return as-is
    return raw;
  }, [chartData, chartPeriod, rolling6Months]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Laporan Keuangan</h1>
          <p className="text-muted-foreground text-xs">Analisis pendapatan dan pengeluaran</p>
        </div>
        <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
          <SelectTrigger className="w-full sm:w-[160px]">
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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Pendapatan</p>
            {loadingSummary ? <Skeleton className="h-7 w-24 mt-1" /> : (
              <p className="text-xl font-bold text-primary mt-1">{formatRupiah(summary?.revenue ?? 0)}</p>
            )}
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3 text-green-600" />
              <span className="text-xs text-green-600">{summary?.transactionCount ?? 0} transaksi</span>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-900">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Pengeluaran</p>
            {(loadingSummary && loadingExpenses) ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <p className="text-xl font-bold text-red-600 mt-1">{formatRupiah(expensesValue)}</p>
            )}
            <div className="flex items-center gap-1 mt-1">
              <TrendingDown className="w-3 h-3 text-red-600" />
              <span className="text-xs text-red-600">Operasional</span>
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 lg:col-span-1 bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Laba Bersih</p>
            {(loadingSummary && loadingTransactions && loadingExpenses) ? (
              <Skeleton className="h-7 w-24 mt-1" />
            ) : (
              <p className={`text-xl font-bold mt-1 ${profitValue >= 0 ? "text-green-700" : "text-destructive"}`}>
                {formatRupiah(profitValue)}
              </p>
            )}
            <div className="flex items-center gap-1 mt-1">
              {profitValue >= 0 ? (
                <TrendingUp className="w-3 h-3 text-green-600" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-600" />
              )}
              <span className={`text-xs font-medium ${profitValue >= 0 ? "text-green-600" : "text-red-600"}`}>
                {revenueValue > 0 ? `${Math.round((profitValue / (revenueValue || 1)) * 100)}% margin` : "Belum ada data"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="py-2 px-1 text-center">
            <p className="text-base font-bold text-primary">{summary?.transactionCount ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Transaksi</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-1 text-center">
            {loadingSummary && loadingCustomers ? (
              <Skeleton className="h-5 w-8 mx-auto" />
            ) : (
              <p className="text-base font-bold">{newCustomersValue}</p>
            )}
            <p className="text-[10px] text-muted-foreground">Pelanggan Baru</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-1 text-center">
            <p className="text-base font-bold">{summary?.appointmentCount ?? 0}</p>
            <p className="text-[10px] text-muted-foreground">Janji Temu</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <CardTitle className="text-sm font-semibold">Grafik Keuangan</CardTitle>
            <Select value={chartPeriod} onValueChange={(v: any) => setChartPeriod(v)}>
              <SelectTrigger className="h-8 w-full sm:w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Mingguan</SelectItem>
                <SelectItem value="month">Bulanan</SelectItem>
                <SelectItem value="year">Tahunan</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className={isMobile ? "px-1" : ""}>
          {loadingChart ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart
                data={normalizedChartData}
                margin={{
                  top: 20,
                  right: 10,
                  left: 0,
                  bottom: 30
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.5} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))", textAnchor: "middle" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={formatXAxisLabel}
                  interval={chartPeriod === "month" || chartPeriod === "year" ? 0 : 0}
                  tickMargin={15}
                  padding={{ left: 10, right: 10 }}
                  minTickGap={5}
                  height={30}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "4 4" }}
                  formatter={(value: any, name: any) => [formatRupiah(Number(value) || 0), name === "Pendapatan" ? "Pendapatan" : "Pengeluaran"]}
                  labelFormatter={(label: any) => {
                    if (chartPeriod === "month" || chartPeriod === "year") {
                      const rollingMonth = rolling6Months.find(m => m.label === label);
                      return rollingMonth ? rollingMonth.fullLabel : label;
                    }
                    return label;
                  }}
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                    fontSize: 12,
                    padding: "12px",
                  }}
                />
                <Legend
                  verticalAlign="top"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ paddingTop: '0px', fontSize: 10 }}
                />
                <defs>
                  <linearGradient id="gradientRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05}/>
                  </linearGradient>
                  <linearGradient id="gradientExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#22c55e"
                  fill="url(#gradientRevenue)"
                  name="Pendapatan"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "#22c55e", strokeWidth: 2, stroke: "#fff" }}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#f43f5e"
                  fill="url(#gradientExpenses)"
                  name="Pengeluaran"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: "#f43f5e", strokeWidth: 2, stroke: "#fff" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Services */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Layanan Terlaris</CardTitle>
        </CardHeader>
        <CardContent>
          {loadingTop ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !topServices?.length ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Belum ada data transaksi
            </div>
          ) : (
            <div className="space-y-3">
              {topServices.map((s, i) => {
                const maxCount = topServices[0]?.count ?? 1;
                const pct = Math.round((s.count / maxCount) * 100);
                return (
                  <div key={s.serviceId} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                        <span className="text-sm font-medium">{s.serviceName}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-semibold text-primary">{formatRupiah(s.revenue)}</span>
                        <span className="text-xs text-muted-foreground ml-2">({s.count}x)</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
