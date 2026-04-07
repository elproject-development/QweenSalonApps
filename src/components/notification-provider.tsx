import React, { createContext, useContext, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const ANDROID_NOTIFICATION_CHANNEL_ID = "qween_default_v2";
const ANDROID_NOTIFICATION_CHANNEL_NAME = "QweenSalon Notifications";
const ANDROID_NOTIFICATION_SOUND = "notif";

interface NotificationSettings {
  appointments: boolean;
  payments: boolean;
}

interface NotificationContextType {
  settings: NotificationSettings;
  setSettings: (settings: NotificationSettings) => void;
  requestPermission: () => Promise<boolean>;
  sendNotification: (title: string, options?: NotificationOptions) => void;
  scheduleAppointmentReminders: (
    appointments: Array<{ id: string; scheduledAt?: string | null; customerName?: string | null; serviceName?: string | null }>,
    minutesBefore?: number,
  ) => Promise<void>;
  permissionStatus: NotificationPermission;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  
  const [settings, setSettingsState] = useState<NotificationSettings>(() => {
    const saved = localStorage.getItem("qween-salon-notifications");
    return saved ? JSON.parse(saved) : { appointments: true, payments: true };
  });

  const setSettings = (newSettings: NotificationSettings) => {
    setSettingsState(newSettings);
    localStorage.setItem("qween-salon-notifications", JSON.stringify(newSettings));
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void (async () => {
      try {
        await LocalNotifications.createChannel({
          id: ANDROID_NOTIFICATION_CHANNEL_ID,
          name: ANDROID_NOTIFICATION_CHANNEL_NAME,
          sound: ANDROID_NOTIFICATION_SOUND,
          importance: 5,
          visibility: 1,
          vibration: true,
        } as any);
      } catch {
        // ignore
      }
    })();
  }, []);

  const requestPermission = async () => {
    if (Capacitor.isNativePlatform()) {
      const perm = await LocalNotifications.requestPermissions();
      const granted = perm.display === "granted";
      setPermissionStatus(granted ? "granted" : "denied");
      if (granted) {
        toast({
          title: "Notifikasi Aktif",
          description: "Anda akan menerima pengingat janji temu.",
          variant: "success",
        });
        return true;
      }
      toast({
        title: "Izin Ditolak",
        description: "Anda perlu memberikan izin untuk menerima notifikasi.",
        variant: "destructive",
      });
      return false;
    }

    if (!("Notification" in window)) {
      toast({
        title: "Tidak Didukung",
        description: "Browser Anda tidak mendukung notifikasi desktop.",
        variant: "destructive",
      });
      return false;
    }

    const permission = await Notification.requestPermission();
    setPermissionStatus(permission);
    
    if (permission === "granted") {
      toast({
        title: "Notifikasi Aktif",
        description: "Anda akan menerima notifikasi dari QweenSalon.",
        variant: "success",
      });
      return true;
    } else {
      toast({
        title: "Izin Ditolak",
        description: "Anda perlu memberikan izin untuk menerima notifikasi.",
        variant: "destructive",
      });
      return false;
    }
  };

  const sendNotification = (title: string, options?: NotificationOptions) => {
    if (Capacitor.isNativePlatform()) {
      void LocalNotifications.schedule({
        notifications: [
          {
            id: Date.now() % 2147483647,
            title,
            body: (options as any)?.body,
            channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
            schedule: { at: new Date(Date.now() + 250) },
          },
        ],
      });
      return;
    }

    if (permissionStatus === "granted") {
      // In a real APK/PWA environment, this would show a system notification
      new Notification(title, {
        icon: "/logo.png", // Ensure this path is correct or use a generic icon
        ...options,
      });
    }
  };

  const scheduleAppointmentReminders: NotificationContextType["scheduleAppointmentReminders"] = async (
    appointments,
    minutesBefore = 15,
  ) => {
    if (!Capacitor.isNativePlatform()) return;
    if (!settings.appointments) return;

    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      const ok = await requestPermission();
      if (!ok) return;
    }

    const now = Date.now();
    const safeIntId = (id: string) => {
      const hex = String(id).replace(/-/g, "").slice(0, 8);
      const n = parseInt(hex || "0", 16);
      return Number.isFinite(n) ? (n % 2147483647) : (Date.now() % 2147483647);
    };

    // Cancel existing reminders for these appointments before re-scheduling
    const cancelIds = appointments.map((a) => ({ id: safeIntId(a.id) }));
    try {
      await LocalNotifications.cancel({ notifications: cancelIds });
    } catch {
      // ignore
    }

    const notifications = appointments
      .map((a) => {
        const whenIso = a.scheduledAt;
        if (!whenIso) return null;
        const scheduledAt = new Date(whenIso);
        if (isNaN(scheduledAt.getTime())) return null;
        const remindAtMs = scheduledAt.getTime() - minutesBefore * 60_000;
        if (remindAtMs <= now + 5_000) return null;

        const bodyParts = [a.customerName, a.serviceName].filter(Boolean);
        const body = bodyParts.length > 0 ? bodyParts.join(" • ") : "";

        return {
          id: safeIntId(a.id),
          title: "Pengingat Janji Temu",
          body,
          channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
          schedule: { at: new Date(remindAtMs) },
        };
      })
      .filter(Boolean) as Array<any>;

    if (notifications.length === 0) return;
    await LocalNotifications.schedule({ notifications });
  };

  return (
    <NotificationContext.Provider value={{ settings, setSettings, requestPermission, sendNotification, scheduleAppointmentReminders, permissionStatus }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
};
