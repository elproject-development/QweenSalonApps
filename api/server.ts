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

// Base API route to check if index.ts is reachable
app.get("/api", (req, res) => {
  res.json({ message: "API is reachable", production: isProduction });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

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
    
    const { data: customers, error: customersError } = await query;
    if (customersError) {
      logger.error({ err: customersError, context: "GET /api/customers" }, "Supabase error");
      res.status(500).json({ error: customersError.message, context: "GET /api/customers" });
      return;
    }

    if (!customers || customers.length === 0) {
      res.json([]);
      return;
    }

    // Fetch transaction stats for these customers
    const customerIds = customers.map((c) => c.id);
    const { data: transactions, error: transError } = await supabase
      .from("transactions")
      .select("customer_id, total_amount")
      .in("customer_id", customerIds);

    if (transError) {
      logger.warn({ err: transError }, "Failed to fetch transactions for customer stats");
    }

    // Aggregate stats
    const statsMap = new Map<string, { visits: number; totalSpend: number }>();
    (transactions ?? []).forEach((t) => {
      if (!t.customer_id) return;
      const cid = String(t.customer_id);
      const current = statsMap.get(cid) || { visits: 0, totalSpend: 0 };
      statsMap.set(cid, {
        visits: current.visits + 1,
        totalSpend: current.totalSpend + Number(t.total_amount || 0),
      });
    });

    const enrichedCustomers = customers.map((c) => {
      const stats = statsMap.get(String(c.id)) || { visits: 0, totalSpend: 0 };
      return {
        ...c,
        visitCount: stats.visits,
        totalSpend: stats.totalSpend,
      };
    });

    res.json(enrichedCustomers);
  } catch (err) {
    respond500(res, "GET /api/customers", err);
  }
});

app.post("/api/customers", async (req, res) => {
  try {
    const { data, error } = await supabase.from("customers").insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    respond500(res, "POST /api/customers", err);
  }
});

app.put("/api/customers/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("customers")
      .update(req.body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    respond500(res, "PUT /api/customers", err);
  }
});

app.delete("/api/customers/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("customers").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    respond500(res, "DELETE /api/customers", err);
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
      query = query.eq("appointment_date", date);
    }
    if (status) {
      query = query.eq("status", status);
    }

    let { data, error } = await query;
    if (error && date && error.message.toLowerCase().includes("appointment_date")) {
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

app.post("/api/appointments", async (req, res) => {
  try {
    const { data, error } = await supabase.from("appointments").insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    respond500(res, "POST /api/appointments", err);
  }
});

app.put("/api/appointments/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .update(req.body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    respond500(res, "PUT /api/appointments", err);
  }
});

app.delete("/api/appointments/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("appointments").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    respond500(res, "DELETE /api/appointments", err);
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
    
    // Handle category filtering: convert category name to category_id
    if (category && category !== "all" && typeof category === "string") {
      const { data: categories } = await supabase
        .from("categories")
        .select("id")
        .eq("name", category)
        .limit(1);
      
      if (categories && categories.length > 0) {
        query = query.eq("category_id", categories[0].id);
      } else {
        // If category not found, return empty array
        return res.json([]);
      }
    }
    
    const { data, error } = await query;
    if (error) {
      logger.error({ err: error, context: "GET /api/services" }, "Supabase error");
      res.status(500).json({ error: error.message, context: "GET /api/services" });
      return;
    }
    
    // Fetch categories to map category_id to category name
    const categoryIds = Array.from(new Set((data ?? []).map((s: any) => s.category_id).filter(Boolean)));
    let categoryNameById = new Map<string, string>();
    
    if (categoryIds.length > 0) {
      const { data: categories, error: categoriesError } = await supabase
        .from("categories")
        .select("id, name")
        .in("id", categoryIds);
      
      if (!categoriesError) {
        categoryNameById = new Map(
          (categories ?? []).map((c: any) => [String(c.id), String(c.name ?? "")]),
        );
      }
    }
    
    // Map database columns to frontend format
    const mapped = (data ?? []).map((s: any) => ({
      ...s,
      category: s.category_id ? categoryNameById.get(String(s.category_id)) ?? "" : "",
      duration: s.duration_minutes, // Map duration_minutes to duration
      isActive: s.is_active ?? true,
    }));
    
    res.json(mapped);
  } catch (err) {
    respond500(res, "GET /api/services", err);
  }
});

