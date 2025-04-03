import express from "express";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js";
import { protect, isAdmin } from "../middleware/auth.js";
import ImpostPdf from "../model/ImportPdf.js"; // แก้ไขเส้นทางให้ถูกต้อง

const router = express.Router();


// เส้นทาง: ดึงข้อมูลบิลทั้งหมด (เพิ่ม pdfUrl และ employeeId)
router.get("/allBills", async (req, res) => {
  try {
    // ดึงข้อมูลจาก ImportBill (คอลเลกชัน importbills) ทั้งหมด
    const importBills = await ImportBill.find().lean();

    if (!importBills || importBills.length === 0) {
      return res.status(200).json({
        success: true,
        message: "ยังไม่มีบิลในระบบ",
        data: [],
      });
    }

    // ดึงข้อมูล PDF ที่เกี่ยวข้องจาก ImpostPdf
    const pdfs = await ImpostPdf.find({
      billNumber: { $in: importBills.map((bill) => bill.billNumber) },
    }).lean();

    // รวมข้อมูลบิลและ PDF โดยไม่ตัดข้อมูลจาก importbills
    const billsWithPdf = importBills.map((bill) => {
      const pdf = pdfs.find((p) => p.billNumber === bill.billNumber);
      return {
        ...bill, // รวมข้อมูลทั้งหมดจาก importbills
        employeeId: bill.employeeId || pdf?.employeeId || "ไม่ระบุ", // เพิ่ม employeeId
        pdfUrl: pdf?.pdfUrl || null, // เพิ่ม pdfUrl จาก ImpostPdf
      };
    });

    res.status(200).json({
      success: true,
      data: billsWithPdf,
    });
  } catch (error) {
    console.error("ไม่สามารถดึงข้อมูลบิลได้:", error);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถดึงข้อมูลบิลได้",
      details: error.message,
    });
  }
});

// เส้นทาง: ดึงข้อมูลบิลตาม billNumber (เพิ่ม pdfUrl และ employeeId)
router.get("/billNumber/:billNumber", protect, async (req, res) => {
  try {
    const billNumber = req.params.billNumber;
    if (!billNumber || typeof billNumber !== "string") {
      return res.status(400).json({
        success: false,
        error: "เลขบิลไม่ถูกต้อง: billNumber ต้องเป็นสตริงและไม่ว่างเปล่า",
      });
    }

    // ดึงข้อมูลจาก ImportBill (คอลเลกชัน importbills) ทั้งหมด
    const bill = await ImportBill.findOne({ billNumber }).lean();

    if (!bill) {
      return res.status(404).json({
        success: false,
        error: `ไม่พบบิลที่มี billNumber: ${billNumber}`,
      });
    }

    // ดึง pdfUrl จาก ImpostPdf
    const pdf = await ImpostPdf.findOne({ billNumber }).lean();

    // สร้าง response โดยรวมข้อมูลทั้งหมดจาก importbills
    res.status(200).json({
      success: true,
      data: {
        ...bill, // รวมข้อมูลทั้งหมดจาก importbills
        employeeId: bill.employeeId || pdf?.employeeId || "ไม่ระบุ", // เพิ่ม employeeId
        pdfUrl: pdf?.pdfUrl || null, // เพิ่ม pdfUrl จาก ImpostPdf
      },
    });
  } catch (error) {
    console.error("ไม่สามารถดึงข้อมูลบิลได้:", error);
    res.status(500).json({
      success: false,
      error: "ไม่สามารถดึงข้อมูลบิลได้",
      details: error.message,
    });
  }
});

export default router;