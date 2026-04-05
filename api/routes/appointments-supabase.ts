import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";

const router: IRouter = Router();

router.get("/", async (req, res): Promise<void> => {
  try {
    const { date, status } = req.query;

    let query = supabase
      .from("appointments")
      .select(
        `
        *,
        customers(name, phone),
        services(name, price),
        staff(name)
      `,
      )
      .order("appointment_date", { ascending: true });

    if (date && typeof date === "string") {
      const startDate = new Date(date);
      const endDate = new Date(date);
      endDate.setDate(endDate.getDate() + 1);

      query = query
        .gte("appointment_date", startDate.toISOString())
        .lt("appointment_date", endDate.toISOString());
    }

    if (status && typeof status === "string" && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching appointments:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const transformedData =
      data?.map((appointment) => ({
        id: parseInt(
          appointment.id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
        ),
        customerName:
          (appointment.customers as any)?.name ||
          appointment.customer_name ||
          "Unknown",
        customerPhone:
          (appointment.customers as any)?.phone || appointment.customer_phone || "",
        serviceName: (appointment.services as any)?.name || "Unknown Service",
        servicePrice: Number((appointment.services as any)?.price || 0),
        staffName: (appointment.staff as any)?.name || "Anyone",
        staffId: appointment.staff_id
          ? parseInt(
              appointment.staff_id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
            )
          : null,
        serviceId: parseInt(
          appointment.service_id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
        ),
        scheduledAt: appointment.appointment_date,
        status: appointment.status,
        notes: appointment.notes || "",
        createdAt: appointment.created_at,
        updatedAt: appointment.updated_at,
      })) || [];

    res.json(transformedData);
  } catch (error) {
    console.error("Error in appointments list:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res): Promise<void> => {
  try {
    const { customerName, customerPhone, serviceId, staffId, scheduledAt, notes } =
      req.body;

    if (!customerName || !customerPhone || !serviceId || !scheduledAt) {
      res.status(400).json({
        error: "Customer name, phone, service, and scheduled time are required",
      });
      return;
    }

    const { data: services, error: servicesError } = await supabase
      .from("services")
      .select("*");

    if (servicesError || !services) {
      res.status(500).json({ error: "Failed to fetch services" });
      return;
    }

    const service = services.find((s) => {
      const transformedId = parseInt(
        s.id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
      );
      return transformedId === parseInt(serviceId);
    });

    if (!service) {
      res.status(400).json({ error: "Service not found" });
      return;
    }

    let customerId;
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id")
      .eq("phone", customerPhone)
      .single();

    if (existingCustomer) {
      customerId = existingCustomer.id;
    } else {
      const { data: newCustomer } = await supabase
        .from("customers")
        .insert({ name: customerName, phone: customerPhone })
        .select()
        .single();
      customerId = newCustomer?.id;
    }

    let staffIdToUse = null;
    if (staffId && staffId !== "anyone" && typeof staffId === "string") {
      const { data: staff } = await supabase.from("staff").select("*");

      const foundStaff = staff?.find((s) => {
        const transformedId = parseInt(
          s.id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
        );
        return transformedId === parseInt(staffId);
      });

      staffIdToUse = foundStaff?.id || null;
    }

    const { data, error } = await supabase
      .from("appointments")
      .insert({
        customer_id: customerId,
        service_id: service.id,
        staff_id: staffIdToUse,
        appointment_date: new Date(scheduledAt).toISOString(),
        status: "pending",
        notes: notes || null,
      })
      .select(
        `
        *,
        customers(name, phone),
        services(name, price),
        staff(name)
      `,
      )
      .single();

    if (error) {
      console.error("Error creating appointment:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const transformedData = {
      id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
      customerName: (data.customers as any)?.name || customerName,
      customerPhone: (data.customers as any)?.phone || customerPhone,
      serviceName: (data.services as any)?.name || service.name,
      servicePrice: Number((data.services as any)?.price || service.price),
      staffName: (data.staff as any)?.name || "Anyone",
      staffId: data.staff_id
        ? parseInt(data.staff_id.replace(/[^0-9]/g, "").substring(0, 8) || "1")
        : null,
      serviceId: parseInt(
        data.service_id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
      ),
      scheduledAt: data.appointment_date,
      status: data.status,
      notes: data.notes || "",
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    res.status(201).json(transformedData);
  } catch (error) {
    console.error("Error in appointment create:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: "Status is required" });
      return;
    }

    const { data: appointments, error: findError } = await supabase
      .from("appointments")
      .select("id");

    if (findError || !appointments) {
      res.status(500).json({ error: "Failed to fetch appointments" });
      return;
    }

    const appointment = appointments.find((a) => {
      const transformedId = parseInt(
        a.id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
      );
      return transformedId === parseInt(id);
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    const { data, error } = await supabase
      .from("appointments")
      .update({ status })
      .eq("id", appointment.id)
      .select(
        `
        *,
        customers(name, phone),
        services(name, price),
        staff(name)
      `,
      )
      .single();

    if (error) {
      console.error("Error updating appointment:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    const transformedData = {
      id: parseInt(data.id.replace(/[^0-9]/g, "").substring(0, 8) || "1"),
      customerName: (data.customers as any)?.name || "Unknown",
      customerPhone: (data.customers as any)?.phone || "",
      serviceName: (data.services as any)?.name || "Unknown Service",
      servicePrice: Number((data.services as any)?.price || 0),
      staffName: (data.staff as any)?.name || "Anyone",
      staffId: data.staff_id
        ? parseInt(data.staff_id.replace(/[^0-9]/g, "").substring(0, 8) || "1")
        : null,
      serviceId: parseInt(
        data.service_id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
      ),
      scheduledAt: data.appointment_date,
      status: data.status,
      notes: data.notes || "",
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };

    res.json(transformedData);
  } catch (error) {
    console.error("Error in appointment update:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;

    const { data: appointments, error: findError } = await supabase
      .from("appointments")
      .select("id");

    if (findError || !appointments) {
      res.status(500).json({ error: "Failed to fetch appointments" });
      return;
    }

    const appointment = appointments.find((a) => {
      const transformedId = parseInt(
        a.id.replace(/[^0-9]/g, "").substring(0, 8) || "1",
      );
      return transformedId === parseInt(id);
    });

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    const { error } = await supabase
      .from("appointments")
      .delete()
      .eq("id", appointment.id);

    if (error) {
      console.error("Error deleting appointment:", error);
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error in appointment delete:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
