import mongoose from "mongoose";

// ฟังก์ชันสำหรับสร้างเลขบิลแบบสุ่ม 8 หลัก
const generateBillNumber = () => {
  const min = 10000000; // ตัวเลขขั้นต่ำ (8 หลัก)
  const max = 99999999; // ตัวเลขสูงสุด (8 หลัก)
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
    required: true, // ต้องระบุ
  },
  name: {
    type: String,
    required: true, // ต้องระบุ
  },
  type: {
    type: String,
    required: true, // ต้องระบุ
  },
  image: {
    type: String,
    default: "", // ค่าเริ่มต้นเป็นสตริงว่าง
  },
  endDate: {
    type: Date,
    required: true, // ต้องระบุ
  },
  inDate: {
    type: Date,
    required: true, // ต้องระบุ
  },
});

// สคีมาสำหรับรายการในบิล
const itemSchema = new mongoose.Schema({
  cellId: {
    type: String,
    required: false, // ไม่บังคับ
  },
  product: {
    type: productSchema,
    required: true, // ต้องระบุ
  },
  quantity: {
    type: Number,
    required: true, // ต้องระบุ
    min: 1, // จำนวนต้องมากกว่า 0
  },
  withdrawDate: {
    type: Date,
    required: false, // ไม่บังคับ
  },
});

// สคีมาสำหรับบิล
const billSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true, // ต้องระบุ
      unique: true, // ต้องไม่ซ้ำ
      // ลบ default ออก เพราะเราจะจัดการใน router
    },
    items: [itemSchema], // รายการสินค้า
    totalItems: {
      type: Number,
      required: true, // ต้องระบุ
      default: 0, // ค่าเริ่มต้นเป็น 0
    },
    type: {
      type: String,
      enum: ["in", "out"], // ต้องเป็น "in" หรือ "out"
      required: true, // ต้องระบุ
    },
  },
  { timestamps: true } // เพิ่มฟิลด์ createdAt และ updatedAt อัตโนมัติ
);

// ฟังก์ชัน pre-save เพื่อคำนวณ totalItems และตรวจสอบฟิลด์ตาม type
billSchema.pre("save", function (next) {
  // คำนวณ totalItems
  this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);

  // ตรวจสอบฟิลด์ตาม type
  if (this.type === "out") {
    // สำหรับ type: "out" (การเบิกสินค้า) ต้องมี cellId และ withdrawDate
    for (const item of this.items) {
      if (!item.cellId) {
        return next(new Error("ต้องระบุ cellId สำหรับ type 'out'"));
      }
      if (!item.withdrawDate) {
        return next(new Error("ต้องระบุ withdrawDate สำหรับ type 'out'"));
      }
    }
  } else if (this.type === "in") {
    // สำหรับ type: "in" (การนำเข้า) ไม่ต้องมี cellId และ withdrawDate
    for (const item of this.items) {
      if (item.cellId || item.withdrawDate) {
        return next(new Error("ไม่ควรระบุ cellId และ withdrawDate สำหรับ type 'in'"));
      }
    }
  } else {
    return next(new Error("ต้องระบุ type และต้องเป็น 'in' หรือ 'out'"));
  }

  next();
});

// สร้างสองโมเดลสำหรับสองคอลเลกชัน
const ImportBill = mongoose.model("ImportBill", billSchema, "importbills"); // สำหรับ type: "in"
const ExportBill = mongoose.model("ExportBill", billSchema, "exporbills"); // สำหรับ type: "out"

// ส่งออกทั้งโมเดลและฟังก์ชัน
export { ImportBill, ExportBill, generateUniqueBillNumber };