import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  try {
    console.log("Fetching staff from Supabase...");
    const { data, error } = await supabase
      .from("staff")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching staff:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    console.log("Staff data:", data);

    const transformedData =
      data?.map((staff) => ({
        id: parseInt(staff.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
        name: staff.name,
        phone: staff.phone || "",
        position: staff.specialization || "Staf",
        commission: staff.commission || 10,
        isActive: staff.is_active,
        createdAt: staff.created_at,
        updatedAt: staff.updated_at,
      })) || [];

    res.json(transformedData);
  } catch (error) {
    console.error("Error in staff list:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res): Promise<void> => {
  try {
    console.log("Creating staff:", req.body);
    const { name, phone, position, commission, isActive } = req.body;

    if (!name || !phone || !position) {
      res.status(400).json({ error: "Name, phone, and position are required" });
      return;
    }

    const { data, error } = await supabase
      .from("staff")
      .insert({
        name,
        phone,
        specialization: position,
        commission: commission || 10,
        is_active: isActive !== false,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating staff:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const transformedData = {
      id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
      name: data.name,
      phone: data.phone || "",
      position: data.specialization || "Staf",
      commission: data.commission || 10,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    res.status(201).json(transformedData);
  } catch (error) {
    console.error("Error in staff create:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, phone, position, commission, isActive } = req.body;

    const { data: allStaff, error: fetchError } = await supabase
      .from("staff")
      .select("id");

    if (fetchError || !allStaff) {
      res.status(500).json({ error: "Failed to fetch staff for matching" });
      return;
    }

    const staffMember = allStaff.find((s) => {
      const transformedId = parseInt(s.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
      return transformedId === parseInt(id);
    });

    if (!staffMember) {
      res.status(404).json({ error: "Staff not found" });
      return;
    }

    const { data, error } = await supabase
      .from("staff")
      .update({
        name,
        phone,
        specialization: position,
        commission: commission || 10,
        is_active: isActive !== false,
      })
      .eq("id", staffMember.id)
      .select()
      .single();

    if (error) {
      console.error("Error updating staff:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const transformedData = {
      id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
      name: data.name,
      phone: data.phone || "",
      position: data.specialization || "Staf",
      commission: data.commission || 10,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    res.json(transformedData);
  } catch (error) {
    console.error("Error in staff update:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: allStaff, error: fetchError } = await supabase
      .from("staff")
      .select("id");

    if (fetchError || !allStaff) {
      res.status(500).json({ error: "Failed to fetch staff for matching" });
      return;
    }

    const staffMember = allStaff.find((s) => {
      const transformedId = parseInt(s.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
      return transformedId === parseInt(id);
    });

    if (!staffMember) {
      res.status(404).json({ error: "Staff not found" });
      return;
    }

    // Hard delete: delete related data first
    // 1. Delete appointments related to this staff
    await supabase.from("appointments").delete().eq("staff_id", staffMember.id);
    
    // 2. Nullify staff_id in transactions to keep transaction records but remove staff link
    await supabase.from("transactions").update({ staff_id: null }).eq("staff_id", staffMember.id);

    // 3. Delete the staff member
    const { error: deleteError } = await supabase.from("staff").delete().eq("id", staffMember.id);

    if (deleteError) {
      console.error("Error deleting staff:", deleteError);
      res.status(500).json({ error: deleteError.message });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error in staff delete:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
