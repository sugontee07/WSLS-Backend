import mongoose from "mongoose";

// Sub-schema สำหรับ items ใน bill
const billItemSchema = new mongoose.Schema({
  product: {
    productId: { type: String, required: true },
    name: { type: String, required: true },
    image: { type: String },
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, "Quantity must be at least 1"],
  },
});

// Main schema สำหรับ bill
const billSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    unique: true,
  },
  items: [billItemSchema],
  totalItems: {
    type: Number,
    required: true,
    default: 0,
  },
  inDate: {
    type: String, // เก็บเฉพาะวัน/เดือน/ปี เช่น "2025-03-19"
    default: () => {
      const date = new Date();
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`; // เช่น "2025-03-19"
    },
    match: [/^\d{4}-\d{2}-\d{2}$/, "inDate must be in format YYYY-MM-DD"], // ตรวจสอบรูปแบบ
  },
  endDate: {
    type: String, // เก็บเฉพาะวัน/เดือน/ปี เช่น "2025-03-20"
    required: [true, "endDate is required"],
    match: [/^\d{4}-\d{2}-\d{2}$/, "endDate must be in format YYYY-MM-DD"], // ตรวจสอบรูปแบบ
  },
});

// Pre-save hook เพื่อสร้าง billNumber อัตโนมัติ
billSchema.pre("save", async function (next) {
  if (!this.billNumber) {
    const date = new Date(this.inDate); // ใช้ inDate ในการสร้าง billNumber
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0"); // เดือน 2 หลัก
    const day = String(date.getDate()).padStart(2, "0"); // วัน 2 หลัก
    const prefix = `BILL-${year}${month}${day}`; // รูปแบบ BILL-YYYYMMDD

    // หา bill ล่าสุดที่มี prefix นี้
    const lastBill = await mongoose.model("Bill", billSchema)
      .findOne({ billNumber: new RegExp(`^${prefix}`) })
      .sort({ billNumber: -1 });
    let sequence = 1;

    if (lastBill) {
      const lastSequence = parseInt(lastBill.billNumber.split("-")[2], 10);
      sequence = lastSequence + 1;
    }

    // สร้าง billNumber ในรูปแบบ BILL-YYYYMMDD-XXXX
    const sequenceString = String(Math.floor(10000000 + Math.random() * 90000000)); // สุ่มตัวเลข 8 หลัก
    this.billNumber = `${sequenceString}`; // เช่น 12345678
  }

  // อัปเดต totalItems
  this.totalItems = this.items.reduce((sum, item) => sum + item.quantity, 0);

  next();
});

const Bill = mongoose.model("Bill", billSchema);
export default Bill;