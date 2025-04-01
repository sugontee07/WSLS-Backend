import express from "express";
import Product from "../model/Product.js";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js";
import dotenv from "dotenv";
import { protect } from "../middleware/auth.js"; // ยังคงใช้ protect

dotenv.config();

const router = express.Router();

// เส้นทาง: สร้างบิลใหม่ (ตัด validateBill ออก)
router.post("/create", protect, async (req, res) => {
  try {
    // ตรวจสอบผู้ใช้จาก protect middleware
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, error: "ไม่พบข้อมูลผู้ใช้" });
    }

    const { items } = req.body;

    // ตรวจสอบข้อมูล items (ย้ายการตรวจสอบจาก validateBill มาไว้ที่นี่)
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "ต้องระบุ items และต้องเป็นอาร์เรย์ที่ไม่ว่าง" });
    }

    // ตรวจสอบโครงสร้างของแต่ละ item
    for (const item of items) {
      if (!item.productId || typeof item.productId !== "string") {
        return res.status(400).json({ success: false, error: "ต้องระบุ productId และต้องเป็น string" });
      }
      if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1) {
        return res.status(400).json({ success: false, error: "ต้องระบุ quantity และต้องเป็นตัวเลขที่มากกว่า 0" });
      }
      if (!item.endDate || isNaN(new Date(item.endDate).getTime())) {
        return res.status(400).json({ success: false, error: "ต้องระบุ endDate และต้องเป็นวันที่ที่ถูกต้อง" });
      }
    }

    // ดำเนินการสร้างบิล
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
          inDate: new Date(),
        },
        quantity: item.quantity,
      });
    }

    const billNumber = await generateUniqueBillNumber();

    const newBill = new ImportBill({
      billNumber,
      items: updatedItems,
      type: "pending",
    });

    await newBill.save();

    res.status(201).json({
      success: true,
      data: {
        billNumber: newBill.billNumber,
        items: newBill.items.map((item) => ({
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

export default router;