app.post("/api/services", async (req, res) => {
  try {
    const { isActive, is_active, category, duration, ...rest } = req.body ?? {};
    const payload: any = { ...rest };
    
    // Map isActive to is_active
    if (isActive !== undefined) payload.is_active = isActive;
    if (is_active !== undefined) payload.is_active = is_active;
    
    // Map duration to duration_minutes
    if (duration !== undefined) payload.duration_minutes = Number(duration);
    
    // Handle category: convert category string to category_id
    if (category && typeof category === "string") {
      const { data: categories } = await supabase
        .from("categories")
        .select("id")
        .eq("name", category)
        .limit(1);
      
      if (categories && categories.length > 0) {
        payload.category_id = categories[0].id;
      }
    } else if (req.body.category_id) {
      payload.category_id = req.body.category_id;
    }

    const { data, error } = await supabase.from("services").insert(payload).select();
    if (error) throw error;
    
    const row = data?.[0];
    
    // Fetch category name for response
    let categoryName = "";
    if (row?.category_id) {
      const { data: categories } = await supabase
        .from("categories")
        .select("name")
        .eq("id", row.category_id)
        .limit(1);
      if (categories && categories.length > 0) {
        categoryName = categories[0].name;
      }
    }
    
    res.json({
      ...row,
      category: categoryName,
      duration: row.duration_minutes,
      isActive: row.is_active ?? true,
    });
  } catch (err) {
    respond500(res, "POST /api/services", err);
  }
});

app.put("/api/services/:id", async (req, res) => {
  try {
    const { isActive, is_active, category, duration, ...rest } = req.body ?? {};
    const payload: any = { ...rest };
    
    // Map isActive to is_active
    if (isActive !== undefined) payload.is_active = isActive;
    if (is_active !== undefined) payload.is_active = is_active;
    
    // Map duration to duration_minutes
    if (duration !== undefined) payload.duration_minutes = Number(duration);
    
    // Handle category: convert category string to category_id
    if (category && typeof category === "string") {
      const { data: categories } = await supabase
        .from("categories")
        .select("id")
        .eq("name", category)
        .limit(1);
      
      if (categories && categories.length > 0) {
        payload.category_id = categories[0].id;
      }
    } else if (req.body.category_id !== undefined) {
      payload.category_id = req.body.category_id;
    }

    const { data, error } = await supabase
      .from("services")
      .update(payload)
      .eq("id", req.params.id)
      .select();
    if (error) throw error;
    
    const row = data?.[0];
    
    // Fetch category name for response
    let categoryName = "";
    if (row?.category_id) {
      const { data: categories } = await supabase
        .from("categories")
        .select("name")
        .eq("id", row.category_id)
        .limit(1);
      if (categories && categories.length > 0) {
        categoryName = categories[0].name;
      }
    }
    
    res.json({
      ...row,
      category: categoryName,
      duration: row.duration_minutes,
      isActive: row.is_active ?? true,
    });
  } catch (err) {
    respond500(res, "PUT /api/services", err);
  }
});

app.delete("/api/services/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("services").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    respond500(res, "DELETE /api/services", err);
  }
});

// Staff routes helpers - v6-schema-sync deployed
async function getCleanStaffRow(row: any) {
  if (!row) return null;
  return {
    ...row,
    // Map database specialization back to position for frontend
    position: row.specialization ?? "",
    isActive: row.is_active ?? true,
  };
}

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
    const mapped = await Promise.all((data ?? []).map(getCleanStaffRow));
    res.json(mapped);
  } catch (err) {
    respond500(res, "GET /api/staff", err);
  }
});

app.post("/api/staff", async (req, res) => {
  try {
    const v = "v6-schema-sync";
    logger.info({ body: req.body, context: "POST /api/staff", v }, "Request received");
    
    // Whitelist based on provided Supabase schema
    const payload: any = {
      name: req.body.name,
      phone: req.body.phone,
      email: req.body.email,
      // Map frontend 'position' to database 'specialization'
      specialization: req.body.specialization ?? req.body.position,
      commission: req.body.commission ? Number(req.body.commission) : 0,
      is_active: req.body.is_active ?? req.body.isActive ?? true
    };

    logger.info({ payload, context: "POST /api/staff", v }, "Final payload for Supabase");

    const { data, error } = await supabase.from("staff").insert(payload).select();
    
    if (error) {
      logger.error({ err: error, payload, context: "POST /api/staff", v }, "Supabase error");
      throw error;
    }
    
    const row = await getCleanStaffRow(data?.[0]);
    res.json(row);
  } catch (err) {
    respond500(res, "POST /api/staff", err);
  }
});

