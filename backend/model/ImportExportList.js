import mongoose from "mongoose";

const importExportListSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
    unique: true, // วันที่ต้องไม่ซ้ำ (เก็บข้อมูลรายวัน)
  },
  inCount: {
    type: Number,
    default: 0, // จำนวนสินค้าที่เข้า
  },
  outCount: {
    type: Number,
    default: 0, // จำนวนสินค้าที่ออก
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

// อัปเดต updatedAt ก่อนบันทึก
importExportListSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

const ImportExportList = mongoose.model("ImportExportList", importExportListSchema);

export default ImportExportList;