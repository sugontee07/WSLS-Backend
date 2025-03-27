import express from "express";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js"; // นำเข้า generateUniqueBillNumber
import Product from "../model/Product.js";
import { protect, isAdmin } from "../middleware/auth.js";

const router = express.Router();

// Middleware สำหรับตรวจสอบข้อมูลบิล
const validateBill = async (req, res, next) => {
  if (!req.body) {
    return res.status(400).json({ success: false, error: "ไม่พบข้อมูลในคำขอ" });
  }

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "รายการสินค้าต้องเป็นอาร์เรย์และไม่ว่างเปล่า" });
  }

  for (const item of items) {
    if (!item.productId || !item.quantity || !item.endDate) {
      return res.status(400).json({ success: false, error: "แต่ละรายการต้องมี productId, quantity และ endDate" });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(item.endDate)) {
      return res.status(400).json({
        success: false,
        error: "endDate ต้องอยู่ในรูปแบบ YYYY-MM-DD",
      });
    }

    const endDateObj = new Date(item.endDate);
    if (isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        error: "endDate ไม่ใช่วันที่ที่ถูกต้อง",
      });
    }

    if (typeof item.quantity !== "number" || item.quantity < 1) {
      return res.status(400).json({ success: false, error: "จำนวนต้องเป็นตัวเลขและมากกว่า 0" });
    }

    const productExists = await Product.findOne({ productId: item.productId });
    if (!productExists) {
      return res.status(404).json({ success: false, error: `ไม่พบสินค้าที่มี productId: ${item.productId}` });
    }
  }

  next();
};

// เส้นทาง: สร้างบิลใหม่ (สำหรับ type: "in" เท่านั้น)
router.post("/create", validateBill, async (req, res) => {
  try {
    const { items } = req.body;

    const updatedItems = [];
    for (const item of items) {
      const product = await Product.findOne({ productId: item.productId });
      if (!product) {
        return res.status(404).json({
          success: false,
          error: `ไม่พบสินค้าที่มี ID ${item.productId}`,
        });
      }

      updatedItems.push({
        product: {
          productId: item.productId,
          name: product.name,
          type: product.type,
          image: product.image || "",
          endDate: new Date(item.endDate),
          inDate: new Date(), // เพิ่มวันที่นำเข้า
        },
        quantity: item.quantity,
      });
    }

    console.log("รายการที่อัปเดต:", JSON.stringify(updatedItems, null, 2));

    // สร้าง billNumber ที่ไม่ซ้ำกัน
    const billNumber = await generateUniqueBillNumber();

    const newBill = new ImportBill({
      billNumber, // ใช้ billNumber ที่สร้างจาก generateUniqueBillNumber
      items: updatedItems,
      type: "in",
    });

    await newBill.save();

    res.status(201).json({
      success: true,
      data: {
        billNumber: newBill.billNumber,
        items: newBill.items.map(item => ({
          product: {
            productId: item.product.productId,
            name: item.product.name,
            type: item.product.type,
            image: item.product.image,
            endDate: item.product.endDate,
            inDate: item.product.inDate,
          },
          quantity: item.quantity,
        })),
        totalItems: newBill.totalItems,
        type: newBill.type,
        createdAt: newBill.createdAt,
        updatedAt: newBill.updatedAt,
      },
    });
  } catch (error) {
    console.error("ไม่สามารถสร้างบิลได้:", error);
    res.status(500).json({ success: false, error: "ไม่สามารถสร้างบิลได้", details: error.message });
  }
});

// เส้นทาง: ดึงข้อมูลบิลทั้งหมด
router.get("/allBills", async (req, res) => {
  try {
    // ดึงบิลจากทั้งสองคอลเลกชัน
    const importBills = await ImportBill.find();
    const exportBills = await ExportBill.find();
    const bills = [...importBills, ...exportBills]; // รวมผลลัพธ์

    res.status(200).json({
      success: true,
      data: bills.map(bill => ({
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
      })),
    });
  } catch (error) {
    console.error("ไม่สามารถดึงข้อมูลบิลได้:", error);
    res.status(500).json({ success: false, error: "ไม่สามารถดึงข้อมูลบิลได้", details: error.message });
  }
});

// เส้นทาง: ดึงข้อมูลบิลตาม billNumber
router.get("/billNumber/:billNumber", protect, async (req, res) => {
  try {
    const billNumber = req.params.billNumber;
    if (!billNumber || typeof billNumber !== "string") {
      return res.status(400).json({
        success: false,
        error: "เลขบิลไม่ถูกต้อง: billNumber ต้องเป็นสตริงและไม่ว่างเปล่า",
      });
    }

    // ตรวจสอบเฉพาะ ImportBill
    const bill = await ImportBill.findOne({ billNumber });

    if (!bill) {
      return res.status(404).json({
        success: false,
        error: `ไม่พบบิลที่มี billNumber: ${billNumber}`,
      });
    }

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
      },
    });
  } catch (error) {
    console.error("ไม่สามารถดึงข้อมูลบิลได้:", error);
    res.status(500).json({ success: false, error: "ไม่สามารถดึงข้อมูลบิลได้", details: error.message });
  }
});

export default router;