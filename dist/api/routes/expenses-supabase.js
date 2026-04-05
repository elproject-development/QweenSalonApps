import { Router } from "express";
import { supabase } from "../lib/supabase";
const router = Router();
router.get("/", async (req, res) => {
    try {
        const { category, startDate, endDate } = req.query;
        let query = supabase
            .from("expenses")
            .select("*")
            .order("expense_date", { ascending: false });
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
            console.error("Error fetching expenses:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        const transformedData = data?.map((expense) => ({
            id: parseInt(expense.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            description: expense.description,
            category: expense.category,
            amount: Number(expense.amount),
            date: expense.expense_date,
            notes: expense.notes || "",
            createdAt: expense.created_at,
            updatedAt: expense.updated_at,
        })) || [];
        res.json(transformedData);
    }
    catch (error) {
        console.error("Error in expenses list:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.post("/", async (req, res) => {
    try {
        const { description, category, amount, date, notes } = req.body;
        if (!description || !category || !amount || !date) {
            res
                .status(400)
                .json({ error: "Description, category, amount, and date are required" });
            return;
        }
        const { data, error } = await supabase
            .from("expenses")
            .insert({
            description,
            category,
            amount: parseFloat(amount),
            expense_date: date,
            notes: notes || null,
        })
            .select()
            .single();
        if (error) {
            console.error("Error creating expense:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        const transformedData = {
            id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            description: data.description,
            category: data.category,
            amount: Number(data.amount),
            date: data.expense_date,
            notes: data.notes || "",
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
        res.status(201).json(transformedData);
    }
    catch (error) {
        console.error("Error in expense create:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { description, category, amount, date, notes } = req.body;
        const { data: allExpenses, error: fetchError } = await supabase
            .from("expenses")
            .select("id");
        if (fetchError || !allExpenses) {
            res.status(500).json({ error: "Failed to fetch expenses for matching" });
            return;
        }
        const expense = allExpenses.find((e) => {
            const transformedId = parseInt(e.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
            return transformedId === parseInt(id);
        });
        if (!expense) {
            res.status(404).json({ error: "Expense not found" });
            return;
        }
        const { data, error } = await supabase
            .from("expenses")
            .update({
            description,
            category,
            amount: parseFloat(amount),
            expense_date: date,
            notes: notes || null,
        })
            .eq("id", expense.id)
            .select()
            .single();
        if (error) {
            console.error("Error updating expense:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        const transformedData = {
            id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
            description: data.description,
            category: data.category,
            amount: Number(data.amount),
            date: data.expense_date,
            notes: data.notes || "",
            createdAt: data.created_at,
            updatedAt: data.updated_at,
        };
        res.json(transformedData);
    }
    catch (error) {
        console.error("Error in expense update:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { data: allExpenses, error: fetchError } = await supabase
            .from("expenses")
            .select("id");
        if (fetchError || !allExpenses) {
            res.status(500).json({ error: "Failed to fetch expenses for matching" });
            return;
        }
        const expense = allExpenses.find((e) => {
            const transformedId = parseInt(e.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
            return transformedId === parseInt(id);
        });
        if (!expense) {
            res.status(404).json({ error: "Expense not found" });
            return;
        }
        const { error } = await supabase.from("expenses").delete().eq("id", expense.id);
        if (error) {
            console.error("Error deleting expense:", error);
            res.status(500).json({ error: error.message });
            return;
        }
        res.status(204).send();
    }
    catch (error) {
        console.error("Error in expense delete:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});
export default router;
