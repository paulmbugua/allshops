type Workflow = {
  board: string;
  ticket: string;
  reference: string;
  example: string;
  channels: readonly string[];
  steps: readonly [string, string, string, string];
};

type BusinessProfile = {
  label: string;
  search: string;
  catalogue: string;
  shortcuts?: readonly string[];
  services?: boolean;
  workflow?: Workflow;
};

export const businessProfiles: Record<string, BusinessProfile> = {
  RETAIL: {
    label: "Retail shop",
    search: "Scan barcode or find an item",
    catalogue: "Fast-sale items",
  },
  GROCERY: {
    label: "Grocery / minimart",
    search: "Scan a pack or find produce",
    catalogue: "Grocery favourites",
    shortcuts: ["Produce", "Dairy", "Household"],
  },
  RESTAURANT_CAFE: {
    label: "Restaurant / café",
    search: "Find a dish, drink or menu code",
    catalogue: "Popular menu items",
    shortcuts: ["Meals", "Drinks", "Sides"],
    workflow: {
      board: "Kitchen orders",
      ticket: "Kitchen ticket",
      reference: "Table, pickup name or delivery reference",
      example: "Table 4",
      channels: ["Dine-in", "Takeaway", "Delivery"],
      steps: ["Placed", "Preparing", "Ready", "Handed over"],
    },
  },
  AUTO_SPARES: {
    label: "Auto parts shop",
    search: "Find a part by name, SKU or barcode",
    catalogue: "Fast-moving parts",
    shortcuts: ["Filters", "Brakes", "Electrical"],
    workflow: {
      board: "Parts requests",
      ticket: "Picking slip",
      reference: "Vehicle, registration or job reference",
      example: "Toyota Fielder · 2016 · front pads",
      channels: ["Counter pickup", "Workshop fitment", "Dispatch"],
      steps: [
        "Requested",
        "Matching parts",
        "Packed",
        "Collected or dispatched",
      ],
    },
  },
  SALON: {
    label: "Salon",
    search: "Find a treatment, service or retail product",
    catalogue: "Popular treatments",
    services: true,
    shortcuts: ["Hair", "Nails", "Skincare"],
    workflow: {
      board: "Salon service queue",
      ticket: "Service ticket",
      reference: "Guest or appointment reference",
      example: "Chair 2 · Amina",
      channels: ["Walk-in", "Booking"],
      steps: [
        "Checked in",
        "In service",
        "Ready for checkout",
        "Service finished",
      ],
    },
  },
  BARBERSHOP: {
    label: "Barbershop / Kinyozi",
    search: "Find a cut, shave or grooming product",
    catalogue: "Cuts and grooming",
    services: true,
    shortcuts: ["Haircut", "Beard", "Grooming"],
    workflow: {
      board: "Chair queue",
      ticket: "Chair ticket",
      reference: "Guest, chair or queue reference",
      example: "Chair 1 · Ticket 12",
      channels: ["Walk-in", "Booking"],
      steps: ["Waiting", "In chair", "Finishing", "Service finished"],
    },
  },
  WATER_VENDING: {
    label: "Water vending / refill station",
    search: "Find a refill size, bottle or delivery item",
    catalogue: "Refills and containers",
    shortcuts: ["5 L", "10 L", "20 L"],
    workflow: {
      board: "Refill queue",
      ticket: "Refill slip",
      reference: "Container count or delivery reference",
      example: "3 × 20 L containers",
      channels: ["Bring own container", "New container", "Delivery"],
      steps: ["Queued", "Filling", "Sealed", "Collected or delivered"],
    },
  },
  ANIMAL_FEEDS: {
    label: "Animal feeds mill / shop",
    search: "Find feed by formula, bag size or SKU",
    catalogue: "Popular feed packs",
    shortcuts: ["Dairy", "Layers", "Broilers"],
    workflow: {
      board: "Feed loading queue",
      ticket: "Feed loading slip",
      reference: "Batch, truck or customer order reference",
      example: "Batch D17 · 5 bags · 70 kg",
      channels: ["Counter pickup", "Bulk loading", "Dispatch"],
      steps: [
        "Booked",
        "Weighing and bagging",
        "Ready to load",
        "Loaded or dispatched",
      ],
    },
  },
  BAKERY: {
    label: "Bakery",
    search: "Find bread, cakes or a pack size",
    catalogue: "Fresh bakes",
    shortcuts: ["Bread", "Cakes", "Pastries"],
    workflow: {
      board: "Bakery pre-orders",
      ticket: "Bakery order slip",
      reference: "Pickup time, cake message or order reference",
      example: "Sat 10:00 · birthday cake",
      channels: ["Counter pickup", "Pre-order", "Delivery"],
      steps: [
        "Booked",
        "Baking or decorating",
        "Packed",
        "Collected or delivered",
      ],
    },
  },
  FACTORY: {
    label: "Factory / light manufacturing",
    search: "Find a finished product or pack SKU",
    catalogue: "Finished goods",
    shortcuts: ["Carton", "Pack", "Bulk"],
    workflow: {
      board: "Finished-goods dispatch",
      ticket: "Dispatch slip",
      reference: "Batch, purchase order or dispatch reference",
      example: "Batch 2407 · PO 130",
      channels: ["Collection", "Dispatch"],
      steps: [
        "Booked",
        "Picking and packing",
        "Ready to load",
        "Dispatched or collected",
      ],
    },
  },
  PHARMACY: {
    label: "Pharmacy / chemist",
    search: "Find a product by name, strength or barcode",
    catalogue: "Counter catalogue",
    shortcuts: ["First aid", "Personal care", "Supplements"],
  },
  BUTCHERY: {
    label: "Butchery",
    search: "Find a cut, pack or weight-based item",
    catalogue: "Popular cuts",
    shortcuts: ["Beef", "Goat", "Chicken"],
    workflow: {
      board: "Cutting and collection",
      ticket: "Cutting slip",
      reference: "Cut notes or pickup reference",
      example: "Cubed · pickup 5 pm",
      channels: ["Counter pickup", "Pre-order", "Delivery"],
      steps: [
        "Ordered",
        "Cutting and weighing",
        "Wrapped",
        "Collected or delivered",
      ],
    },
  },
  AGROVET: {
    label: "Agrovet / farm supplies",
    search: "Find seed, farm supplies or a pack size",
    catalogue: "Farm essentials",
    shortcuts: ["Seeds", "Fertiliser", "Farm tools"],
  },
  WHOLESALE: {
    label: "Wholesale / distributor",
    search: "Find a case, bale, carton or SKU",
    catalogue: "Fast-moving cases",
    shortcuts: ["Case", "Bale", "Carton"],
    workflow: {
      board: "Wholesale picking",
      ticket: "Picking slip",
      reference: "Customer PO or vehicle reference",
      example: "PO 124 · Route 3",
      channels: ["Pickup", "Route delivery"],
      steps: [
        "Booked",
        "Picking",
        "Staged for loading",
        "Collected or dispatched",
      ],
    },
  },
  LPG_RETAIL: {
    label: "LPG / cooking gas shop",
    search: "Find a cylinder size, refill or accessory",
    catalogue: "Refills and accessories",
    shortcuts: ["6 kg", "13 kg", "Accessories"],
    workflow: {
      board: "Cylinder orders",
      ticket: "Collection slip",
      reference: "Cylinder size, exchange or delivery reference",
      example: "13 kg exchange · pickup",
      channels: ["Cylinder exchange", "New cylinder", "Delivery"],
      steps: ["Ordered", "Preparing", "Ready for handover", "Handed over"],
    },
  },
  GARAGE: {
    label: "Garage / workshop",
    search: "Find labour, service or a part",
    catalogue: "Workshop services",
    services: true,
    shortcuts: ["Service", "Oil", "Tyres"],
  },
  LAUNDRY: {
    label: "Laundry",
    search: "Find a cleaning, ironing or wash service",
    catalogue: "Cleaning services",
    services: true,
    shortcuts: ["Wash", "Iron", "Dry clean"],
  },
  HARDWARE: {
    label: "Hardware shop",
    search: "Find tools, size, pack or SKU",
    catalogue: "Hardware essentials",
    shortcuts: ["Plumbing", "Electrical", "Tools"],
  },
  ELECTRONICS: {
    label: "Electronics shop",
    search: "Find a device, model or SKU",
    catalogue: "Devices and accessories",
    shortcuts: ["Phones", "Chargers", "Cables"],
  },
  PRINTING: {
    label: "Printing / cyber shop",
    search: "Find printing, photocopying or a service",
    catalogue: "Print services",
    services: true,
    shortcuts: ["Printing", "Copy", "Binding"],
  },
  GENERAL_SERVICES: {
    label: "General services",
    search: "Find a service or product",
    catalogue: "Popular services",
    services: true,
  },
  OTHER: {
    label: "Other",
    search: "Find an item, SKU or barcode",
    catalogue: "Fast-sale items",
  },
};

export const orderStages = [
  "PLACED",
  "IN_PROGRESS",
  "READY",
  "FULFILLED",
] as const;
