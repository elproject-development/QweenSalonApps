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
      .order("appointment_date", { ascending: false });

    let query = baseQuery;

    // Filter by date range for timestamptz field
    if (date) {
      const startOfDay = new Date(date);
      const endOfDay = new Date(date);
      startOfDay.setUTCHours(0, 0, 0, 0);
      endOfDay.setUTCHours(23, 59, 59, 999);
      
      query = query
        .gte("appointment_date", startOfDay.toISOString())
        .lte("appointment_date", endOfDay.toISOString());
    }
    
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error, context: "GET /api/appointments" }, "Supabase error");
      res.status(500).json({ error: error.message, context: "GET /api/appointments" });
      return;
    }

    // Enrich appointments with customer, staff, and service names
    const customerIds = Array.from(
      new Set((data ?? []).map((a: any) => a.customer_id).filter(Boolean)),
    );
    const staffIds = Array.from(
      new Set((data ?? []).map((a: any) => a.staff_id).filter(Boolean)),
    );
    const serviceIds = Array.from(
      new Set((data ?? []).map((a: any) => a.service_id).filter(Boolean)),
    );

    let customerById = new Map<string, { name: string; phone: string }>();
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, name, phone")
        .in("id", customerIds);
      if (customers) {
        customerById = new Map(
          customers.map((c: any) => [String(c.id), { name: String(c.name ?? ""), phone: String(c.phone ?? "") }]),
        );
      }
    }

    let staffById = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staff } = await supabase
        .from("staff")
        .select("id, name")
        .in("id", staffIds);
      if (staff) {
        staffById = new Map(staff.map((s: any) => [String(s.id), String(s.name ?? "")]));
      }
    }

    let serviceById = new Map<string, string>();
    if (serviceIds.length > 0) {
      const { data: services } = await supabase
        .from("services")
        .select("id, name")
        .in("id", serviceIds);
      if (services) {
        serviceById = new Map(services.map((s: any) => [String(s.id), String(s.name ?? "")]));
      }
    }

    const enriched = (data ?? []).map((a: any) => {
      const customer = a.customer_id ? customerById.get(String(a.customer_id)) : null;
      const staff = a.staff_id ? staffById.get(String(a.staff_id)) : null;
      const service = a.service_id ? serviceById.get(String(a.service_id)) : null;

      return {
        ...a,
        customerName: customer?.name || "Tidak diketahui",
        customerPhone: customer?.phone || "Tidak ada",
        staffName: staff || null,
        serviceName: service || "Tidak diketahui",
        scheduledAt: a.appointment_date,
      };
    });

    res.json(enriched);
  } catch (err) {
    respond500(res, "GET /api/appointments", err);
  }
});

app.post("/api/appointments", async (req, res) => {
  try {
    const body = req.body || {};
    const payload: any = {
      customer_id: body.customerId || body.customer_id,
      staff_id: body.staffId || body.staff_id,
      service_id: body.serviceId || body.service_id,
      appointment_date: body.scheduledAt || body.appointment_date || body.scheduled_at,
      status: body.status || "pending",
      notes: body.notes,
    };

    // If customerName is provided instead of customerId, look up customer by name
    if (!payload.customer_id && body.customerName) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id, phone")
        .eq("name", body.customerName)
        .limit(1);
      if (customers && customers.length > 0) {
        payload.customer_id = customers[0].id;
      } else {
        // Create new customer if not exists
        const { data: newCustomer } = await supabase
          .from("customers")
          .insert({ 
            name: body.customerName, 
            phone: body.customerPhone || "" 
          })
          .select()
          .single();
        if (newCustomer) {
          payload.customer_id = newCustomer.id;
        }
      }
    }

    // If staffName is provided instead of staffId, look up staff by name
    if (!payload.staff_id && body.staffName) {
      const { data: staff } = await supabase
        .from("staff")
        .select("id")
        .eq("name", body.staffName)
        .limit(1);
      if (staff && staff.length > 0) {
        payload.staff_id = staff[0].id;
      }
    }

    // If serviceName is provided instead of serviceId, look up service by name
    if (!payload.service_id && body.serviceName) {
      const { data: services } = await supabase
        .from("services")
        .select("id")
        .eq("name", body.serviceName)
        .limit(1);
      if (services && services.length > 0) {
        payload.service_id = services[0].id;
      }
    }

    // Remove undefined/null values
    Object.keys(payload).forEach(key => {
      if (payload[key] === undefined || payload[key] === null) {
        delete payload[key];
      }
    });

    const { data, error } = await supabase.from("appointments").insert(payload).select();
    if (error) throw error;
    res.json(data?.[0]);
  } catch (err) {
    respond500(res, "POST /api/appointments", err);
  }
});

