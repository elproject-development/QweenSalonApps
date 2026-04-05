import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  try {
    const { category } = req.query;

    let query = supabase
      .from("services")
      .select(
        `
        *,
        categories(name)
      `,
      )
      .order("created_at", { ascending: false });

    if (category && category !== "all") {
      const { data: categoryData } = await supabase
        .from("categories")
        .select("id")
        .eq("name", category)
        .single();

      if (categoryData) {
        query = query.eq("category_id", categoryData.id);
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching services:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const transformedData =
      data?.map((service) => ({
        id: parseInt(service.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
        name: service.name,
        category: (service.categories as any)?.name || "Lainnya",
        price: Number(service.price),
        duration: service.duration_minutes,
        description: service.description || "",
        isActive: service.is_active,
        createdAt: service.created_at,
        updatedAt: service.updated_at,
      })) || [];

    res.json(transformedData);
  } catch (error) {
    console.error("Error in services list:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res): Promise<void> => {
  try {
    const { name, category, price, duration, description, isActive } = req.body;

    if (!name || !category || !price || !duration) {
      res.status(400).json({
        error: "Name, category, price, and duration are required",
      });
      return;
    }

    let categoryId;
    const { data: existingCategory } = await supabase
      .from("categories")
      .select("id")
      .eq("name", category)
      .single();

    if (existingCategory) {
      categoryId = existingCategory.id;
    } else {
      const { data: newCategory } = await supabase
        .from("categories")
        .insert({ name: category })
        .select()
        .single();
      categoryId = newCategory?.id;
    }

    const { data, error } = await supabase
      .from("services")
      .insert({
        name,
        category_id: categoryId,
        price: parseFloat(price),
        duration_minutes: parseInt(duration),
        description: description || null,
        is_active: isActive !== false,
      })
      .select(
        `
        *,
        categories(name)
      `,
      )
      .single();

    if (error) {
      console.error("Error creating service:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const transformedData = {
      id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
      name: data.name,
      category: (data.categories as any)?.name || category,
      price: Number(data.price),
      duration: data.duration_minutes,
      description: data.description || "",
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    res.status(201).json(transformedData);
  } catch (error) {
    console.error("Error in service create:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, category, price, duration, description, isActive } = req.body;

    const { data: allServices, error: fetchError } = await supabase
      .from("services")
      .select("id");

    if (fetchError || !allServices) {
      res.status(500).json({ error: "Failed to fetch services for matching" });
      return;
    }

    const service = allServices.find((s) => {
      const transformedId = parseInt(s.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
      return transformedId === parseInt(id);
    });

    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    let categoryId;
    const { data: existingCategory } = await supabase
      .from("categories")
      .select("id")
      .eq("name", category)
      .single();

    if (existingCategory) {
      categoryId = existingCategory.id;
    } else {
      const { data: newCategory } = await supabase
        .from("categories")
        .insert({ name: category })
        .select()
        .single();
      categoryId = newCategory?.id;
    }

    const { data, error } = await supabase
      .from("services")
      .update({
        name,
        category_id: categoryId,
        price: parseFloat(price),
        duration_minutes: parseInt(duration),
        description: description || null,
        is_active: isActive !== false,
      })
      .eq("id", service.id)
      .select(
        `
        *,
        categories(name)
      `,
      )
      .single();

    if (error) {
      console.error("Error updating service:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const transformedData = {
      id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
      name: data.name,
      category: (data.categories as any)?.name || category,
      price: Number(data.price),
      duration: data.duration_minutes,
      description: data.description || "",
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    res.json(transformedData);
  } catch (error) {
    console.error("Error in service update:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: allServices, error: fetchError } = await supabase
      .from("services")
      .select("id");

    if (fetchError || !allServices) {
      res.status(500).json({ error: "Failed to fetch services for matching" });
      return;
    }

    const service = allServices.find((s) => {
      const transformedId = parseInt(s.id.replace(/[^0-9]/g, "").substring(0, 8) || "1");
      return transformedId === parseInt(id);
    });

    if (!service) {
      res.status(404).json({ error: "Service not found" });
      return;
    }

    // Hard delete: delete related data first
    // 1. Delete appointments related to this service
    await supabase.from("appointments").delete().eq("service_id", service.id);
    
    // 2. We cannot easily nullify service_id in transactions items because it's a JSONB array
    // However, the foreign key constraint is usually on the row level if there's a join table.
    // If it's a direct relation, we handle it here.
    
    const { error: deleteError } = await supabase.from("services").delete().eq("id", service.id);

    if (deleteError) {
      console.error("Error deleting service:", deleteError);
      res.status(500).json({ error: deleteError.message });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error in service delete:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
