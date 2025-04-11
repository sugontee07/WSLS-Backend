import mongoose from "mongoose";

// สร้าง schema สำหรับ ImportPdf
const importPdfSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: [true, "ต้องระบุเลขบิล (billNumber)"],
      unique: true,
      trim: true,
      match: [/^\d+$/, "เลขบิลต้องเป็นตัวเลขเท่านั้น"],
    },
    pdfUrl: {
      type: String,
      required: [true, "ต้องระบุ URL ของ PDF (pdfUrl)"],
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false, // อนุญาตให้เป็น null ได้
      default: null,
    },
    employeeId: {
      type: String, // เพิ่มฟิลด์ employeeId
      required: false,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // เพิ่ม createdAt และ updatedAt อัตโนมัติ
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// // เพิ่ม index สำหรับ billNumber
// importPdfSchema.index({ billNumber: 1 }, { unique: true });

// Middleware: จัดการ error เมื่อ billNumber ซ้ำ
importPdfSchema.post("save", function (error, doc, next) {
  if (error.name === "MongoServerError" && error.code === 11000) {
    next(new Error(`เลขบิล ${doc.billNumber} มีอยู่ในระบบแล้ว`));
  } else {
    next(error);
  }
});

// Middleware: จัดการ error สำหรับการ update (เช่น findOneAndUpdate)
importPdfSchema.post("findOneAndUpdate", function (error, doc, next) {
  if (error.name === "MongoServerError" && error.code === 11000) {
    next(new Error(`เลขบิล ${doc.billNumber} มีอยู่ในระบบแล้ว`));
  } else {
    next(error);
  }
});

// Middleware: ตรวจสอบก่อนบันทึก
importPdfSchema.pre("save", async function (next) {
  // ตรวจสอบว่า billNumber มีอยู่ใน ImportBill หรือ ExportBill หรือไม่
  const [importBill, exportBill] = await Promise.all([
    mongoose.model("ImportBill").findOne({ billNumber: this.billNumber }),
    mongoose.model("ExportBill").findOne({ billNumber: this.billNumber }),
  ]);

  if (!importBill && !exportBill) {
    return next(new Error(`ไม่พบเลขบิล ${this.billNumber} ในระบบ ImportBill หรือ ExportBill`));
  }

  // ถ้า userId ไม่เป็น null ตรวจสอบว่า userId มีอยู่ในระบบหรือไม่
  if (this.userId) {
    const User = mongoose.model("User");
    const userExists = await User.findById(this.userId);
    if (!userExists) {
      return next(new Error(`ไม่พบผู้ใช้ที่มี ID ${this.userId}`));
    }
  }

  next();
});

// Virtual: ดึงข้อมูล user
importPdfSchema.virtual("user", {
  ref: "User",
  localField: "userId",
  foreignField: "_id",
  justOne: true,
});

// สร้างโมเดล
const ImportPdf = mongoose.model("ImportPdf", importPdfSchema);

export default ImportPdf;