app.put("/api/staff/:id", async (req, res) => {
  try {
    const v = "v6-schema-sync";
    logger.info({ id: req.params.id, body: req.body, context: "PUT /api/staff", v }, "Request received");
    
    const payload: any = {};
    if (req.body.name !== undefined) payload.name = req.body.name;
    if (req.body.phone !== undefined) payload.phone = req.body.phone;
    if (req.body.email !== undefined) payload.email = req.body.email;
    if (req.body.commission !== undefined) payload.commission = Number(req.body.commission);
    
    // Handle position/specialization mapping
    if (req.body.specialization !== undefined) payload.specialization = req.body.specialization;
    else if (req.body.position !== undefined) payload.specialization = req.body.position;

    const activeVal = req.body.is_active ?? req.body.isActive;
    if (activeVal !== undefined) payload.is_active = !!activeVal;

    logger.info({ id: req.params.id, payload, context: "PUT /api/staff", v }, "Final payload for Supabase");

    const { data, error } = await supabase
      .from("staff")
      .update(payload)
      .eq("id", req.params.id)
      .select();
      
    if (error) {
      logger.error({ err: error, id: req.params.id, payload, context: "PUT /api/staff", v }, "Supabase error");
      throw error;
    }
    
    const row = await getCleanStaffRow(data?.[0]);
    res.json(row);
  } catch (err) {
    respond500(res, "PUT /api/staff", err);
  }
});

app.delete("/api/staff/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("staff").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    respond500(res, "DELETE /api/staff", err);
  }
});

// Transactions routes
app.get("/api/transactions", async (req, res) => {
  try {
    const context = "GET /api/transactions";
    const projections = [
      "id, customer_id, items, total_amount, payment_method, payment_status, created_at, notes, discount, tax, subtotal, staff_id",
      "id, customer_id, total_amount, created_at",
      "*"
    ];

    const result = await trySelect<any>(context, "transactions", projections, (q) =>
      q.order("created_at", { ascending: false })
    );

    if (result.error) {
      respond500(res, context, result.error);
      return;
    }

    const customerIds = Array.from(
      new Set(
        (result.data ?? [])
          .map((t) => pickFirst(t, ["customer_id", "customerId"]))
          .filter(Boolean),
      ),
    );

    let customerNameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds);

      if (!customersError) {
        customerNameById = new Map(
          (customers ?? []).map((c: any) => [String(c.id), String(c.name ?? "")]),
        );
      }
    }

    const transactions = (result.data ?? []).map((t: any) => {
      const customerId = pickFirst(t, ["customer_id", "customerId"]);
      const rawReceipt = pickFirst(t, ["receipt_number", "receipt_no", "receipt", "invoice_number"]);
      return {
        ...t,
        total: Number(pickFirst(t, ["total_amount", "total", "grand_total", "amount"]) ?? 0),
        receiptNumber: rawReceipt || `INV-${String(t.id).slice(0, 8).toUpperCase()}`,
        customerName:
          pickFirst(t, ["customer_name", "customerName", "customer"]) ??
          (customerId ? customerNameById.get(String(customerId)) : "") ??
          "",
      };
    });

    res.json(transactions);
  } catch (err) {
    respond500(res, "GET /api/transactions", err);
  }
});

app.post("/api/transactions", async (req, res) => {
  try {
    const { data, error } = await supabase.from("transactions").insert(req.body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    respond500(res, "POST /api/transactions", err);
  }
});

app.put("/api/transactions/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("transactions")
      .update(req.body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    respond500(res, "PUT /api/transactions", err);
  }
});

app.delete("/api/transactions/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("transactions").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    respond500(res, "DELETE /api/transactions", err);
  }
});

// Expenses routes
app.get("/api/expenses", async (req, res) => {
  try {
    const { category, startDate, endDate } = req.query as {
      category?: string;
      startDate?: string;
      endDate?: string;
    };

    let query = supabase.from("expenses").select("*").order("expense_date", { ascending: false });

    if (category && category !== "all") {
      query = query.eq("category", category);
    }
    if (startDate) {
      query = query.gte("expense_date", startDate);
    }
    if (endDate) {
      query = query.lte("expense_date", endDate);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error, context: "GET /api/expenses" }, "Supabase error");
      res.status(500).json({ error: error.message, context: "GET /api/expenses" });
      return;
    }

    // Map expense_date to date for frontend compatibility if needed
    const mappedData = (data ?? []).map((e: any) => ({
      ...e,
      date: e.expense_date || e.created_at,
    }));

    res.json(mappedData);
  } catch (err) {
    respond500(res, "GET /api/expenses", err);
  }
});

