import { useState } from "react";
import { useGetDashboardSummary, useGetRevenueChart, useGetTopServices, useListCustomers, useListTransactions, useListExpenses } from "@/lib/api-client-react";
import { formatRupiah } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";
import { TrendingUp, TrendingDown, DollarSign, BarChart3 } from "lucide-react";
import { endOfDay, endOfMonth, endOfWeek, endOfYear, isWithinInterval, parseISO, startOfDay, startOfMonth, startOfWeek, startOfYear } from "date-fns";
import { useIsMobile } from "@/hooks/use-mobile";

const CHART_COLORS = ["#e8527a", "#f48fb1", "#f7c6d4", "#c62a66", "#ff8a9e"];

export function Laporan() {
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("month");
  const [chartPeriod, setChartPeriod] = useState<"week" | "month" | "year">("month");

  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({ period });
  const { data: chartData, isLoading: loadingChart } = useGetRevenueChart({ period: chartPeriod });
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
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
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
    const status = String(tx?.status ?? tx?.payment_status ?? tx?.paymentStatus ?? "").toLowerCase();
    const isCompleted = status === "completed" || status === "selesai" || status === "paid" || status === "success" || status === "success_paid";
    return isCompleted && isWithinInterval(d, periodRange);
  }).reduce((acc: number, tx: any) => acc + (Number(tx?.total ?? tx?.total_amount ?? tx?.amount ?? 0) || 0), 0);

  const expensesValue = summary?.expenses ?? computedExpenses;
  const revenueValue = summary?.revenue ?? computedRevenue;
  const profitValue = summary?.profit ?? (revenueValue - expensesValue);

  const filteredTransactionsForTop = (transactions ?? []).filter((tx: any) => {
    const d = safeParseDate(tx?.createdAt ?? tx?.created_at ?? tx?.date);
    if (!d) return false;
    const status = String(tx?.status ?? tx?.payment_status ?? tx?.paymentStatus ?? "").toLowerCase();
    const isCompleted = status === "completed" || status === "selesai" || status === "paid" || status === "success" || status === "success_paid";
    return isCompleted && isWithinInterval(d, periodRange);
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

  const formatTooltipValue = (value: number) => formatRupiah(value);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Laporan Keuangan</h1>
          <p className="text-muted-foreground text-xs">Analisis pendapatan dan pengeluaran</p>
        </div>
        <Select value={period} onValueChange={(v: any) => setPeriod(v)}>
          <SelectTrigger className="w-[160px]">
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
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
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
              <span className="text-xs text-red-600">Biaya operasional</span>
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
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">Grafik Keuangan</CardTitle>
            <Select value={chartPeriod} onValueChange={(v: any) => setChartPeriod(v)}>
              <SelectTrigger className="h-8 w-[100px] text-xs">
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
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart 
                data={chartData ?? []} 
                margin={{ 
                  top: 10, 
                  right: isMobile ? 5 : 10, 
                  left: isMobile ? -20 : 0, 
                  bottom: 0 
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis 
                  dataKey="label" 
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis 
                  hide={isMobile} 
                  tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} 
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip 
                  formatter={formatTooltipValue} 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    border: "1px solid hsl(var(--border))", 
                    borderRadius: "8px", 
                    fontSize: "12px" 
                  }} 
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(var(--primary))" 
                  fill="hsl(var(--primary) / 0.1)" 
                  name="Pendapatan" 
                  strokeWidth={2} 
                />
                <Area 
                  type="monotone" 
                  dataKey="expenses" 
                  stroke="hsl(var(--destructive))" 
                  fill="hsl(var(--destructive) / 0.1)" 
                  name="Pengeluaran" 
                  strokeWidth={2} 
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
