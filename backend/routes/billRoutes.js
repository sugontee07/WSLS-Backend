import express from "express";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js";
import { protect, isAdmin } from "../middleware/auth.js";

const router = express.Router();

// เส้นทาง: ดึงข้อมูลบิลทั้งหมด (เพิ่ม pdfUrl)
router.get("/allBills", async (req, res) => {
  try {
    const importBills = await ImportBill.find();
    const exportBills = await ExportBill.find();
    const bills = [...importBills, ...exportBills];

    // ดึงข้อมูล PDF ที่เกี่ยวข้อง
    const pdfs = await ImpostPdf.find({ billNumber: { $in: bills.map(b => b.billNumber) } });

    res.status(200).json({
      success: true,
      data: bills.map(bill => {
        const pdf = pdfs.find(p => p.billNumber === bill.billNumber);
        return {
          billNumber: bill.billNumber,
          items: bill.items.map(item => ({
            cellId: item.cellId || null,
            product: {
              productId: item.product.productId,
              type: item.product.type,
              name: item.product.name,
              image: item.product.image || null,
              endDate: item.product.endDate,
              inDate: item.product.inDate,
            },
            quantity: item.quantity,
            withdrawDate: item.withdrawDate || null,
          })),
          totalItems: bill.totalItems,
          type: bill.type,
          createdAt: bill.createdAt,
          updatedAt: bill.updatedAt,
          pdfUrl: pdf?.pdfUrl || null
        };
      }),
    });
  } catch (error) {
    console.error("ไม่สามารถดึงข้อมูลบิลได้:", error);
    res.status(500).json({ success: false, error: "ไม่สามารถดึงข้อมูลบิลได้", details: error.message });
  }
});

// เส้นทาง: ดึงข้อมูลบิลตาม billNumber (เพิ่ม pdfUrl)
router.get("/billNumber/:billNumber", protect, async (req, res) => {
  try {
    const billNumber = req.params.billNumber;
    if (!billNumber || typeof billNumber !== "string") {
      return res.status(400).json({
        success: false,
        error: "เลขบิลไม่ถูกต้อง: billNumber ต้องเป็นสตริงและไม่ว่างเปล่า",
      });
    }

    const bill = await ImportBill.findOne({ billNumber });
    if (!bill) {
      return res.status(404).json({
        success: false,
        error: `ไม่พบบิลที่มี billNumber: ${billNumber}`,
      });
    }

    const pdf = await ImpostPdf.findOne({ billNumber });

    res.status(200).json({
      success: true,
      data: {
        billNumber: bill.billNumber,
        items: bill.items.map(item => ({
          cellId: item.cellId || null,
          product: {
            productId: item.product.productId,
            name: item.product.name,
            type: item.product.type,
            image: item.product.image || null,
            endDate: item.product.endDate,
            inDate: item.product.inDate,
          },
          quantity: item.quantity,
          withdrawDate: item.withdrawDate || null,
        })),
        totalItems: bill.totalItems,
        type: bill.type,
        createdAt: bill.createdAt,
        updatedAt: bill.updatedAt,
        pdfUrl: pdf?.pdfUrl || null
      },
    });
  } catch (error) {
    console.error("ไม่สามารถดึงข้อมูลบิลได้:", error);
    res.status(500).json({ success: false, error: "ไม่สามารถดึงข้อมูลบิลได้", details: error.message });
  }
});

export default router;