import { supabase } from "./supabase";

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  category_id?: string;
  name: string;
  description?: string;
  price: number;
  duration_minutes: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  specialization?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: string;
  customer_id: string;
  staff_id?: string;
  service_id: string;
  appointment_date: string;
  status: "scheduled" | "completed" | "cancelled" | "no-show";
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  customer_id?: string;
  appointment_id?: string;
  items: any[];
  total_amount: number;
  payment_method: string;
  payment_status: "paid" | "pending" | "refunded";
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  revenue: number;
  transactionCount: number;
  customerCount: number;
  appointmentCount: number;
}

export interface RevenueChartPoint {
  label: string;
  revenue: number;
}

export interface TopService {
  serviceId: number;
  serviceName: string;
  category: string;
  count: number;
  revenue: number;
}

export class SupabaseDB {
  static async getDashboardSummary(period: string): Promise<DashboardSummary> {
    const { start, end } = this.getPeriodDates(period);

    const { data: transactions } = await supabase
      .from("transactions")
      .select("total_amount")
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .eq("payment_status", "paid");

    const { count: transactionCount } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString());

    const { count: customerCount } = await supabase
      .from("customers")
      .select("*", { count: "exact", head: true });

    const { count: appointmentCount } = await supabase
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("appointment_date", start.toISOString())
      .lte("appointment_date", end.toISOString());

    const revenue =
      transactions?.reduce((sum, t) => sum + Number(t.total_amount), 0) || 0;

    return {
      revenue,
      transactionCount: transactionCount || 0,
      customerCount: customerCount || 0,
      appointmentCount: appointmentCount || 0,
    };
  }

  static async getRevenueChart(period: string): Promise<RevenueChartPoint[]> {
    const { start, end } = this.getPeriodDates(period);
    const days = this.getDaysInRange(start, end);

    const data: RevenueChartPoint[] = [];

    for (const day of days) {
      const dayStart = new Date(day);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      const { data: transactions } = await supabase
        .from("transactions")
        .select("total_amount")
        .gte("created_at", dayStart.toISOString())
        .lte("created_at", dayEnd.toISOString())
        .eq("payment_status", "paid");

      const revenue =
        transactions?.reduce((sum, t) => sum + Number(t.total_amount), 0) || 0;

      data.push({
        label: this.formatDayLabel(day),
        revenue,
      });
    }

    return data;
  }

  static async getTopServices(): Promise<TopService[]> {
    const { data: services } = await supabase
      .from("services")
      .select(
        `
        id,
        name,
        categories(name)
      `,
      )
      .eq("is_active", true);

    const { data: transactions } = await supabase
      .from("transactions")
      .select("total_amount, items")
      .eq("payment_status", "paid");

    const topServices: TopService[] = [];

    for (const service of services || []) {
      let count = 0;
      let revenue = 0;

      for (const tx of transactions || []) {
        const items = tx.items || [];
        const serviceItems = items.filter((item: any) => {
          const serviceId = item?.serviceId ?? item?.service_id ?? item?.id ?? item?.service?.id;
          return String(serviceId) === String(service.id);
        });

        if (serviceItems.length > 0) {
          count += serviceItems.reduce((sum: number, item: any) => sum + Number(item?.quantity || 1), 0);
          revenue += serviceItems.reduce((sum: number, item: any) => {
            const price = Number(item?.price ?? item?.amount ?? item?.total ?? item?.subtotal ?? 0);
            const quantity = Number(item?.quantity || 1);
            return sum + (price * quantity);
          }, 0);
        }
      }

      if (count > 0) {
        topServices.push({
          serviceId: parseInt(
            service.id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
          ),
          serviceName: service.name,
          category: (service.categories as any)?.name || "Uncategorized",
          count,
          revenue,
        });
      }
    }

    return topServices.sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }

  static async getRecentTransactions(limit: number = 5): Promise<any[]> {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        customers(name)
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (
      data?.map((t) => ({
        id: parseInt(t.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
        customerName: (t.customers as any)?.name || "Unknown",
        serviceName: "Service",
        amount: Number(t.total_amount),
        date: t.created_at,
      })) || []
    );
  }

  private static getPeriodDates(period: string): { start: Date; end: Date } {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);

    let start: Date;
    switch (period) {
      case "today":
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
        break;
      case "week":
        start = new Date(now);
        start.setDate(start.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case "month":
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "year":
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        start = new Date(now);
        start.setHours(0, 0, 0, 0);
    }

    return { start, end };
  }

  private static getDaysInRange(start: Date, end: Date): Date[] {
    const days: Date[] = [];
    const current = new Date(start);

    while (current <= end) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return days;
  }

  private static formatDayLabel(date: Date): string {
    const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
    return days[date.getDay()];
  }
}

export default SupabaseDB;