app.put("/api/appointments/:id", async (req, res) => {
  try {
    const body = req.body || {};
    const payload: any = {};
    if (body.customerId !== undefined || body.customer_id !== undefined) payload.customer_id = body.customerId || body.customer_id;
    if (body.staffId !== undefined || body.staff_id !== undefined) payload.staff_id = body.staffId || body.staff_id;
    if (body.serviceId !== undefined || body.service_id !== undefined) payload.service_id = body.serviceId || body.service_id;
    if (body.scheduledAt !== undefined || body.appointment_date !== undefined || body.scheduled_at !== undefined) payload.appointment_date = body.scheduledAt || body.appointment_date || body.scheduled_at;
    if (body.status !== undefined) payload.status = body.status;
    if (body.notes !== undefined) payload.notes = body.notes;

    // If customerName is provided, look up customer by name
    if (!payload.customer_id && body.customerName) {
      const { data: customers } = await supabase
        .from("customers")
        .select("id")
        .eq("name", body.customerName)
        .limit(1);
      if (customers && customers.length > 0) {
        payload.customer_id = customers[0].id;
      }
    }

    // If staffName is provided, look up staff by name
    if (!payload.staff_id && body.staffName) {
      const { data: staff } = await supabase
        .from("staff")
        .select("id")
        .eq("name", body.staffName)
        .limit(1);
      if (staff && staff.length > 0) {
        payload.staff_id = staff[0].id;
      }
    }

    // If serviceName is provided, look up service by name
    if (!payload.service_id && body.serviceName) {
      const { data: services } = await supabase
        .from("services")
        .select("id")
        .eq("name", body.serviceName)
        .limit(1);
      if (services && services.length > 0) {
        payload.service_id = services[0].id;
      }
    }

    const { data, error } = await supabase
      .from("appointments")
      .update(payload)
      .eq("id", req.params.id)
      .select();
    if (error) throw error;
    res.json(data?.[0]);
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

function canonicalizeCategoryName(categoryName: unknown) {
  const trimmed = typeof categoryName === "string" ? categoryName.trim() : "";
  if (!trimmed) return "";

  const key = trimmed.toLowerCase();
  if (key === "nail care") return "Nail Art";
  if (key === "nail art") return "Nail Art";
  if (key === "skin care") return "Perawatan Wajah";
  if (key === "perawatan wajah") return "Perawatan Wajah";
  if (key === "body treatment") return "Lainnya";
  return trimmed;
}

async function resolveCategoryIdByName(categoryName: unknown) {
  if (typeof categoryName !== "string") return null;
  const canonical = canonicalizeCategoryName(categoryName);
  if (!canonical) return null;

  const { data: exact } = await supabase
    .from("categories")
    .select("id")
    .eq("name", canonical)
    .limit(1);

  if (exact && exact.length > 0) return exact[0].id;

  const { data: insensitive } = await supabase
    .from("categories")
    .select("id")
    .ilike("name", `${canonical}%`)
    .limit(1);

  if (insensitive && insensitive.length > 0) return insensitive[0].id;
  return null;
}

async function resolveOrCreateCategoryIdByName(categoryName: unknown) {
  if (typeof categoryName !== "string") return null;
  const canonical = canonicalizeCategoryName(categoryName);
  if (!canonical) return null;

  const existingId = await resolveCategoryIdByName(canonical);
  if (existingId) return existingId;

  const { data: upserted, error: upsertError } = await supabase
    .from("categories")
    .upsert({ name: canonical }, { onConflict: "name" })
    .select("id")
    .limit(1);

  if (!upsertError && upserted && upserted.length > 0) return upserted[0].id;

  const { data: inserted, error: insertError } = await supabase
    .from("categories")
    .insert({ name: canonical })
    .select("id")
    .limit(1);

  if (!insertError && inserted && inserted.length > 0) return inserted[0].id;
  return await resolveCategoryIdByName(canonical);
}

function toDisplayCategoryName(categoryName: unknown) {
  const trimmed = typeof categoryName === "string" ? categoryName.trim() : "";
  if (!trimmed) return "";
  return canonicalizeCategoryName(trimmed);
}

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
      const categoryId = await resolveCategoryIdByName(category);

      if (categoryId) {
        query = query.eq("category_id", categoryId);
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
      category: s.category_id ? toDisplayCategoryName(categoryNameById.get(String(s.category_id)) ?? "") : "",
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
      const categoryId = await resolveOrCreateCategoryIdByName(category);
      if (categoryId) payload.category_id = categoryId;
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
      category: toDisplayCategoryName(categoryName),
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
      const categoryId = await resolveOrCreateCategoryIdByName(category);
      if (categoryId) payload.category_id = categoryId;
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
      category: toDisplayCategoryName(categoryName),
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
    id: String(row.id), // Convert to string for consistent comparison
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

    const staffIds = Array.from(
      new Set(
        (result.data ?? [])
          .map((t: any) => pickFirst(t, ["staff_id", "staffId"]))
          .filter(Boolean)
          .map((x: any) => String(x)),
      ),
    );

    let staffNameById = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staff, error: staffError } = await supabase
        .from("staff")
        .select("id, name")
        .in("id", staffIds);

      if (!staffError) {
        staffNameById = new Map(
          (staff ?? []).map((s: any) => [String(s.id), String(s.name ?? "")]),
        );
      }
    }

    const serviceIds = Array.from(
      new Set(
        (result.data ?? [])
          .flatMap((t: any) => {
            const items = pickFirst(t, ["items", "services", "transaction_items", "details"]) ?? [];
            if (!Array.isArray(items)) return [];
            return items
              .map((it: any) => it?.serviceId ?? it?.service_id ?? it?.id ?? it?.service?.id)
              .filter(Boolean)
              .map((x: any) => String(x));
          }),
      ),
    );

    let serviceById = new Map<string, { name: string; price: number }>();
    if (serviceIds.length > 0) {
      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("id, name, price")
        .in("id", serviceIds);

      if (!servicesError) {
        serviceById = new Map(
          (services ?? []).map((s: any) => [String(s.id), { name: String(s.name ?? ""), price: Number(s.price ?? 0) }]),
        );
      }
    }

    const transactions = (result.data ?? []).map((t: any) => {
      const customerId = pickFirst(t, ["customer_id", "customerId"]);
      const staffId = pickFirst(t, ["staff_id", "staffId"]);
      const rawReceipt = pickFirst(t, ["receipt_number", "receipt_no", "receipt", "invoice_number"]);

      const rawItems = pickFirst(t, ["items", "services", "transaction_items", "details"]) ?? [];
      const itemsArr = Array.isArray(rawItems) ? rawItems : [];
      const enrichedItems = itemsArr.map((it: any) => {
        const sid = it?.serviceId ?? it?.service_id ?? it?.id ?? it?.service?.id;
        const svc = sid ? serviceById.get(String(sid)) : undefined;
        const quantity = Number(it?.quantity ?? it?.qty ?? 1) || 1;
        const price = Number(it?.price ?? it?.amount ?? svc?.price ?? 0) || 0;
        const serviceName = String(it?.serviceName ?? it?.service_name ?? svc?.name ?? it?.name ?? "");
        const subtotal = Number(it?.subtotal ?? (price * quantity)) || 0;
        return {
          ...it,
          serviceId: sid ?? it?.serviceId,
          serviceName,
          quantity,
          price,
          subtotal,
        };
      });

      const subtotalVal = Number(pickFirst(t, ["subtotal", "sub_total"]) ?? 0) || enrichedItems.reduce((acc: number, it: any) => acc + (Number(it?.subtotal ?? 0) || 0), 0);
      const discountVal = Number(pickFirst(t, ["discount"]) ?? 0) || 0;
      const taxVal = Number(pickFirst(t, ["tax"]) ?? 0) || 0;
      const totalVal = Number(pickFirst(t, ["total_amount", "total", "grand_total", "amount"]) ?? (subtotalVal - discountVal + taxVal)) || 0;

      return {
        ...t,
        createdAt: pickFirst(t, ["createdAt", "created_at"]) ?? null,
        paymentMethod: pickFirst(t, ["paymentMethod", "payment_method"]) ?? "cash",
        status: pickFirst(t, ["status", "payment_status", "paymentStatus"]) ?? "completed",
        subtotal: subtotalVal,
        discount: discountVal,
        tax: taxVal,
        total: totalVal,
        items: enrichedItems,
        receiptNumber: rawReceipt || `INV-${String(t.id).slice(0, 8).toUpperCase()}`,
        customerName:
          pickFirst(t, ["customer_name", "customerName", "customer"]) ??
          (customerId ? customerNameById.get(String(customerId)) : "") ??
          "",
        staffName:
          pickFirst(t, ["staff_name", "staffName"]) ??
          (staffId ? staffNameById.get(String(staffId)) : "") ??
          "",
      };
    });

    // Override receiptNumber with sequential TRXDDMMNNNN (Asia/Jakarta) for consistent ordering
    const jktParts = (d: Date) => {
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "2-digit",
      });
      const parts = fmt.formatToParts(d);
      const dd = parts.find((p) => p.type === "day")?.value ?? "00";
      const mm = parts.find((p) => p.type === "month")?.value ?? "00";
      return { dd, mm };
    };

    const txAsc = [...transactions].sort((a: any, b: any) => {
      const ta = new Date(a?.createdAt ?? 0).getTime();
      const tb = new Date(b?.createdAt ?? 0).getTime();
      if (ta !== tb) return ta - tb;
      return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    });

    const receiptById = new Map<string, string>();
    const seqByDay = new Map<string, number>();

    for (const t of txAsc) {
      const createdAt = t?.createdAt;
      if (!createdAt) continue;
      const d = new Date(createdAt);
      if (isNaN(d.getTime())) continue;
      const { dd, mm } = jktParts(d);
      const dayKey = `${dd}${mm}`;
      const next = (seqByDay.get(dayKey) ?? 0) + 1;
      seqByDay.set(dayKey, next);
      const seq = String(next).padStart(4, "0");
      receiptById.set(String(t.id), `TRX${dayKey}${seq}`);
    }

    const transactionsWithSeq = transactions.map((t: any) => ({
      ...t,
      receiptNumber: receiptById.get(String(t.id)) ?? t.receiptNumber,
    }));

    res.json(transactionsWithSeq);
  } catch (err) {
    respond500(res, "GET /api/transactions", err);
  }
});

