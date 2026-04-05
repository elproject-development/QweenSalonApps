import { Router } from "express";
import { supabase } from "../lib/supabase";
const router = Router();
router.get("/", async (req, res) => {
    try {
        const { startDate, endDate, paymentMethod, customerId } = req.query;
        let query = supabase
            .from("transactions")
            .select(`
        *,
        customers(name, phone)
      `)
            .order("created_at", { ascending: false });
        if (startDate && typeof startDate === "string") {
            query = query.gte("created_at", new Date(startDate).toISOString());
        }
        if (endDate && typeof endDate === "string") {
            const endDateTime = new Date(endDate);
            endDateTime.setDate(endDateTime.getDate() + 1);
            query = query.lt("created_at", endDateTime.toISOString());
        }
        if (paymentMethod && typeof paymentMethod === "string") {
            query = query.eq("payment_method", paymentMethod);
        }
        if (customerId && typeof customerId === "string") {
            const { data: customers } = await supabase.from("customers").select("*");
            const customer = customers?.find((c) => {
                const transformedId = parseInt(c.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
                return transformedId === parseInt(customerId);
            });
            if (customer) {
                query = query.eq("customer_id", customer.id);
            }
        }
        const { data, error } = await query;
        if (error) {
            console.error("Error fetching transactions:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        const transformedData = data?.map((transaction) => ({
            id: parseInt(transaction.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            receiptNumber: `TXN${String(parseInt(transaction.id.replace(/[^0-9]/g, "").substring(0, 8) || "1")).padStart(6, "0")}`,
            customerId: transaction.customer_id,
            customerName: transaction.customers?.name || "Pelanggan Umum",
            customerPhone: transaction.customers?.phone || "",
            staffName: "No Staff",
            items: transaction.items || [],
            subtotal: Number(transaction.subtotal || 0),
            discount: Number(transaction.discount || 0),
            tax: Number(transaction.tax || 0),
            total: Number(transaction.total_amount || 0),
            paymentMethod: transaction.payment_method,
            paymentStatus: transaction.payment_status,
            notes: transaction.notes || "",
            createdAt: transaction.created_at,
            updatedAt: transaction.updated_at,
        })) || [];
        res.json(transformedData);
    }
    catch (error) {
        console.error("Error in transactions list:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.post("/", async (req, res) => {
    try {
        const requestData = req.body.data ? req.body.data : req.body;
        const { customerId, staffId, items, discount, tax, paymentMethod } = requestData;
        if (!items || !Array.isArray(items) || items.length === 0) {
            res.status(400).json({ error: "Items are required" });
            return;
        }
        const cartItems = await Promise.all(items.map(async (item) => {
            const { data: services } = await supabase.from("services").select("*");
            const service = services?.find((s) => {
                const transformedId = parseInt(s.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
                return transformedId === Number(item.serviceId);
            });
            const servicePrice = Number(service?.price || 0);
            const quantity = Number(item.quantity || 1);
            const itemSubtotal = servicePrice * quantity;
            return {
                service_id: service?.id,
                service_name: service?.name || "Unknown Service",
                serviceName: service?.name || "Unknown Service",
                service_price: servicePrice,
                price: servicePrice,
                quantity,
                subtotal: itemSubtotal,
            };
        }));
        const calculatedSubtotal = cartItems.reduce((sum, item) => sum + item.subtotal, 0);
        const total = calculatedSubtotal - Number(discount || 0) + Number(tax || 0);
        let actualCustomerId = null;
        if (customerId && customerId !== "general") {
            const { data: customers } = await supabase.from("customers").select("*");
            const customer = customers?.find((c) => {
                const transformedId = parseInt(c.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
                return transformedId === Number(customerId);
            });
            actualCustomerId = customer?.id || null;
        }
        let actualStaffId = null;
        if (staffId && staffId !== "none") {
            const { data: staff } = await supabase.from("staff").select("*");
            const foundStaff = staff?.find((s) => {
                const transformedId = parseInt(s.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
                return transformedId === Number(staffId);
            });
            actualStaffId = foundStaff?.id || null;
        }
        const { data: result, error } = await supabase
            .from("transactions")
            .insert({
            customer_id: actualCustomerId,
            staff_id: actualStaffId,
            items: cartItems,
            subtotal: calculatedSubtotal,
            discount: Number(discount || 0),
            tax: Number(tax || 0),
            total_amount: total,
            payment_method: paymentMethod,
            payment_status: "paid",
            notes: null,
        })
            .select(`
        *,
        customers(name, phone)
      `)
            .single();
        if (error) {
            console.error("Error creating transaction:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        const transformedData = {
            id: parseInt(result.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            receiptNumber: `TXN${String(parseInt(result.id.replace(/[^0-9]/g, "").substring(0, 8) || "1")).padStart(6, "0")}`,
            customerId: result.customer_id,
            customerName: result.customers?.name || "Pelanggan Umum",
            customerPhone: result.customers?.phone || "",
            staffName: actualStaffId ? "Staff Assigned" : "No Staff",
            items: result.items || [],
            subtotal: Number(result.subtotal || 0),
            discount: Number(result.discount || 0),
            tax: Number(result.tax || 0),
            total: Number(result.total_amount || 0),
            paymentMethod: result.payment_method,
            paymentStatus: result.payment_status,
            notes: result.notes || "",
            createdAt: result.created_at,
            updatedAt: result.updated_at,
        };
        res.status(201).json(transformedData);
    }
    catch (error) {
        console.error("Error in transaction create:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { data: transactions, error: findError } = await supabase
            .from("transactions")
            .select(`
        *,
        customers(name, phone),
        staff(name)
      `);
        if (findError || !transactions) {
            res.status(500).json({ error: "Failed to fetch transactions" });
            return;
        }
        const transaction = transactions.find((t) => {
            const transformedId = parseInt(t.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
            return transformedId === parseInt(id);
        });
        if (!transaction) {
            res.status(404).json({ error: "Transaction not found" });
            return;
        }
        const transformedData = {
            id: parseInt(transaction.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            receiptNumber: `TXN${String(parseInt(transaction.id.replace(/[^0-9]/g, "").substring(0, 8) || "1")).padStart(6, "0")}`,
            customerId: transaction.customer_id,
            customerName: transaction.customers?.name || "Pelanggan Umum",
            customerPhone: transaction.customers?.phone || "",
            staffName: transaction.staff?.name || "No Staff",
            items: transaction.items || [],
            subtotal: Number(transaction.subtotal || 0),
            discount: Number(transaction.discount || 0),
            tax: Number(transaction.tax || 0),
            total: Number(transaction.total_amount || 0),
            paymentMethod: transaction.payment_method,
            paymentStatus: transaction.payment_status,
            notes: transaction.notes || "",
            createdAt: transaction.created_at,
            updatedAt: transaction.updated_at,
        };
        res.json(transformedData);
    }
    catch (error) {
        console.error("Error in transaction get:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export default router;
