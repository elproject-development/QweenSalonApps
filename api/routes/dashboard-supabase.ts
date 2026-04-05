import { Router, type IRouter } from "express";
import { SupabaseDB } from "../lib/supabase-db";
import {
  GetDashboardSummaryQueryParams,
  GetRevenueChartQueryParams,
  GetRecentTransactionsQueryParams,
} from "../lib/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const query = GetDashboardSummaryQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  try {
    const summary = await SupabaseDB.getDashboardSummary(query.data.period);
    res.json(summary);
  } catch (error) {
    console.error("Error fetching dashboard summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/revenue-chart", async (req, res): Promise<void> => {
  const query = GetRevenueChartQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  try {
    const chartData = await SupabaseDB.getRevenueChart(query.data.period);
    res.json(chartData);
  } catch (error) {
    console.error("Error fetching revenue chart:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/top-services", async (req, res): Promise<void> => {
  try {
    const topServices = await SupabaseDB.getTopServices();
    res.json(topServices);
  } catch (error) {
    console.error("Error fetching top services:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/dashboard/recent-transactions", async (req, res): Promise<void> => {
  const query = GetRecentTransactionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  try {
    const recentTransactions = await SupabaseDB.getRecentTransactions(
      query.data.limit,
    );
    res.json(recentTransactions);
  } catch (error) {
    console.error("Error fetching recent transactions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
