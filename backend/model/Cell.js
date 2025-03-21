import mongoose from "mongoose";

const productDetailSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    type: { type: String, required: true },
    name: { type: String, required: true },
    image: { type: String },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    product: { type: productDetailSchema, required: true },
    quantity: { type: Number, required: true, min: 1 },
    endDate: { type: Date, required: true },
    inDate: { type: Date, required: true }, // เพิ่ม inDate
  },
  { _id: false }
);

const subCellSchema = new mongoose.Schema(
  {
    label: { type: String, default: null },
    status: { type: Number, enum: [0, 1, 2, 3], default: 0 },
    products: { type: [productSchema], default: [] },
  },
  { _id: false }
);

const cellSchema = new mongoose.Schema({
  cellId: {
    type: String,
    required: [true, "Cell ID is required"],
    unique: true,
  },
  col: {
    type: String,
  },
  row: {
    type: String,
  },
  divisionType: {
    type: String,
    enum: [null, "single", "dual"],
    default: "single",
  },
  status: {
    type: Number,
    enum: [0, 1, 2, 3],
    default: 0,
  },
  products: { type: [productSchema], default: [] },
  subCellsA: {
    type: subCellSchema,
    default: () => ({ status: 0, products: [], label: null }),
  },
  subCellsB: {
    type: subCellSchema,
    default: () => ({ status: 0, products: [], label: null }),
  },
  total: {
    type: Number,
    default: 0,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// อัปเดต updatedAt และจัดการข้อมูลก่อนบันทึก
cellSchema.pre("save", function (next) {
  this.updatedAt = new Date();

  // รวม quantity ถ้า productId ซ้ำกันใน products
  if (this.products && this.products.length > 0) {
    const productMap = new Map();
    for (const product of this.products) {
      const productId = product.product.productId;
      if (productMap.has(productId)) {
        const existing = productMap.get(productId);
        existing.quantity += product.quantity;
      } else {
        const productObj = product.toObject();
        if (product.inDate) {
          productObj.inDate = product.inDate;
        }
        productMap.set(productId, productObj);
      }
    }
    this.products = Array.from(productMap.values()).filter(p => p.quantity > 0);
  }

  // รวม quantity ถ้า productId ซ้ำกันใน subCellsA
  if (this.subCellsA && this.subCellsA.products && this.subCellsA.products.length > 0) {
    const productMap = new Map();
    for (const product of this.subCellsA.products) {
      const productId = product.product.productId;
      if (productMap.has(productId)) {
        const existing = productMap.get(productId);
        existing.quantity += product.quantity;
      } else {
        const productObj = product.toObject();
        if (product.inDate) {
          productObj.inDate = product.inDate;
        }
        productMap.set(productId, productObj);
      }
    }
    this.subCellsA.products = Array.from(productMap.values()).filter(p => p.quantity > 0);
  }

  // รวม quantity ถ้า productId ซ้ำกันใน subCellsB
  if (this.subCellsB && this.subCellsB.products && this.subCellsB.products.length > 0) {
    const productMap = new Map();
    for (const product of this.subCellsB.products) {
      const productId = product.product.productId;
      if (productMap.has(productId)) {
        const existing = productMap.get(productId);
        existing.quantity += product.quantity;
      } else {
        const productObj = product.toObject();
        if (product.inDate) {
          productObj.inDate = product.inDate;
        }
        productMap.set(productId, productObj);
      }
    }
    this.subCellsB.products = Array.from(productMap.values()).filter(p => p.quantity > 0);
  }

  // คำนวณ total จาก quantity ใน products และ subCells
  let total = 0;
  if (this.products && this.products.length > 0) {
    total += this.products.reduce((sum, product) => sum + (product.quantity || 0), 0);
  }
  if (this.subCellsA && this.subCellsA.products && this.subCellsA.products.length > 0) {
    total += this.subCellsA.products.reduce((sum, product) => sum + (product.quantity || 0), 0);
  }
  if (this.subCellsB && this.subCellsB.products && this.subCellsB.products.length > 0) {
    total += this.subCellsB.products.reduce((sum, product) => sum + (product.quantity || 0), 0);
  }
  this.total = total;

  // ถ้า divisionType เป็น "single" ให้ล้าง subCellsA และ subCellsB
  if (this.divisionType === "single") {
    this.subCellsA = { status: 0, products: [], label: null };
    this.subCellsB = { status: 0, products: [], label: null };
  }

  next();
});

const Cell = mongoose.model("Cell", cellSchema);

// Migration script เพื่ออัปเดตข้อมูลเก่า
async function migrateOldCells() {
  const cells = await Cell.find();
  for (const cell of cells) {
    // อัปเดต divisionType
    if (cell.divisionType === undefined || cell.divisionType === null) {
      cell.divisionType = "single";
    }

    // อัปเดต status
    if (cell.status === undefined || cell.status === null) {
      cell.status = 0;
    }

    // อัปเดต subCellsA และ subCellsB
    if (!cell.subCellsA || typeof cell.subCellsA.status === "undefined") {
      cell.subCellsA = { status: 0, products: [], label: null };
    } else {
      cell.subCellsA.status = Number(cell.subCellsA.status);
      if (isNaN(cell.subCellsA.status) || ![0, 1, 2, 3].includes(cell.subCellsA.status)) {
        cell.subCellsA.status = 0;
      }
      if (!cell.subCellsA.products) {
        cell.subCellsA.products = [];
      }
      if (!cell.subCellsA.label) {
        cell.subCellsA.label = null;
      }
    }

    if (!cell.subCellsB || typeof cell.subCellsB.status === "undefined") {
      cell.subCellsB = { status: 0, products: [], label: null };
    } else {
      cell.subCellsB.status = Number(cell.subCellsB.status);
      if (isNaN(cell.subCellsB.status) || ![0, 1, 2, 3].includes(cell.subCellsB.status)) {
        cell.subCellsB.status = 0;
      }
      if (!cell.subCellsB.products) {
        cell.subCellsB.products = [];
      }
      if (!cell.subCellsB.label) {
        cell.subCellsB.label = null;
      }
    }

    // อัปเดต products ให้สอดคล้องกับ schema ใหม่
    if (cell.products) {
      cell.products = cell.products
        .filter(p => p.product && p.product.productId && p.quantity && p.endDate)
        .map(p => ({
          product: {
            productId: p.product.productId,
            type: p.product.type || "Unknown",
            name: p.product.name || "Unknown",
            image: p.product.image || null,
          },
          quantity: p.quantity,
          endDate: p.endDate,
          inDate: p.inDate || new Date("2025-01-01"), // เพิ่ม inDate ถ้าไม่มี
        }));
    }

    // อัปเดต subCellsA.products
    if (cell.subCellsA && cell.subCellsA.products) {
      cell.subCellsA.products = cell.subCellsA.products
        .filter(p => p.product && p.product.productId && p.quantity && p.endDate)
        .map(p => ({
          product: {
            productId: p.product.productId,
            type: p.product.type || "Unknown",
            name: p.product.name || "Unknown",
            image: p.product.image || null,
          },
          quantity: p.quantity,
          endDate: p.endDate,
          inDate: p.inDate || new Date("2025-01-01"), // เพิ่ม inDate ถ้าไม่มี
        }));
    }

    // อัปเดต subCellsB.products
    if (cell.subCellsB && cell.subCellsB.products) {
      cell.subCellsB.products = cell.subCellsB.products
        .filter(p => p.product && p.product.productId && p.quantity && p.endDate)
        .map(p => ({
          product: {
            productId: p.product.productId,
            type: p.product.type || "Unknown",
            name: p.product.name || "Unknown",
            image: p.product.image || null,
          },
          quantity: p.quantity,
          endDate: p.endDate,
          inDate: p.inDate || new Date("2025-01-01"), // เพิ่ม inDate ถ้าไม่มี
        }));
    }

    await cell.save();
  }
}

// รัน migration script
migrateOldCells().catch(console.error);

export default Cell;