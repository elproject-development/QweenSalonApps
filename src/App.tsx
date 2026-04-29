import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { NotificationProvider } from "@/components/notification-provider";
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { autoConnectToPrinter, initBluetooth, requestBluetoothPermissions } from "@/lib/bluetooth-printer";

import NotFound from "@/pages/not-found";
import Login from "@/pages/login";

import { Layout } from "@/components/layout/layout";
import { Dashboard } from "@/pages/dashboard";
import { Kasir } from "@/pages/kasir";
import { Transaksi } from "@/pages/transaksi";
import { Janji } from "@/pages/janji";
import { Pelanggan } from "@/pages/pelanggan";
import { Layanan } from "@/pages/layanan";
import { Staf } from "@/pages/staf";
import { Pengeluaran } from "@/pages/pengeluaran";
import { Laporan } from "@/pages/laporan";
import Setting from "@/pages/setting";

import { supabase } from "@/utils/supabase"; // import client supabase

const queryClient = new QueryClient();

function Router() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (!session) {
        setLocation("/login");
      }
    });

    return () => subscription.unsubscribe();
  }, [setLocation]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-primary">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium animate-pulse">Memuat aplikasi...</p>
        </div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route>
        {session ? (
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/kasir" component={Kasir} />
              <Route path="/transaksi" component={Transaksi} />
              <Route path="/janji" component={Janji} />
              <Route path="/pelanggan" component={Pelanggan} />
              <Route path="/layanan" component={Layanan} />
              <Route path="/staf" component={Staf} />
              <Route path="/pengeluaran" component={Pengeluaran} />
              <Route path="/laporan" component={Laporan} />
              <Route path="/setting" component={Setting} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        ) : (
          <Route component={() => {
            useEffect(() => { setLocation("/login"); }, []);
            return null;
          }} />
        )}
      </Route>
    </Switch>
  );
}

function App() {
  useEffect(() => {
    const autoConnectPrinterOnStart = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        const { value } = await Preferences.get({ key: "qweensalon:printer_settings" });
        if (!value) return;
        const parsed = JSON.parse(value);

        if (parsed?.connectionType !== "bluetooth") return;
        if (!parsed?.bluetoothAddress) return;

        const inited = await initBluetooth();
        if (!inited) return;

        const permOk = await requestBluetoothPermissions();
        if (!permOk) return;

        await autoConnectToPrinter(parsed.bluetoothAddress);
      } catch (error) {
        console.error("Auto-connect printer on start failed:", error);
      }
    };

    // Give WebView time to settle before initializing BLE
    const timer = setTimeout(() => {
      void autoConnectPrinterOnStart();
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <ThemeProvider defaultTheme="light" storageKey="qween-salon-theme">
      <NotificationProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            {/* Wouter Router */}
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>

            {/* Global toaster */}
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;

// Optional: helper function untuk auth atau session Supabase
export async function getUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error("Supabase getUser error:", error);
    return null;
  }
  return user;
}