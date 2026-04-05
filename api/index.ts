import "dotenv/config";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createClient } from "@supabase/supabase-js";
import pino from "pino";
import {
  GetDashboardSummaryQueryParams,
  GetRevenueChartQueryParams,
  GetRecentTransactionsQueryParams,
} from "./lib/api-zod";

// Supabase client
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://your-project-ref.supabase.co";

const supabaseKey =
  process.env.SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
  "your-anon-key";

const supabase = createClient(supabaseUrl, supabaseKey);

// Logger
const isProduction = process.env.NODE_ENV === "production";
const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});

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

app.get("/api/dashboard/revenue-chart", async (req, res) => {
  try {
    const period = req.query.period as string || "week";
    const days = period === "week" ? 7 : period === "month" ? 30 : 1;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
      .from("transactions")
      .select("total, created_at")
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: true });
    
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    
    // Group by day
    const revenueByDay: { [key: string]: number } = {};
    data?.forEach(transaction => {
      const date = new Date(transaction.created_at).toLocaleDateString();
      revenueByDay[date] = (revenueByDay[date] || 0) + transaction.total;
    });
    
    const chartData = Object.entries(revenueByDay).map(([date, revenue]) => ({
      label: date,
      revenue
    }));
    
    res.json(chartData);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/dashboard/top-services", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("transaction_items")
      .select(`
        service_id,
        services!inner(name, price),
        quantity
      `);
    
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    
    // Aggregate by service
    const serviceStats: { [key: string]: { count: number; revenue: number; name: string } } = {};
    data?.forEach(item => {
      const serviceId = item.service_id;
      const serviceName = (item.services as any)?.name || 'Unknown';
      const revenue = item.quantity * ((item.services as any)?.price || 0);
      
      if (!serviceStats[serviceId]) {
        serviceStats[serviceId] = { count: 0, revenue: 0, name: serviceName };
      }
      serviceStats[serviceId].count += item.quantity;
      serviceStats[serviceId].revenue += revenue;
    });
    
    const topServices = Object.entries(serviceStats)
      .map(([serviceId, stats]) => ({
        serviceId: parseInt(serviceId),
        serviceName: stats.name,
        count: stats.count,
        revenue: stats.revenue
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    
    res.json(topServices);
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
});

export default app;