app.post("/api/transactions", async (req, res) => {
  try {
    const body = (req as any).body?.data ?? (req as any).body ?? {};

    // Whitelist based on Supabase transactions schema
    const payload: any = {
      customer_id: body.customerId || body.customer_id,
      appointment_id: body.appointmentId || body.appointment_id,
      items: body.items || [],
      total_amount: body.totalAmount || body.total_amount || body.total || 0,
      payment_method: body.paymentMethod || body.payment_method,
      payment_status: body.paymentStatus || body.payment_status,
      notes: body.notes,
      discount: body.discount ? Number(body.discount) : 0,
      tax: body.tax ? Number(body.tax) : 0,
      subtotal: body.subtotal ? Number(body.subtotal) : 0,
      staff_id: body.staffId || body.staff_id,
    };

    const itemsArr = Array.isArray(payload.items) ? payload.items : [];
    const serviceIds = Array.from(
      new Set(
        itemsArr
          .map((it: any) => it?.serviceId ?? it?.service_id ?? it?.id ?? it?.service?.id)
          .filter(Boolean)
          .map((x: any) => String(x)),
      ),
    );

    let priceByServiceId = new Map<string, number>();
    let serviceById = new Map<string, { name: string; price: number }>();
    if (serviceIds.length > 0) {
      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("id, name, price")
        .in("id", serviceIds);

      if (servicesError) throw servicesError;

      priceByServiceId = new Map(
        (services ?? []).map((s: any) => [String(s.id), Number(s.price ?? 0)]),
      );
      
      serviceById = new Map(
        (services ?? []).map((s: any) => [String(s.id), { name: String(s.name ?? ""), price: Number(s.price ?? 0) }]),
      );
    }

    const normalizedItems = itemsArr.map((it: any) => {
      const serviceId = it?.serviceId ?? it?.service_id ?? it?.id ?? it?.service?.id;
      const quantity = Number(it?.quantity ?? it?.qty ?? 1) || 1;
      const service = serviceId ? serviceById.get(String(serviceId)) : null;
      
      return {
        serviceId,
        quantity,
        price: service?.price || 0,
        serviceName: service?.name || "Unknown",
        subtotal: (service?.price || 0) * quantity,
      };
    });

    const computedSubtotal = normalizedItems.reduce((acc: number, it: any) => {
      const sid = it?.serviceId ? String(it.serviceId) : "";
      const price = sid ? (priceByServiceId.get(sid) ?? 0) : 0;
      const qty = Number(it?.quantity ?? 1) || 1;
      return acc + price * qty;
    }, 0);

    const discountVal = Number(payload.discount ?? 0) || 0;
    const taxVal = Number(payload.tax ?? 0) || 0;
    const subtotalVal = (Number(payload.subtotal ?? 0) || 0) > 0 ? Number(payload.subtotal) : computedSubtotal;
    const totalVal = subtotalVal - discountVal + taxVal;

    payload.items = normalizedItems;
    payload.subtotal = subtotalVal;
    payload.total_amount = totalVal;
    if (!payload.payment_status) payload.payment_status = "paid";
    if (!payload.payment_method) payload.payment_method = "cash";

    // Remove undefined/null values only for optional fields (not total_amount or items)
    Object.keys(payload).forEach(key => {
      if (key !== 'total_amount' && key !== 'items' && (payload[key] === undefined || payload[key] === null)) {
        delete payload[key];
      }
    });

    const { data, error } = await supabase.from("transactions").insert(payload).select();
    if (error) throw error;
    
    const row = data?.[0];

    // Generate sequential receipt number TRXDDMMNNNN (Asia/Jakarta) based on this day's transactions
    const createdAtIso = row?.created_at;
    const createdAtDate = createdAtIso ? new Date(createdAtIso) : new Date();
    const jktFmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const parts = jktFmt.formatToParts(createdAtDate);
    const dd = parts.find((p) => p.type === "day")?.value ?? "00";
    const mm = parts.find((p) => p.type === "month")?.value ?? "00";
    const yyyy = parts.find((p) => p.type === "year")?.value ?? String(createdAtDate.getUTCFullYear());

    // Build UTC range that corresponds to Asia/Jakarta day boundaries for querying
    const startJkt = new Date(`${yyyy}-${mm}-${dd}T00:00:00+07:00`);
    const endJkt = new Date(`${yyyy}-${mm}-${dd}T23:59:59.999+07:00`);

    let receiptNumber = `TRX${dd}${mm}0001`;
    const { data: dayTx, error: dayTxError } = await supabase
      .from("transactions")
      .select("id, created_at")
      .gte("created_at", startJkt.toISOString())
      .lte("created_at", endJkt.toISOString())
      .order("created_at", { ascending: true });

    if (!dayTxError && Array.isArray(dayTx) && dayTx.length > 0) {
      const idx = dayTx.findIndex((t: any) => String(t.id) === String(row.id));
      const seqNum = (idx >= 0 ? idx + 1 : dayTx.length);
      receiptNumber = `TRX${dd}${mm}${String(seqNum).padStart(4, "0")}`;
    }
    
    res.json({
      ...row,
      receiptNumber,
      createdAt: row.created_at,
    });
  } catch (err) {
    respond500(res, "POST /api/transactions", err);
  }
});

