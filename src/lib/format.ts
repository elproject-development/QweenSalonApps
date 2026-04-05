import { format } from "date-fns";
import { id } from "date-fns/locale";

export function formatNumber(value: string | number): string {
  if (value === undefined || value === null || value === "") return "";
  const num = typeof value === "string" ? value.replace(/[^0-9]/g, "") : value.toString();
  if (!num) return "";
  return new Intl.NumberFormat("id-ID").format(Number(num));
}

export function parseNumber(formattedValue: string): number {
  if (!formattedValue) return 0;
  return Number(formattedValue.replace(/[^0-9]/g, "")) || 0;
}

export function formatRupiah(amount: number | string | null | undefined): string {
  const value = typeof amount === "string" ? parseFloat(amount) : amount;
  const safeAmount = !value || isNaN(value) ? 0 : value;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(safeAmount);
}

export function formatDate(dateString: string, formatStr: string = "dd/MM/yyyy"): string {
  if (!dateString) return "";
  try {
    return format(new Date(dateString), formatStr, { locale: id });
  } catch (error) {
    return dateString;
  }
}
