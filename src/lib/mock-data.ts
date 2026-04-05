// Mock data for development when API server is not available
export const mockTopServices = [
  {
    serviceId: 1,
    serviceName: "Potong Rambut",
    category: "Hair Care",
    count: 45,
    revenue: 2250000
  },
  {
    serviceId: 2,
    serviceName: "Creambath",
    category: "Hair Treatment",
    count: 32,
    revenue: 3200000
  },
  {
    serviceId: 3,
    serviceName: "Facial",
    category: "Skin Care",
    count: 28,
    revenue: 5600000
  },
  {
    serviceId: 4,
    serviceName: "Manicure",
    category: "Nail Care",
    count: 21,
    revenue: 2100000
  },
  {
    serviceId: 5,
    serviceName: "Pedicure",
    category: "Nail Care",
    count: 18,
    revenue: 1800000
  }
];

export const mockSummary = {
  revenue: 14950000,
  transactionCount: 144,
  customerCount: 89,
  appointmentCount: 67
};

export const mockChartData = [
  { label: "Sen", revenue: 2100000 },
  { label: "Sel", revenue: 1850000 },
  { label: "Rab", revenue: 2300000 },
  { label: "Kam", revenue: 1950000 },
  { label: "Jum", revenue: 2800000 },
  { label: "Sab", revenue: 3200000 },
  { label: "Min", revenue: 750000 }
];

export const mockRecentTransactions = [
  {
    id: 1,
    customerName: "Siti Nurhaliza",
    serviceName: "Facial",
    amount: 200000,
    date: "2024-01-15T10:30:00Z"
  },
  {
    id: 2,
    customerName: "Ahmad Fauzi",
    serviceName: "Potong Rambut",
    amount: 50000,
    date: "2024-01-15T09:15:00Z"
  },
  {
    id: 3,
    customerName: "Maya Putri",
    serviceName: "Creambath",
    amount: 100000,
    date: "2024-01-15T08:45:00Z"
  },
  {
    id: 4,
    customerName: "Budi Santoso",
    serviceName: "Manicure",
    amount: 75000,
    date: "2024-01-14T16:20:00Z"
  },
  {
    id: 5,
    customerName: "Dewi Lestari",
    serviceName: "Pedicure",
    amount: 100000,
    date: "2024-01-14T15:30:00Z"
  }
];
