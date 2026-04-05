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

async function trySelect<T>(
  context: string,
  table: string,
  selectProjections: string[],
  apply: (q: any) => any = (q) => q,
): Promise<{ data: T[] | null; usedSelect: string | null; error: any | null }> {
  for (const projection of selectProjections) {
    const q = apply(supabase.from(table).select(projection));
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await q;
    if (!error) {
      return { data, usedSelect: projection, error: null };
    }
    logger.warn(
      { err: error, context, table, projection },
      "Supabase select failed, trying next projection",
    );
  }

  return {
    data: null,
    usedSelect: null,
    error: { message: "No valid projection found", context, table },
  };
}

function pickFirst(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
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

// Debug: inspect transactions schema (remove later if you want)
app.get("/api/debug/transactions-sample", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 1, 5);
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ err: error, context: "GET /api/debug/transactions-sample" }, "Supabase error");
      res
        .status(500)
        .json({ error: error.message, context: "GET /api/debug/transactions-sample" });
      return;
    }

    res.json(data ?? []);
  } catch (err) {
    respond500(res, "GET /api/debug/transactions-sample", err);
  }
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

    const context = "GET /api/dashboard/recent-transactions";
    const projections = [
      // common snake_case
      "id, receipt_number, customer_name, total, created_at",
      // other variants
      "id, receipt_no, customer_name, total, created_at",
      "id, receipt, customer_name, total, created_at",
      "id, invoice_number, customer_name, total, created_at",
      // totals variants
      "id, receipt_number, customer_name, total_amount, created_at",
      "id, receipt_no, customer_name, total_amount, created_at",
      "id, receipt_number, customer_name, grand_total, created_at",
      "id, receipt_no, customer_name, grand_total, created_at",
      "id, receipt_number, customer_name, amount, created_at",
      "id, receipt_no, customer_name, amount, created_at",
      // minimal fallback
      "id, created_at",
    ];

    const result = await trySelect<any>(context, "transactions", projections, (q) =>
      q.order("created_at", { ascending: false }).limit(limit),
    );

    if (result.error) {
      logger.error({ err: result.error, context }, "Supabase error");
      res.status(500).json({ error: errorToMessage(result.error), context });
      return;
    }

    const transactions =
      result.data?.map((t) => {
        const receiptNumber =
          pickFirst(t, ["receipt_number", "receipt_no", "receipt", "invoice_number"]) ??
          String(t.id);
        const customerName = pickFirst(t, ["customer_name", "customerName", "customer"]) ?? "";
        const total = Number(
          pickFirst(t, ["total", "total_amount", "grand_total", "amount", "grandTotal"])
            ?? 0,
        );
        const createdAt = pickFirst(t, ["created_at", "createdAt"]) ?? new Date().toISOString();

        return {
          id: t.id,
          receiptNumber,
          customerName,
          total,
          createdAt,
        };
      }) ?? [];

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
    
    const context = "GET /api/dashboard/revenue-chart";
    const projections = [
      "total, created_at",
      "total_amount, created_at",
      "grand_total, created_at",
      "amount, created_at",
      "created_at",
    ];

    const result = await trySelect<any>(context, "transactions", projections, (q) =>
      q.gte("created_at", startDate.toISOString()).order("created_at", { ascending: true }),
    );

    if (result.error) {
      logger.error({ err: result.error, context }, "Supabase error");
      res.status(500).json({ error: errorToMessage(result.error), context });
      return;
    }

    // Group by day
    const revenueByDay: { [key: string]: number } = {};
    result.data?.forEach((transaction) => {
      const createdAt = pickFirst(transaction, ["created_at", "createdAt"]);
      const dateLabel = createdAt ? new Date(createdAt).toLocaleDateString() : "Unknown";
      const value = Number(
        pickFirst(transaction, ["total", "total_amount", "grand_total", "amount"]) ?? 0,
      );
      revenueByDay[dateLabel] = (revenueByDay[dateLabel] || 0) + value;
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
    const context = "GET /api/dashboard/top-services";

    // Your DB doesn't have transaction_items. Try to compute from transactions.items (jsonb)
    const result = await trySelect<any>(
      context,
      "transactions",
      ["items, created_at", "items"],
      (q) => q.order("created_at", { ascending: false }).limit(200),
    );

    if (result.error) {
      // Can't compute; return empty but not 500 so dashboard still works
      logger.warn({ err: result.error, context }, "Cannot compute top services; returning empty list");
      res.json([]);
      return;
    }

    const serviceStats: Record<
      string,
      { count: number; revenue: number; name: string; serviceId: number }
    > = {};

    for (const tx of result.data ?? []) {
      const items = (tx as any).items;
      if (!Array.isArray(items)) continue;

      for (const it of items) {
        const serviceId = Number(pickFirst(it, ["serviceId", "service_id", "id"]) ?? 0);
        if (!serviceId) continue;
        const serviceName =
          String(pickFirst(it, ["serviceName", "service_name", "name"]) ?? "Unknown");
        const qty = Number(pickFirst(it, ["quantity", "qty"]) ?? 1);
        const price = Number(pickFirst(it, ["price", "unitPrice", "unit_price"]) ?? 0);
        const revenue = qty * price;

        const key = String(serviceId);
        if (!serviceStats[key]) {
          serviceStats[key] = { serviceId, name: serviceName, count: 0, revenue: 0 };
        }

        serviceStats[key].count += qty;
        serviceStats[key].revenue += revenue;
      }
    }

    const topServices = Object.values(serviceStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map((s) => ({
        serviceId: s.serviceId,
        serviceName: s.name,
        count: s.count,
        revenue: s.revenue,
      }));

    res.json(topServices);
  } catch (err) {
    respond500(res, "GET /api/dashboard/top-services", err);
  }
});

export default app;