app.post("/api/expenses", async (req, res) => {
  try {
    const { date, expense_date, ...payload } = req.body;
    const finalDate = expense_date || date || new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("expenses")
      .insert({ ...payload, expense_date: finalDate })
      .select();
    if (error) throw error;
    res.json(data?.[0]);
  } catch (err) {
    respond500(res, "POST /api/expenses", err);
  }
});

app.put("/api/expenses/:id", async (req, res) => {
  try {
    const { date, expense_date, ...payload } = req.body;
    const updateData: any = { ...payload };
    if (expense_date || date) {
      updateData.expense_date = expense_date || date;
    }
    const { data, error } = await supabase
      .from("expenses")
      .update(updateData)
      .eq("id", req.params.id)
      .select();
    if (error) throw error;
    res.json(data?.[0]);
  } catch (err) {
    respond500(res, "PUT /api/expenses", err);
  }
});

app.delete("/api/expenses/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("expenses").delete().eq("id", req.params.id);
    if (error) throw error;
    res.status(204).send();
  } catch (err) {
    respond500(res, "DELETE /api/expenses", err);
  }
});

// Dashboard routes
app.get("/api/dashboard/summary", async (req, res) => {
  try {
    const period = (req.query.period as string) || "7d";
    let days = 7;
    if (period === "today") days = 0;
    else if (period === "30d" || period === "month") days = 30;
    else if (period === "year") days = 365;

    const startDate = new Date();
    if (days > 0) {
      startDate.setDate(startDate.getDate() - days);
    } else {
      startDate.setHours(0, 0, 0, 0);
    }

    const [customersResult, servicesResult, staffResult, transactionsResult, appointmentsResult] =
      await Promise.all([
        supabase.from("customers").select("id", { count: "exact", head: true }),
        supabase.from("services").select("id", { count: "exact", head: true }),
        supabase.from("staff").select("id", { count: "exact", head: true }),
        supabase
          .from("transactions")
          .select("total_amount", { count: "exact" })
          .gte("created_at", startDate.toISOString()),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .gte("created_at", startDate.toISOString()),
      ]);

    if (customersResult.error || servicesResult.error || staffResult.error || transactionsResult.error) {
      res.status(500).json({
        error:
          customersResult.error?.message ||
          servicesResult.error?.message ||
          staffResult.error?.message ||
          transactionsResult.error?.message ||
          "Unknown supabase error",
        context: "GET /api/dashboard/summary",
      });
      return;
    }

    const revenue = (transactionsResult.data ?? []).reduce(
      (sum, t) => sum + Number(t.total_amount || 0),
      0,
    );

    res.json({
      revenue,
      transactionCount: transactionsResult.count || 0,
      customerCount: customersResult.count || 0,
      appointmentCount: appointmentsResult.count || 0,
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
      "id, customer_id, total_amount, created_at",
      "*"
    ];

    const result = await trySelect<any>(context, "transactions", projections, (q) =>
      q.order("created_at", { ascending: false }).limit(limit),
    );

    if (result.error) {
      logger.error({ err: result.error, context }, "Supabase error");
      res.status(500).json({ error: errorToMessage(result.error), context });
      return;
    }

    const customerIds = Array.from(
      new Set(
        (result.data ?? [])
          .map((t) => pickFirst(t, ["customer_id", "customerId"]))
          .filter(Boolean),
      ),
    );

    let customerNameById = new Map<string, string>();
    if (customerIds.length > 0) {
      const { data: customers, error: customersError } = await supabase
        .from("customers")
        .select("id, name")
        .in("id", customerIds);

      if (!customersError) {
        customerNameById = new Map(
          (customers ?? []).map((c: any) => [String(c.id), String(c.name ?? "")]),
        );
      }
    }

    const transactions =
      result.data?.map((t) => {
        const receiptNumber =
          pickFirst(t, ["receipt_number", "receipt_no", "receipt", "invoice_number"]) ??
          String(t.id);

        const customerId = pickFirst(t, ["customer_id", "customerId"]);
        const customerName =
          pickFirst(t, ["customer_name", "customerName", "customer"]) ??
          (customerId ? customerNameById.get(String(customerId)) : "") ??
          "";

        const total = Number(
          pickFirst(t, ["total_amount", "total", "grand_total", "amount", "grandTotal"]) ?? 0,
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
    const period = (req.query.period as string) || "week";
    const endDate = new Date();
    const startDate = new Date(endDate);
    if (period === "week") {
      startDate.setDate(endDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "month") {
      startDate.setDate(endDate.getDate() - 29);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "year") {
      startDate.setMonth(endDate.getMonth() - 11);
      startDate.setDate(1);
      startDate.setHours(0, 0, 0, 0);
    } else {
      startDate.setDate(endDate.getDate() - 6);
      startDate.setHours(0, 0, 0, 0);
    }

    const context = "GET /api/dashboard/revenue-chart";

    const isoDate = (d: Date) => d.toISOString().slice(0, 10);
    const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthLabel = (d: Date) => d.toLocaleString(undefined, { month: "short" });

    const txResult = await trySelect<any>(
      context,
      "transactions",
      ["total_amount, created_at", "total, created_at", "grand_total, created_at", "amount, created_at", "created_at"],
      (q) =>
        q
          .gte("created_at", startDate.toISOString())
          .lte("created_at", endDate.toISOString())
          .order("created_at", { ascending: true }),
    );

    if (txResult.error) {
      res.status(500).json({ error: errorToMessage(txResult.error), context });
      return;
    }

    const { data: expensesData, error: expensesError } = await supabase
      .from("expenses")
      .select("amount, expense_date, created_at")
      .gte("expense_date", isoDate(startDate))
      .lte("expense_date", isoDate(endDate))
      .order("expense_date", { ascending: true });

    if (expensesError) {
      logger.warn({ err: expensesError, context }, "Failed to load expenses for revenue chart; defaulting to 0");
    }

    const buckets: Array<{ key: string; label: string; revenue: number; expenses: number }> = [];

    if (period === "year") {
      const cursor = new Date(startDate);
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= endDate) {
        buckets.push({ key: monthKey(cursor), label: monthLabel(cursor), revenue: 0, expenses: 0 });
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      const cursor = new Date(startDate);
      cursor.setHours(0, 0, 0, 0);
      while (cursor <= endDate) {
        const key = isoDate(cursor);
        buckets.push({ key, label: cursor.toLocaleDateString(), revenue: 0, expenses: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const bucketByKey = new Map(buckets.map((b) => [b.key, b] as const));

    (txResult.data ?? []).forEach((tx) => {
      const createdAt = pickFirst(tx, ["created_at", "createdAt"]);
      if (!createdAt) return;
      const d = new Date(createdAt);
      const key = period === "year" ? monthKey(d) : isoDate(d);
      const b = bucketByKey.get(key);
      if (!b) return;
      const value = Number(pickFirst(tx, ["total_amount", "total", "grand_total", "amount"]) ?? 0);
      b.revenue += value;
    });

    (expensesData ?? []).forEach((ex: any) => {
      const raw = ex?.expense_date || ex?.created_at;
      if (!raw) return;
      const d = new Date(raw);
      const key = period === "year" ? monthKey(d) : isoDate(d);
      const b = bucketByKey.get(key);
      if (!b) return;
      const value = Number(ex?.amount ?? 0);
      b.expenses += value;
    });

    res.json(buckets.map(({ label, revenue, expenses }) => ({ label, revenue, expenses })));
  } catch (err) {
    respond500(res, "GET /api/dashboard/revenue-chart", err);
  }
});

app.get("/api/dashboard/top-services", async (req, res) => {
  try {
    const context = "GET /api/dashboard/top-services";
    const result = await trySelect<any>(context, "transactions", ["items"], (q) =>
      q.order("created_at", { ascending: false }).limit(200)
    );

    if (result.error) {
      res.json([]);
      return;
    }

    const serviceStats: Record<string, { count: number; revenue: number; name: string; serviceId: string }> = {};

    for (const tx of result.data ?? []) {
      const items = (tx as any).items;
      if (!Array.isArray(items)) continue;

      for (const it of items) {
        const serviceId = String(pickFirst(it, ["serviceId", "service_id", "id"]) ?? "");
        if (!serviceId) continue;
        const serviceName = String(pickFirst(it, ["serviceName", "service_name", "name"]) ?? "Unknown");
        const qty = Number(pickFirst(it, ["quantity", "qty"]) ?? 1);
        const price = Number(pickFirst(it, ["price", "service_price", "unitPrice"]) ?? 0);
        
        if (!serviceStats[serviceId]) {
          serviceStats[serviceId] = { serviceId, name: serviceName, count: 0, revenue: 0 };
        }
        serviceStats[serviceId].count += qty;
        serviceStats[serviceId].revenue += (qty * price);
      }
    }

    res.json(Object.values(serviceStats).sort((a, b) => b.revenue - a.revenue).slice(0, 5));
  } catch (err) {
    respond500(res, "GET /api/dashboard/top-services", err);
  }
});

export default app;
