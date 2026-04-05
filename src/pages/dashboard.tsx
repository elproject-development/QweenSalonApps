import { useGetDashboardSummary, useGetRevenueChart, useGetTopServices, useGetRecentTransactions } from "@/lib/api-client-react";
import { formatRupiah } from "@/lib/format";
import { mockSummary, mockChartData, mockTopServices, mockRecentTransactions } from "@/lib/mock-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { Users, Receipt, Calendar as CalendarIcon, TrendingUp } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";

export function Dashboard() {
  const isMobile = useIsMobile();
  const [period, setPeriod] = useState<"today" | "week" | "month" | "year">("today");
  
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary({ period });
  const { data: chartData = [], isLoading: loadingChart } = useGetRevenueChart({ period: period === "today" ? "week" : period });
  const { data: topServices = [], isLoading: loadingTop } = useGetTopServices();
  const { data: recentTransactions = [], isLoading: loadingRecent } = useGetRecentTransactions({ limit: 5 });

  // Use empty arrays/objects as fallback instead of mock data when data is explicitly empty
  const displaySummary = summary || { revenue: 0, transactionCount: 0, customerCount: 0, appointmentCount: 0 };
  const displayChartData = chartData;
  const displayTopServices = topServices;
  const displayRecentTransactions = recentTransactions;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Ringkasan Bisnis</h1>
          <p className="text-muted-foreground text-xs">Pantau performa Glam Studio Anda hari ini.</p>
        </div>
        <Select value={period} onValueChange={(val: any) => setPeriod(val)}>
          <SelectTrigger className="w-[180px]">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Pendapatan</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loadingSummary ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-lg md:text-2xl font-bold text-primary">{formatRupiah(displaySummary.revenue)}</div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Grafik Pendapatan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {loadingChart ? (
                <Skeleton className="h-full w-full" />
              ) : displayChartData && displayChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={displayChartData}>
                    <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                    {!isMobile && (
                      <YAxis 
                        fontSize={12} 
                        tickLine={false} 
                        axisLine={false} 
                        tickFormatter={(value) => "Rp " + Math.round(value / 1000) + "k"}
                      />
                    )}
                    <Tooltip 
                      formatter={(value: number) => formatRupiah(value)}
                      cursor={{ fill: 'transparent' }}
                    />
                    <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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
