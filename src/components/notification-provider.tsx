import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

const ANDROID_NOTIFICATION_CHANNEL_ID = "qween_default_v2";
const ANDROID_NOTIFICATION_CHANNEL_NAME = "QweenSalon Notifications";
const ANDROID_NOTIFICATION_SOUND = "notif";

const ANDROID_PRAYER_NOTIFICATION_CHANNEL_ID = "qween_prayer_v1";
const ANDROID_PRAYER_NOTIFICATION_CHANNEL_NAME = "Pengingat Sholat";
const ANDROID_PRAYER_NOTIFICATION_SOUND = "adzan";

interface NotificationSettings {
  appointments: boolean;
  payments: boolean;
}

type PrayerSettings = {
  enabled: boolean;
  city: string;
};

type PrayerKey = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";

interface NotificationContextType {
  settings: NotificationSettings;
  setSettings: (settings: NotificationSettings) => void;
  requestPermission: () => Promise<boolean>;
  sendNotification: (title: string, options?: NotificationOptions) => void;
  scheduleAppointmentReminders: (
    appointments: Array<{ id: string; scheduledAt?: string | null; customerName?: string | null; serviceName?: string | null }>,
    minutesBefore?: number,
  ) => Promise<void>;
  schedulePrayerReminders: (city?: string) => Promise<void>;
  cancelPrayerReminders: () => Promise<void>;
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

  const PRAYER_SETTINGS_STORAGE_KEY = "qweensalon:prayer_notifications";
  const PRAYER_NOTIFICATION_ID_BASE = 900_000;

