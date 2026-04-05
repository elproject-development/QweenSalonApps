import { Router } from "express";
import { supabase } from "../lib/supabase";
const router = Router();
router.get("/", async (req, res) => {
    try {
        const { search } = req.query;
        let query = supabase
            .from("customers")
            .select("*")
            .order("created_at", { ascending: false });
        if (search) {
            query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
        }
        const { data, error } = await query;
        if (error) {
            console.error("Error fetching customers:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        const transformedData = data?.map((customer) => ({
            id: parseInt(customer.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            uuid: customer.id,
            name: customer.name,
            phone: customer.phone,
            email: customer.email || "",
            address: customer.address || "",
            notes: customer.notes || "",
            createdAt: customer.created_at,
            updatedAt: customer.updated_at,
        })) || [];
        res.json(transformedData);
    }
    catch (error) {
        console.error("Error in customers list:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.post("/", async (req, res) => {
    try {
        const { name, phone, email, address, notes } = req.body;
        if (!name || !phone) {
            res.status(400).json({ error: "Name and phone are required" });
            return;
        }
        const { data, error } = await supabase
            .from("customers")
            .insert({
            name,
            phone,
            email: email || null,
            address: address || null,
            notes: notes || null,
        })
            .select()
            .single();
        if (error) {
            console.error("Error creating customer:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        const transformedData = {
            id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            uuid: data.id,
            name: data.name,
            phone: data.phone,
            email: data.email || "",
            address: data.address || "",
            notes: data.notes || "",
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
        res.status(201).json(transformedData);
    }
    catch (error) {
        console.error("Error in customer create:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, phone, email, address, notes } = req.body;
        const { data: allCustomers, error: fetchError } = await supabase
            .from("customers")
            .select("id");
        if (fetchError || !allCustomers) {
            res.status(500).json({ error: "Failed to fetch customers for matching" });
            return;
        }
        const customer = allCustomers.find((c) => {
            const transformedId = parseInt(c.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
            return transformedId === parseInt(id);
        });
        if (!customer) {
            res.status(404).json({ error: "Customer not found" });
            return;
        }
        const { data, error } = await supabase
            .from("customers")
            .update({
            name,
            phone,
            email: email || null,
            address: address || null,
            notes: notes || null,
        })
            .eq("id", customer.id)
            .select()
            .single();
        if (error) {
            console.error("Error updating customer:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        const transformedData = {
            id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            uuid: data.id,
            name: data.name,
            phone: data.phone,
            email: data.email || "",
            address: data.address || "",
            notes: data.notes || "",
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
        res.json(transformedData);
    }
    catch (error) {
        console.error("Error in customer update:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { data: allCustomers, error: fetchError } = await supabase
            .from("customers")
            .select("id");
        if (fetchError || !allCustomers) {
            res.status(500).json({ error: "Failed to fetch customers for matching" });
            return;
        }
        const customer = allCustomers.find((c) => {
            const transformedId = parseInt(c.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
            return transformedId === parseInt(id);
        });
        if (!customer) {
            res.status(404).json({ error: "Customer not found" });
            return;
        }
        const { error } = await supabase
            .from("customers")
            .delete()
            .eq("id", customer.id);
        if (error) {
            console.error("Error deleting customer:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        res.status(204).send();
    }
    catch (error) {
        console.error("Error in customer delete:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.get("/:id/history", async (req, res) => {
    try {
        const { id } = req.params;
        const { data: customers, error: customerError } = await supabase
            .from("customers")
            .select("*");
        if (customerError || !customers) {
            res.status(500).json({ error: "Failed to fetch customers" });
            return;
        }
        const customer = customers.find((c) => {
            const transformedId = parseInt(c.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
            return transformedId === parseInt(id);
        });
        if (!customer) {
            res.status(404).json({ error: "Customer not found" });
            return;
        }
        const { data: transactions, error: transactionError } = await supabase
            .from("transactions")
            .select("*")
            .eq("customer_id", customer.id)
            .order("created_at", { ascending: false });
        if (transactionError) {
            console.error("Error fetching customer history:", transactionError);
            res.status(500).json({ error: transactionError.message });
            return;
        }
        const transformedHistory = transactions?.map((tx) => ({
            id: parseInt(tx.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            receiptNumber: `TXN${String(parseInt(tx.id.replace(/[^0-9]/g, "").substring(0, 8) || "1")).padStart(6, "0")}`,
            total: Number(tx.total_amount),
            paymentMethod: tx.payment_method,
            paymentStatus: tx.payment_status,
            items: tx.items || [],
            createdAt: tx.created_at,
            updatedAt: tx.updated_at,
        })) || [];
        res.json(transformedHistory);
    }
    catch (error) {
        console.error("Error in customer history:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export default router;