app.put("/api/transactions/:id", async (req, res) => {
  try {
    // Whitelist based on Supabase transactions schema
    const payload: any = {};
    if (req.body.customerId !== undefined || req.body.customer_id !== undefined) {
      payload.customer_id = req.body.customerId || req.body.customer_id;
    }
    if (req.body.appointmentId !== undefined || req.body.appointment_id !== undefined) {
      payload.appointment_id = req.body.appointmentId || req.body.appointment_id;
    }
    if (req.body.items !== undefined) payload.items = req.body.items;
    if (req.body.totalAmount !== undefined || req.body.total_amount !== undefined || req.body.total !== undefined) {
      payload.total_amount = Number(req.body.totalAmount || req.body.total_amount || req.body.total);
    }
    if (req.body.paymentMethod !== undefined || req.body.payment_method !== undefined) {
      payload.payment_method = req.body.paymentMethod || req.body.payment_method;
    }
    if (req.body.paymentStatus !== undefined || req.body.payment_status !== undefined) {
      payload.payment_status = req.body.paymentStatus || req.body.payment_status;
    }
    if (req.body.notes !== undefined) payload.notes = req.body.notes;
    if (req.body.discount !== undefined) payload.discount = Number(req.body.discount);
    if (req.body.tax !== undefined) payload.tax = Number(req.body.tax);
    if (req.body.subtotal !== undefined) payload.subtotal = Number(req.body.subtotal);
    if (req.body.staffId !== undefined || req.body.staff_id !== undefined) {
      payload.staff_id = req.body.staffId || req.body.staff_id;
    }

    const { data, error } = await supabase
      .from("transactions")
      .update(payload)
      .eq("id", req.params.id)
      .select();
    if (error) throw error;
    
    const row = data?.[0];
    res.json(row);
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
    const monthLabel = (d: Date) => {
      const labels = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      return labels[d.getMonth()] ?? String(d.getMonth() + 1);
    };

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
        const label =
          period === "week"
            ? cursor.toLocaleDateString("id-ID", { weekday: "short" })
            : cursor.toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit" });
        buckets.push({ key, label, revenue: 0, expenses: 0 });
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

// Staff reports route (without rank)
app.get("/api/reports/staff", async (req, res) => {
  try {
    const { startDate, endDate } = req.query as {
      startDate?: string;
      endDate?: string;
    };

    // Get all transactions
    let query = supabase
      .from("transactions")
      .select("id, staff_id, total_amount, items, created_at");

    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      query = query.lte("created_at", endDate);
    }

    const { data: transactions, error } = await query;

    if (error) throw error;

    if (!transactions || transactions.length === 0) {
      return res.json([]);
    }

    // Get all staff
    const staffIds = Array.from(
      new Set(transactions.map((t) => t.staff_id).filter(Boolean))
    );

    const { data: staffList } = await supabase
      .from("staff")
      .select("id, name")
      .in("id", staffIds);

    const staffMap = new Map(
      (staffList ?? []).map((s: any) => [String(s.id), s.name])
    );

    // Aggregate
    const stats: Record<
      string,
      {
        staffId: string;
        staffName: string;
        totalRevenue: number;
        totalTransactions: number;
        totalServices: number;
      }
    > = {};

    for (const t of transactions) {
      if (!t.staff_id) continue;

      const sid = String(t.staff_id);

      if (!stats[sid]) {
        stats[sid] = {
          staffId: sid,
          staffName: staffMap.get(sid) || "Unknown",
          totalRevenue: 0,
          totalTransactions: 0,
          totalServices: 0,
        };
      }

      stats[sid].totalRevenue += Number(t.total_amount || 0);
      stats[sid].totalTransactions += 1;

      // Count services from items
      if (Array.isArray(t.items)) {
        const totalQty = t.items.reduce(
          (sum: number, it: any) =>
            sum + Number(it.quantity || it.qty || 1),
          0
        );
        stats[sid].totalServices += totalQty;
      }
    }

    // Convert to array (sorted by revenue, without rank)
    const result = Object.values(stats).sort((a, b) => b.totalRevenue - a.totalRevenue);

    res.json(result);
  } catch (err) {
    respond500(res, "GET /api/reports/staff", err);
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

    const serviceStats: Record<string, { count: number; revenue: number }> = {};
    const serviceIds: string[] = [];

    for (const tx of result.data ?? []) {
      const items = (tx as any).items;
      if (!Array.isArray(items)) continue;

      for (const it of items) {
        const serviceId = String(pickFirst(it, ["serviceId", "service_id", "id"]) ?? "");
        if (!serviceId) continue;

        const qty = Number(pickFirst(it, ["quantity", "qty"]) ?? 1) || 1;
        const itemSubtotal = Number(pickFirst(it, ["subtotal"]) ?? 0) || 0;
        const itemPrice = Number(pickFirst(it, ["price", "service_price", "unitPrice"]) ?? 0) || 0;

        if (!serviceStats[serviceId]) {
          serviceStats[serviceId] = { count: 0, revenue: 0 };
          serviceIds.push(serviceId);
        }

        serviceStats[serviceId].count += qty;
        // Prefer stored subtotal, then item price, and finally fallback to service price lookup.
        if (itemSubtotal > 0) {
          serviceStats[serviceId].revenue += itemSubtotal;
        } else if (itemPrice > 0) {
          serviceStats[serviceId].revenue += qty * itemPrice;
        }
      }
    }

    let serviceById = new Map<string, { name: string; price: number }>();
    if (serviceIds.length > 0) {
      const { data: services, error: servicesError } = await supabase
        .from("services")
        .select("id, name, price")
        .in("id", serviceIds);

      if (servicesError) throw servicesError;

      serviceById = new Map(
        (services ?? []).map((s: any) => [String(s.id), { name: String(s.name ?? ""), price: Number(s.price ?? 0) }]),
      );
    }

    // Fill remaining revenue gaps (old transactions with no item subtotal/price)
    for (const sid of Object.keys(serviceStats)) {
      if (serviceStats[sid].revenue > 0) continue;
      const svc = serviceById.get(String(sid));
      if (!svc) continue;
      serviceStats[sid].revenue = serviceStats[sid].count * (svc.price || 0);
    }

    const topServices = Object.keys(serviceStats)
      .map((sid) => {
        const svc = serviceById.get(String(sid));
        return {
          serviceId: sid,
          serviceName: svc?.name || "Unknown",
          count: serviceStats[sid].count,
          revenue: serviceStats[sid].revenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    res.json(topServices);
  } catch (err) {
    respond500(res, "GET /api/dashboard/top-services", err);
  }
});

export default app;
