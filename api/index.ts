import "dotenv/config";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { supabase } from "./lib/supabase";
import { logger } from "./lib/logger";
import {
  GetDashboardSummaryQueryParams,
  GetRevenueChartQueryParams,
  GetRecentTransactionsQueryParams,
} from "./lib/api-zod";

const app = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
          useragent: req.headers["user-agent"],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  })
);

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Test endpoint
app.get("/api/test", (req, res) => {
  res.json({ message: "Routes are working!" });
});

// Customers routes
app.get("/api/customers", async (req, res) => {
  try {
    const { search } = req.query;
    let query = supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }
    
    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Services routes
app.get("/api/services", async (req, res) => {
  try {
    const { category } = req.query;
    let query = supabase
      .from("services")
      .select("*")
      .order("name", { ascending: true });
    
    if (category) {
      query = query.eq("category", category);
    }
    
    const { data, error } = await query;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Staff routes
app.get("/api/staff", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("staff")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Dashboard routes
app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const period = (req.query.period as string) || "7d";
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 1;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const [customersResult, servicesResult, staffResult] = await Promise.all([
      supabase.from("customers").select("id", { count: "exact" }),
      supabase.from("services").select("id", { count: "exact" }),
      supabase.from("staff").select("id", { count: "exact" }),
    ]);
    
    res.json({
      totalCustomers: customersResult.count || 0,
      totalServices: servicesResult.count || 0,
      totalStaff: staffResult.count || 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/dashboard/recent-transactions", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    
    const { data, error } = await supabase
      .from("transactions")
      .select("id, receipt_number, customer_name, total, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    
    const transactions = data?.map(t => ({
      id: t.id,
      receiptNumber: t.receipt_number,
      customerName: t.customer_name,
      total: t.total,
      createdAt: t.created_at
    })) || [];
    
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
