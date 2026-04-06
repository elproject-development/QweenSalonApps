import { useListCustomers, useListServices, useListStaff, useCreateTransaction } from "@/lib/api-client-react";
import { useState, useMemo } from "react";
import { formatRupiah, formatNumber, parseNumber } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Minus, ShoppingCart, UserRound, Printer, Search, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ReceiptPrint, type ReceiptData } from "@/components/receipt/receipt-print";
import type { SalonService } from "@/lib/api-client-react";
import { useIsMobile } from "@/hooks/use-mobile";

export function Kasir() {
  const { toast } = useToast();
  const isMobile = useIsMobile();

  const { data: services } = useListServices();
  const { data: customers } = useListCustomers();
  const { data: staffList } = useListStaff();
  const createTransaction = useCreateTransaction();

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("general");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("none");
  const [cart, setCart] = useState<{ service: SalonService; quantity: number }[]>([]);
  const [discount, setDiscount] = useState<string>("");
  const [tax, setTax] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "transfer" | "qris" | "debit" | "credit">("cash");
  const [printData, setPrintData] = useState<ReceiptData | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showServiceList, setShowServiceList] = useState(false);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.service.price * item.quantity, 0), [cart]);
  const total = useMemo(() => subtotal - parseNumber(discount) + parseNumber(tax), [subtotal, discount, tax]);

  const filteredServices = useMemo(() => {
    if (!services) return [];
    return services.filter((s: any) => 
      s.isActive && 
      s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [services, searchTerm]);

  const addToCart = (service: SalonService) => {
    setCart(prev => {
      const existing = prev.find(item => item.service.id === service.id);
      if (existing) {
        return prev.map(item => item.service.id === service.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { service, quantity: 1 }];
    });
    if (isMobile) {
      setSearchTerm("");
      setShowServiceList(false);
    }
  };

  const removeFromCart = (serviceId: number) => {
    setCart(prev => {
      const existing = prev.find(item => item.service.id === serviceId);
      if (existing && existing.quantity > 1) {
        return prev.map(item => item.service.id === serviceId ? { ...item, quantity: item.quantity - 1 } : item);
      }
      return prev.filter(item => item.service.id !== serviceId);
    });
  };

  const selectedStaff = staffList?.find((s: any) => String(s.id) === String(selectedStaffId));
  const selectedCustomer = customers?.find((c: any) => c.id === Number(selectedCustomerId));

  const handleCheckout = () => {
    if (cart.length === 0) {
      toast({ title: "Keranjang kosong", variant: "destructive" });
      return;
    }

    console.log("Checkout data:", {
      selectedCustomerId,
      customerName: selectedCustomer?.name,
      cartSize: cart.length,
      total
    });

    createTransaction.mutate(
      {
        data: {
          customerId: selectedCustomerId === "general" ? undefined : Number(selectedCustomerId),
          staffId: selectedStaffId === "none" ? undefined : Number(selectedStaffId),
          items: cart.map(item => ({ serviceId: item.service.id, quantity: item.quantity })),
          discount: parseNumber(discount),
          tax: parseNumber(tax),
          paymentMethod,
        },
      },
      {
        onSuccess: (data) => {
          toast({ 
            title: "Transaksi berhasil!", 
            variant: "success" 
          });

          const receipt: ReceiptData = {
            receiptNumber: data.receiptNumber,
            createdAt: data.createdAt,
            staffName: selectedStaff?.name ?? null,
            customerName: selectedCustomer?.name ?? null,
            paymentMethod,
            items: cart.map(item => ({
              serviceName: item.service.name,
              quantity: item.quantity,
              price: item.service.price,
              subtotal: item.service.price * item.quantity,
            })),
            subtotal,
            discount: parseNumber(discount) || null,
            tax: parseNumber(tax) || null,
            total,
          };
          setPrintData(receipt);

          setCart([]);
          setDiscount("");
          setTax("");
          setSelectedCustomerId("general");
          setSelectedStaffId("none");
        },
        onError: () => {
          toast({ title: "Gagal menyimpan transaksi", variant: "destructive" });
        },
      }
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-500">
      {/* Service Grid */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex flex-col space-y-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Kasir / POS</h1>
            <p className="text-muted-foreground text-xs">Pilih layanan untuk ditambahkan ke keranjang.</p>
          </div>
          <div className="relative w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Cari layanan..."
              className="pl-9 h-9 text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {isMobile && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-between text-muted-foreground font-normal border h-10 bg-muted/30"
            onClick={() => setShowServiceList(!showServiceList)}
          >
            <div className="flex items-center gap-2">
              <Plus className={`h-4 w-4 transition-transform ${showServiceList ? "rotate-45" : ""}`} />
              {showServiceList ? "Tutup Daftar Layanan" : "Pilih Layanan"}
            </div>
            {showServiceList ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        )}

        {(!isMobile || showServiceList || searchTerm.length >= 2) && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 animate-in slide-in-from-top-2 duration-300">
            {filteredServices.map((service: any) => {
              const inCart = cart.find(item => item.service.id === service.id);
              return (
                <Card
                  key={service.id}
                  className={`cursor-pointer transition-all ${inCart ? "border-primary ring-1 ring-primary" : "hover:border-primary/50"}`}
                  onClick={() => addToCart(service)}
                >
                  <CardContent className="p-4 flex flex-col items-center text-center gap-2 relative">
                    {inCart && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-primary-foreground text-xs font-bold">
                        {inCart.quantity}
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <UserRound className="w-5 h-5" />
                    </div>
                    <div className="font-medium text-sm line-clamp-2">{service.name}</div>
                    <div className="text-primary font-bold text-sm">{formatRupiah(service.price)}</div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredServices.length === 0 && (
              <div className="col-span-full py-10 text-center text-muted-foreground text-sm">
                Layanan tidak ditemukan
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cart */}
      <div className="lg:col-span-1">
        <Card className="sticky top-20">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="w-5 h-5" />
              Keranjang
              {cart.length > 0 && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {cart.reduce((s, i) => s + i.quantity, 0)} item
                </span>
              )}
            </CardTitle>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Pelanggan</Label>
              <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pilih pelanggan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">Pelanggan Umum</SelectItem>
                  {customers?.map(c => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Staf yang Melayani</Label>
              <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pilih staf" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tidak dipilih</SelectItem>
                  {staffList?.filter((s: any) => s.isActive).map((s: any) => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-3 space-y-2">
              {cart.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-4">Belum ada layanan di keranjang</div>
              ) : (
                cart.map(item => (
                  <div key={item.service.id} className="flex items-center gap-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs leading-tight truncate">{item.service.name}</div>
                      <div className="text-muted-foreground text-xs">{formatRupiah(item.service.price)}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => removeFromCart(item.service.id)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-5 text-center text-xs font-bold">{item.quantity}</span>
                      <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => addToCart(item.service)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <span className="text-xs font-medium w-16 text-right shrink-0 mr-3">
                      {formatRupiah(item.service.price * item.quantity)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="border-t pt-3 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground mr-3">
                <span>Subtotal</span>
                <span>{formatRupiah(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs shrink-0">Diskon (Rp)</span>
                <Input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="0" 
                  className="h-7 text-right w-24 text-xs" 
                  value={formatNumber(discount)} 
                  onChange={e => setDiscount(e.target.value)} 
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs shrink-0">Pajak (Rp)</span>
                <Input 
                  type="text" 
                  inputMode="numeric"
                  placeholder="0" 
                  className="h-7 text-right w-24 text-xs" 
                  value={formatNumber(tax)} 
                  onChange={e => setTax(e.target.value)} 
                />
              </div>
              <div className="flex justify-between font-bold text-base pt-2 border-t mr-3">
                <span>Total</span>
                <span className="text-primary">{formatRupiah(total)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Metode Pembayaran</Label>
              <Select value={paymentMethod} onValueChange={(val: any) => setPaymentMethod(val)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Pilih metode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Tunai</SelectItem>
                  <SelectItem value="transfer">Transfer Bank</SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                  <SelectItem value="debit">E-Wallet</SelectItem>
                  
                </SelectContent>
              </Select>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-2">
            <Button
              className="w-full h-11 text-base font-semibold gap-2"
              onClick={handleCheckout}
              disabled={cart.length === 0 || createTransaction.isPending}
            >
              {createTransaction.isPending ? "Memproses..." : (
                <>
                  <Printer className="w-4 h-4" />
                  Bayar & Cetak Struk
                </>
              )}
            </Button>
            {cart.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs text-muted-foreground"
                onClick={() => setCart([])}
              >
                Kosongkan Keranjang
              </Button>
            )}
          </CardFooter>
        </Card>
      </div>

      <ReceiptPrint data={printData} onDone={() => setPrintData(null)} />
    </div>
  );
}
