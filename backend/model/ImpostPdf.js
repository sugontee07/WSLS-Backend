import mongoose from "mongoose";

const impostPdfSchema = new mongoose.Schema(
  {
    billNumber: {
      type: String,
      required: true,
      unique: true, // เลขบิลต้องไม่ซ้ำ
    },
    pdfUrl: {
      type: String,
      required: true, // URL ของ PDF
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // อ้างอิงไปยังโมเดล User
      required: true,
    },
  },
  { timestamps: true } // เพิ่ม createdAt และ updatedAt อัตโนมัติ
);

// เพิ่ม index และจัดการ error สำหรับ unique constraint
impostPdfSchema.index({ billNumber: 1 }, { unique: true });

// จัดการ error ถ้า billNumber ซ้ำ
impostPdfSchema.post('save', function (error, doc, next) {
  if (error.name === 'MongoServerError' && error.code === 11000) {
    next(new Error(`เลขบิล ${doc.billNumber} มีอยู่ในระบบแล้ว`));
  } else {
    next(error);
  }
});

const ImpostPdf = mongoose.model("ImpostPdf", impostPdfSchema);

export default ImpostPdf;