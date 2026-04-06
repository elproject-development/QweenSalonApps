import { useMutation, useQuery } from "@tanstack/react-query";

let baseUrl: string | null = null;

export function setBaseUrl(url: string | null) {
  baseUrl = url;
}

function resolveBaseUrl() {
  if (baseUrl === null) return "";
  return baseUrl;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${resolveBaseUrl()}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export type SalonService = {
  id: number;
  name: string;
  category: string;
  price: number;
  duration: number;
  description?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Customer = {
  id: number;
  uuid?: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Staff = {
  id: string;
  name: string;
  phone: string;
  position: string;
  commission: number;
  isActive: boolean;
};

export type Expense = {
  id: number;
  description: string;
  category: string;
  amount: number;
  date: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type Appointment = {
  id: string;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  staffName?: string | null;
  status: "pending" | "confirmed" | "completed" | "cancelled" | string;
  scheduledAt: string;
  notes?: string | null;
};

export type TransactionItem = {
  serviceId?: number;
  serviceName: string;
  quantity: number;
  price: number;
  subtotal: number;
};

export type Transaction = {
  id: number;
  receiptNumber: string;
  customerId?: any;
  customerName: string;
  customerPhone?: string;
  staffName: string;
  items: TransactionItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  paymentStatus?: string;
  status?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
};

export type DashboardSummary = {
  revenue: number;
  transactionCount: number;
  customerCount: number;
  appointmentCount: number;
  newCustomers?: number;
  expenses?: number;
  profit?: number;
};

export type RevenueChartPoint = {
  label: string;
  revenue: number;
  expenses?: number;
};

export type TopService = {
  serviceId: number;
  serviceName: string;
  count: number;
  revenue: number;
};

export type RecentTransaction = {
  id: number;
  receiptNumber: string;
  customerName: string;
  total: number;
  createdAt: string;
};

export function getListServicesQueryKey(params?: { category?: string }) {
  return ["services", params ?? {}] as const;
}

export function useListServices(params?: { category?: string }) {
  return useQuery({
    queryKey: getListServicesQueryKey(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set("category", params.category);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<SalonService[]>(`/services${suffix}`);
    },
  });
}

export function useCreateService() {
  return useMutation({
    mutationFn: ({ data }: { data: any }) => apiFetch<SalonService>("/services", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useUpdateService() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiFetch<SalonService>(`/services/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  });
}

export function useDeleteService() {
  return useMutation({
    mutationFn: ({ id }: { id: number }) => apiFetch<void>(`/services/${id}`, { method: "DELETE" }),
  });
}

export function getListCustomersQueryKey(params?: { search?: string }) {
  return ["customers", params ?? {}] as const;
}

export function useListCustomers(params?: { search?: string }) {
  return useQuery({
    queryKey: getListCustomersQueryKey(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.search) qs.set("search", params.search);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<Customer[]>(`/customers${suffix}`);
    },
  });
}

export function useCreateCustomer() {
  return useMutation({
    mutationFn: ({ data }: { data: any }) => apiFetch<Customer>("/customers", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useUpdateCustomer() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiFetch<Customer>(`/customers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  });
}

export function useDeleteCustomer() {
  return useMutation({
    mutationFn: ({ id }: { id: number }) => apiFetch<void>(`/customers/${id}`, { method: "DELETE" }),
  });
}

export function getListStaffQueryKey() {
  return ["staff"] as const;
}

export function useListStaff() {
  return useQuery({
    queryKey: getListStaffQueryKey(),
    queryFn: () => apiFetch<Staff[]>("/staff"),
  });
}

export function useCreateStaff() {
  return useMutation({
    mutationFn: ({ data }: { data: any }) => apiFetch<Staff>("/staff", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useUpdateStaff() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiFetch<Staff>(`/staff/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  });
}

export function useDeleteStaff() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => apiFetch<void>(`/staff/${id}`, { method: "DELETE" }),
  });
}

export function getListExpensesQueryKey(params?: { category?: string; startDate?: string; endDate?: string }) {
  return ["expenses", params ?? {}] as const;
}

export function useListExpenses(params?: { category?: string; startDate?: string; endDate?: string }) {
  return useQuery({
    queryKey: getListExpensesQueryKey(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.category) qs.set("category", params.category);
      if (params?.startDate) qs.set("startDate", params.startDate);
      if (params?.endDate) qs.set("endDate", params.endDate);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<Expense[]>(`/expenses${suffix}`);
    },
  });
}

export function useCreateExpense() {
  return useMutation({
    mutationFn: ({ data }: { data: any }) => apiFetch<Expense>("/expenses", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useUpdateExpense() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiFetch<Expense>(`/expenses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  });
}

export function useDeleteExpense() {
  return useMutation({
    mutationFn: ({ id }: { id: number }) => apiFetch<void>(`/expenses/${id}`, { method: "DELETE" }),
  });
}

export function getListAppointmentsQueryKey(params?: { date?: string; status?: string }) {
  return ["appointments", params ?? {}] as const;
}

export function useListAppointments(params?: { date?: string; status?: string }) {
  return useQuery({
    queryKey: getListAppointmentsQueryKey(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.date) qs.set("date", params.date);
      if (params?.status) qs.set("status", params.status);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<Appointment[]>(`/appointments${suffix}`);
    },
  });
}

export function useCreateAppointment() {
  return useMutation({
    mutationFn: ({ data }: { data: any }) => apiFetch<Appointment>("/appointments", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useUpdateAppointment() {
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiFetch<Appointment>(`/appointments/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  });
}

export function useDeleteAppointment() {
  return useMutation({
    mutationFn: ({ id }: { id: string }) => apiFetch<void>(`/appointments/${id}`, { method: "DELETE" }),
  });
}

export function getListTransactionsQueryKey(params?: { startDate?: string; endDate?: string; paymentMethod?: string; customerId?: string }) {
  return ["transactions", params ?? {}] as const;
}

export function useListTransactions(params?: { startDate?: string; endDate?: string; paymentMethod?: string; customerId?: string }) {
  return useQuery({
    queryKey: getListTransactionsQueryKey(params),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (params?.startDate) qs.set("startDate", params.startDate);
      if (params?.endDate) qs.set("endDate", params.endDate);
      if (params?.paymentMethod) qs.set("paymentMethod", params.paymentMethod);
      if (params?.customerId) qs.set("customerId", params.customerId);
      const suffix = qs.toString() ? `?${qs.toString()}` : "";
      return apiFetch<Transaction[]>(`/transactions${suffix}`);
    },
  });
}

export function useCreateTransaction() {
  return useMutation({
    mutationFn: ({ data }: { data: any }) => apiFetch<Transaction>("/transactions", { method: "POST", body: JSON.stringify({ data }) }),
  });
}

export function useGetDashboardSummary(params: { period: "today" | "week" | "month" | "year" }) {
  return useQuery({
    queryKey: ["dashboard", "summary", params] as const,
    queryFn: () => apiFetch<DashboardSummary>(`/dashboard/summary?period=${encodeURIComponent(params.period)}`),
  });
}

export function useGetRevenueChart(params: { period: "week" | "month" | "year" }) {
  return useQuery({
    queryKey: ["dashboard", "revenue-chart", params] as const,
    queryFn: () => apiFetch<RevenueChartPoint[]>(`/dashboard/revenue-chart?period=${encodeURIComponent(params.period)}`),
  });
}

export function useGetTopServices() {
  return useQuery({
    queryKey: ["dashboard", "top-services"] as const,
    queryFn: () => apiFetch<TopService[]>("/dashboard/top-services"),
  });
}

export function useGetRecentTransactions(params: { limit: number }) {
  return useQuery({
    queryKey: ["dashboard", "recent-transactions", params] as const,
    queryFn: () => apiFetch<RecentTransaction[]>(`/dashboard/recent-transactions?limit=${encodeURIComponent(params.limit)}`),
  });
}
