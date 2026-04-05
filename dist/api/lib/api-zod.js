import { z } from "zod";
export const GetDashboardSummaryQueryParams = z.object({
    period: z.enum(["today", "week", "month", "year"]).default("today"),
});
export const GetRevenueChartQueryParams = z.object({
    period: z.enum(["week", "month", "year"]).default("week"),
});
export const GetRecentTransactionsQueryParams = z.object({
    limit: z.coerce.number().int().positive().max(100).default(5),
});
