import "dotenv/config";
import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { createClient } from "@supabase/supabase-js";
import pino from "pino";

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

function errorToMessage(err: unknown) {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

function respond500(res: any, context: string, err: unknown) {
  logger.error({ err, context }, "API error");
  res.status(500).json({ error: errorToMessage(err), context });
}

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
      logger.error({ err: error, context: "GET /api/customers" }, "Supabase error");
      res.status(500).json({ error: error.message, context: "GET /api/customers" });
      return;
    }
    res.json(data);
  } catch (err) {
    respond500(res, "GET /api/customers", err);
  }
});

// Appointments routes
app.get("/api/appointments", async (req, res) => {
  try {
    const { date, status } = req.query as { date?: string; status?: string };

    const baseQuery = supabase
      .from("appointments")
      .select("*")
      .order("created_at", { ascending: false });

    let query = baseQuery;

    if (date) {
      // Expect YYYY-MM-DD; filter by appointment_date if exists
      query = query.eq("appointment_date", date);
    }
    if (status) {
      query = query.eq("status", status);
    }

    let { data, error } = await query;
    if (error && date && error.message.toLowerCase().includes("appointment_date")) {
      // Retry with a more generic column name used in some schemas
      const retryQuery = status ? baseQuery.eq("status", status).eq("date", date) : baseQuery.eq("date", date);
      const retry = await retryQuery;
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      logger.error({ err: error, context: "GET /api/appointments" }, "Supabase error");
      res.status(500).json({ error: error.message, context: "GET /api/appointments" });
      return;
    }

    res.json(data ?? []);
  } catch (err) {
    respond500(res, "GET /api/appointments", err);
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
      logger.error({ err: error, context: "GET /api/services" }, "Supabase error");
      res.status(500).json({ error: error.message, context: "GET /api/services" });
      return;
    }
    res.json(data);
  } catch (err) {
    respond500(res, "GET /api/services", err);
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
      logger.error({ err: error, context: "GET /api/staff" }, "Supabase error");
      res.status(500).json({ error: error.message, context: "GET /api/staff" });
      return;
    }
    res.json(data);
  } catch (err) {
    respond500(res, "GET /api/staff", err);
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

    if (customersResult.error || servicesResult.error || staffResult.error) {
      res.status(500).json({
        error:
          customersResult.error?.message ||
          servicesResult.error?.message ||
          staffResult.error?.message ||
          "Unknown supabase error",
        context: "GET /api/dashboard/summary",
      });
      return;
    }
    
    res.json({
      totalCustomers: customersResult.count || 0,
      totalServices: servicesResult.count || 0,
      totalStaff: staffResult.count || 0,
    });
  } catch (err) {
    respond500(res, "GET /api/dashboard/summary", err);
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
      logger.error(
        { err: error, context: "GET /api/dashboard/recent-transactions" },
        "Supabase error",
      );
      res
        .status(500)
        .json({ error: error.message, context: "GET /api/dashboard/recent-transactions" });
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
    respond500(res, "GET /api/dashboard/recent-transactions", err);
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
      logger.error({ err: error, context: "GET /api/dashboard/revenue-chart" }, "Supabase error");
      res
        .status(500)
        .json({ error: error.message, context: "GET /api/dashboard/revenue-chart" });
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
    respond500(res, "GET /api/dashboard/revenue-chart", err);
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
      logger.error({ err: error, context: "GET /api/dashboard/top-services" }, "Supabase error");
      res
        .status(500)
        .json({ error: error.message, context: "GET /api/dashboard/top-services" });
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
    respond500(res, "GET /api/dashboard/top-services", err);
  }
});

export default app;
