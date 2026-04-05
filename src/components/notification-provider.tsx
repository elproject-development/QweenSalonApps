import React, { createContext, useContext, useEffect, useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface NotificationSettings {
  appointments: boolean;
  payments: boolean;
}

interface NotificationContextType {
  settings: NotificationSettings;
  setSettings: (settings: NotificationSettings) => void;
  requestPermission: () => Promise<boolean>;
  sendNotification: (title: string, options?: NotificationOptions) => void;
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

  const requestPermission = async () => {
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
    if (permissionStatus === "granted") {
      // In a real APK/PWA environment, this would show a system notification
      new Notification(title, {
        icon: "/logo.png", // Ensure this path is correct or use a generic icon
        ...options,
      });
    }
  };

  return (
    <NotificationContext.Provider value={{ settings, setSettings, requestPermission, sendNotification, permissionStatus }}>
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