  const loadPrayerSettings = (): PrayerSettings => {
    const defaults: PrayerSettings = { enabled: false, city: "Yogyakarta" };
    try {
      const raw = localStorage.getItem(PRAYER_SETTINGS_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed?.enabled),
        city: String(parsed?.city || defaults.city),
      };
    } catch {
      return defaults;
    }
  };

  const isPrayerNotif = (n: any) => {
    try {
      return n?.extra?.type === "prayer";
    } catch {
      return false;
    }
  };

  const fetchPrayerTimesByCity = async (city: string) => {
    const params = new URLSearchParams({
      city,
      country: "Indonesia",
      method: "11",
    });
    const res = await fetch(`https://api.aladhan.com/v1/timingsByCity?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Prayer API failed: ${res.status}`);
    }
    const json = await res.json();
    const timings = json?.data?.timings;
    if (!timings) throw new Error("Prayer timings not found");
    return {
      Fajr: String(timings.Fajr || ""),
      Dhuhr: String(timings.Dhuhr || ""),
      Asr: String(timings.Asr || ""),
      Maghrib: String(timings.Maghrib || ""),
      Isha: String(timings.Isha || ""),
    };
  };

  const fetchPrayerCalendarByCity = async (city: string, month: number, year: number) => {
    const params = new URLSearchParams({
      city,
      country: "Indonesia",
      method: "11",
      month: String(month),
      year: String(year),
    });
    const res = await fetch(`https://api.aladhan.com/v1/calendarByCity?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`Prayer calendar API failed: ${res.status}`);
    }
    const json = await res.json();
    const data = json?.data;
    if (!Array.isArray(data)) throw new Error("Prayer calendar not found");
    return data as Array<any>;
  };

  const parseTimeToDate = (time: string, baseDate: Date) => {
    const cleaned = String(time).trim().split(" ")[0];
    const [hh, mm] = cleaned.split(":").map((n) => Number(n));
    const d = new Date(baseDate);
    d.setSeconds(0, 0);
    d.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0);
    return d;
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

        await LocalNotifications.createChannel({
          id: ANDROID_PRAYER_NOTIFICATION_CHANNEL_ID,
          name: ANDROID_PRAYER_NOTIFICATION_CHANNEL_NAME,
          sound: ANDROID_PRAYER_NOTIFICATION_SOUND,
          importance: 5,
          visibility: 1,
          vibration: true,
        } as any);
      } catch {
        // ignore
      }
    })();
  }, []);

  const requestPermission = useCallback(async () => {
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
  }, [toast]);

  const cancelPrayerReminders: NotificationContextType["cancelPrayerReminders"] = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const pending = await LocalNotifications.getPending();
      const prayerOnes = (pending?.notifications || []).filter(isPrayerNotif);
      if (prayerOnes.length === 0) return;
      await LocalNotifications.cancel({ notifications: prayerOnes.map((n: any) => ({ id: n.id })) });
    } catch {
      // ignore
    }
  }, []);

  const schedulePrayerReminders: NotificationContextType["schedulePrayerReminders"] = useCallback(async (cityParam) => {
    if (!Capacitor.isNativePlatform()) return;

    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") {
      const ok = await requestPermission();
      if (!ok) return;
    }

    const { city: storedCity } = loadPrayerSettings();
    const city = String(cityParam || storedCity || "Yogyakarta").trim() || "Yogyakarta";

    const now = Date.now();

    const prayers: Array<{ key: PrayerKey; title: string }> = [
      { key: "Fajr", title: "Pengingat Sholat Subuh" },
      { key: "Dhuhr", title: "Pengingat Sholat Dzuhur" },
      { key: "Asr", title: "Pengingat Sholat Ashar" },
      { key: "Maghrib", title: "Pengingat Sholat Maghrib" },
      { key: "Isha", title: "Pengingat Sholat Isya" },
    ];

    await cancelPrayerReminders();

    const horizonDays = 35;
    const today = new Date();
    const month1 = today.getMonth() + 1;
    const year1 = today.getFullYear();
    const next = new Date(today);
    next.setMonth(next.getMonth() + 1);
    const month2 = next.getMonth() + 1;
    const year2 = next.getFullYear();

    const [cal1, cal2] = await Promise.all([
      fetchPrayerCalendarByCity(city, month1, year1),
      month2 === month1 && year2 === year1 ? Promise.resolve([]) : fetchPrayerCalendarByCity(city, month2, year2),
    ]);

    const dateToTimings = new Map<string, any>();
    for (const day of [...cal1, ...cal2]) {
      const g = day?.date?.gregorian;
      const yyyy = String(g?.year || "");
      const mm = String(g?.month?.number || "").padStart(2, "0");
      const dd = String(g?.day || "").padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      if (!yyyy || !mm || !dd) continue;
      if (!day?.timings) continue;
      dateToTimings.set(key, day.timings);
    }

    const makeId = (d: Date, prayerIdx: number) => {
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const day = d.getDate();
      const base = y * 10_000 + m * 100 + day;
      const n = base * 10 + prayerIdx;
      return (n % 2147483647) || (PRAYER_NOTIFICATION_ID_BASE + prayerIdx);
    };

    const notifications: Array<any> = [];
    for (let i = 0; i < horizonDays; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const yyyy = String(d.getFullYear());
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const key = `${yyyy}-${mm}-${dd}`;
      const timings = dateToTimings.get(key);
      if (!timings) continue;

      prayers.forEach((p, idx) => {
        const timeStr = String(timings[p.key] || "");
        const at = parseTimeToDate(timeStr, d);
        const remindAt = new Date(at.getTime() - 10 * 60_000);
        if (remindAt.getTime() <= now + 5_000) return;
        notifications.push({
          id: makeId(d, idx),
          title: p.title,
          body: "10 menit lagi waktu sholat.",
          channelId: ANDROID_PRAYER_NOTIFICATION_CHANNEL_ID,
          schedule: { at: remindAt },
          extra: { type: "prayer", date: key, prayer: p.key },
        });
      });
    }

    if (notifications.length > 0) {
      await LocalNotifications.schedule({ notifications: notifications as any });
    }

    toast({
      title: "Pengingat Sholat Aktif",
      description: `Notifikasi sholat dijadwalkan untuk kota ${city}`,
      variant: "success",
    });
  }, [cancelPrayerReminders, requestPermission, toast]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const ps = loadPrayerSettings();
    if (!ps.enabled) return;
    void schedulePrayerReminders(ps.city);
    // Jalankan sekali saat app start
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    <NotificationContext.Provider value={{ settings, setSettings, requestPermission, sendNotification, scheduleAppointmentReminders, schedulePrayerReminders, cancelPrayerReminders, permissionStatus }}>
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
