import mongoose from "mongoose";

// ฟังก์ชันสำหรับสร้างเลขบิลแบบสุ่ม 8 หลัก
const generateBillNumber = () => {
  const min = 10000000;
  const max = 99999999;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// ฟังก์ชันสำหรับสร้างเลขบิลที่ไม่ซ้ำกัน
const generateUniqueBillNumber = async () => {
  let billNumber;
  let isUnique = false;

  while (!isUnique) {
    billNumber = generateBillNumber().toString();
    const existingImportBill = await ImportBill.findOne({ billNumber });
    const existingExportBill = await ExportBill.findOne({ billNumber });
    if (!existingImportBill && !existingExportBill) {
      isUnique = true;
    }
  }

  return billNumber;
};

// สคีมาสำหรับสินค้า
const productSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    default: "",
  },
  endDate: {
    type: Date,
    required: true,
  },
  inDate: {
    type: Date,
    required: true,
  },
});

// สคีมาสำหรับรายการในบิล
const itemSchema = new mongoose.Schema({
  cellId: {
    type: String,
    required: false,
  },
  product: {
    type: productSchema,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  withdrawDate: {
    type: Date,
    required: false,
  },
});

// สคีมาสำหรับบิล
const billSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true,
      unique: true,
    },
    items: [itemSchema],
    totalItems: {
      type: Number,
      required: true,
      default: 0,
    },
    type: {
      type: String,
      enum: ["pending", "in", "out"], // เปลี่ยน enum และตัด "empty" ออก
      required: true,
      default: "pending", // เปลี่ยน default เป็น "pending"
    },
  },
  { timestamps: true }
);

// ฟังก์ชัน pre-save เพื่อคำนวณ totalItems และตรวจสอบฟิลด์ตาม type
billSchema.pre("save", function (next) {
  // คำนวณ totalItems
  this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);

  // ตรวจสอบฟิลด์ตาม type
  if (this.type === "out") {
    for (const item of this.items) {
      if (!item.cellId) {
        return next(new Error("ต้องระบุ cellId สำหรับ type 'out'"));
      }
      if (!item.withdrawDate) {
        return next(new Error("ต้องระบุ withdrawDate สำหรับ type 'out'"));
      }
    }
  } else if (this.type === "in") {
    for (const item of this.items) {
      if (item.cellId || item.withdrawDate) {
        return next(new Error("ไม่ควรระบุ cellId และ withdrawDate สำหรับ type 'in'"));
      }
    }
  } else if (this.type === "pending") {
    // สำหรับ type: "pending" อนุญาตให้มี items ได้ แต่ไม่ต้องมี cellId หรือ withdrawDate
    for (const item of this.items) {
      if (item.cellId || item.withdrawDate) {
        return next(new Error("ไม่ควรระบุ cellId และ withdrawDate สำหรับ type 'pending'"));
      }
    }
  } else {
    return next(new Error("ต้องระบุ type และต้องเป็น 'pending', 'in', หรือ 'out'"));
  }

  next();
});

// สร้างสองโมเดลสำหรับสองคอลเลกชัน
const ImportBill = mongoose.model("ImportBill", billSchema, "importbills");
const ExportBill = mongoose.model("ExportBill", billSchema, "exporbills");

// ส่งออกทั้งโมเดลและฟังก์ชัน
export { ImportBill, ExportBill, generateUniqueBillNumber };