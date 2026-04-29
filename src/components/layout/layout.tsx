import React, { useEffect, useMemo, useState, memo } from "react";
import { Link, useLocation } from "wouter";
import { Home, Receipt, Calendar, Users, Menu, Flower, UserCheck, Calculator, BarChart3, X, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface LayoutProps {
  children: React.ReactNode;
}

const NavItem = memo(({ item, isActive, onClick }: { item: any, isActive: boolean, onClick?: () => void }) => (
  <Link href={item.href} onClick={onClick}>
    <span
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 rounded-md text-sm font-medium transition-colors cursor-pointer",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      <item.icon className="w-5 h-5" />
      {item.label}
    </span>
  </Link>
));

const MobileNavItem = memo(({ item, isActive }: { item: any, isActive: boolean }) => (
  <Link href={item.href}>
    <span className="flex flex-col items-center justify-center w-16 h-full gap-1 cursor-pointer">
      <item.icon
        className={cn(
          "w-6 h-6 transition-all duration-200",
          isActive ? "text-primary scale-110" : "text-muted-foreground hover:text-primary/70"
        )}
      />
      <span
        className={cn(
          "text-[10px] font-medium transition-all duration-200",
          isActive ? "text-primary" : "text-muted-foreground"
        )}
      >
        {item.label}
      </span>
    </span>
  </Link>
));

const MoreMenuItem = memo(({ item, onClick }: { item: any, onClick: () => void }) => (
  <Link href={item.href} onClick={onClick}>
    <span className="flex flex-col items-center gap-2 p-2.5 rounded-xl bg-secondary/50 text-secondary-foreground hover:bg-secondary transition-all duration-200 cursor-pointer active:scale-95">
      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <item.icon className="w-5 h-5" />
      </div>
      <span className="text-[10px] font-medium text-center leading-tight">{item.label}</span>
    </span>
  </Link>
));

export function Layout({ children }: LayoutProps) {
  const [location, setLocation] = useLocation();
  const [open, setOpen] = React.useState(false);

  const APP_BRAND_STORAGE_KEY = "qweensalon:app_brand";
  const DEFAULT_APP_BRAND = "qweenSalon";
  const [appBrand, setAppBrand] = useState(DEFAULT_APP_BRAND);

  useEffect(() => {
    const sync = () => {
      try {
        setAppBrand(localStorage.getItem(APP_BRAND_STORAGE_KEY) ?? DEFAULT_APP_BRAND);
      } catch {
        setAppBrand(DEFAULT_APP_BRAND);
      }
    };

    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("qweensalon:app_brand_changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("qweensalon:app_brand_changed", sync);
    };
  }, []);

  const navItems = useMemo(() => [
    { label: "Dashboard", href: "/", icon: Home },
    { label: "Kasir", href: "/kasir", icon: Receipt },
    { label: "Reservasi", href: "/janji", icon: Calendar },
    { label: "Pelanggan", href: "/pelanggan", icon: Users },
  ], []);

  const moreItems = useMemo(() => [
    { label: "Riwayat Transaksi", href: "/transaksi", icon: Receipt },
    { label: "Layanan", href: "/layanan", icon: Flower },
    { label: "Staf", href: "/staf", icon: UserCheck },
    { label: "Pengeluaran", href: "/pengeluaran", icon: Calculator },
    { label: "Laporan", href: "/laporan", icon: BarChart3 },
    { label: "Setting", href: "/setting", icon: Settings },
  ], []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col max-w-md mx-auto md:max-w-none md:flex-row pb-16 md:pb-0">
      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border h-14 flex items-center justify-center px-4">
        <div className="font-semibold text-[32px] text-primary flex items-center gap-2" style={{ fontFamily: '"Style Script", cursive' }}>
          {appBrand}
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-screen sticky top-0">
        <div className="h-16 flex items-center justify-center px-6 border-b border-sidebar-border">
          <div className="font-bold text-[32px] text-primary flex items-center gap-2" style={{ fontFamily: '"Style Script", cursive' }}>
            {appBrand}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4">
          <div className="px-3 space-y-1 mb-6">
            <h3 className="px-4 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
              Utama
            </h3>
            {navItems.map((item) => (
              <NavItem key={item.href} item={item} isActive={location === item.href} />
            ))}
          </div>

          <div className="px-3 space-y-1">
            <h3 className="px-4 text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2">
              Lainnya
            </h3>
            {moreItems.map((item) => (
              <NavItem key={item.href} item={item} isActive={location === item.href} />
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="max-w-screen-2xl mx-auto p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background/95 backdrop-blur-sm border-t border-border z-40 flex justify-around items-center px-2 safe-area-bottom">
        {navItems.map((item) => (
          <MobileNavItem key={item.href} item={item} isActive={location === item.href} />
        ))}
        
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <span className="flex flex-col items-center justify-center w-16 h-full gap-1 cursor-pointer text-muted-foreground hover:text-primary transition-colors">
              <Menu className="w-6 h-6" />
              <span className="text-[10px] font-medium">Lainnya</span>
            </span>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-2xl p-0 h-auto pb-10 border-t shadow-2xl">
            <SheetTitle className="sr-only">Menu Lainnya</SheetTitle>
            <div className="p-4">
              <div className="flex items-center justify-between mb-4 px-1">
                <h2 className="text-lg font-bold">Menu Lainnya</h2>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {moreItems.map((item) => (
                  <MoreMenuItem key={item.href} item={item} onClick={() => setOpen(false)} />
                ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  );
}
