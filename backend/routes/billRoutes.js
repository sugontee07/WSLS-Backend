//billRoutes.js 
import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// กำหนด Schema
const billSchema = new mongoose.Schema({
  billNumber: { type: String, required: true, unique: true }, // บังคับไม่ให้ซ้ำ
  items: [{
    product: {
      productId: { type: String, required: true },
      type: { type: String, required: true },
      name: { type: String, required: true },
      inDate: { type: String, default: () => new Date().toISOString().split("T")[0] },
      endDate: { type: String, required: true },
      quantity: { type: Number, required: true },
      image: { type: String, required: true }
    }
  }]
});

const cellSchema = new mongoose.Schema({
  cellId: { type: String, required: true, unique: true }, // เช่น "A1", "B2"
  row: { type: Number, required: true },
  col: { type: String, required: true },
  status: { type: String, enum: ["ว่าง", "ใช้งาน", "ไม่มีข้อมูล"], default: "ว่าง" },
  products: [Object] // ข้อมูลสินค้าในเซลล์ (ถ้ามี)
});

// กำหนด Model
const Bill = mongoose.models.Bill || mongoose.model("Bill", billSchema);
const Cell = mongoose.models.Cell || mongoose.model("Cell", cellSchema);

// 1. Route สำหรับดึงข้อมูลบิลตาม billNumber
router.get("/bills/:billNumber", async (req, res) => {
  try {
    const billNumber = req.params.billNumber;

    // ดึงข้อมูลบิล
    const bill = await Bill.findOne({ billNumber: billNumber });
    if (!bill) {
      return res.status(404).json({ message: "ไม่พบข้อมูลบิล" });
    }

    // คำนวณ inDate จาก items
    const inDate = bill.items.length > 0 ? bill.items[0].product.inDate : new Date().toISOString().split("T")[0];

    // นับจำนวน productId ที่ไม่ซ้ำกัน
    const uniqueProductIds = new Set(bill.items.map(item => item.product.productId));
    const uniqueProductCount = uniqueProductIds.size;

    res.json({
      bill: {
        ...bill.toObject(),
        inDate: inDate,
        uniqueProductCount: uniqueProductCount // เพิ่มจำนวนสินค้าที่ไม่ซ้ำกัน
      }
    });
  } catch (error) {
    console.error("Error fetching bill:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด", error: error.message });
  }
});

// 2. Route สำหรับเพิ่มบิลใหม่
router.post("/newBill", async (req, res) => {
  try {
    const billData = req.body;

    // ตรวจสอบว่า billNumber ซ้ำหรือไม่
    const existingBill = await Bill.findOne({ billNumber: billData.billNumber });
    if (existingBill) {
      return res.status(400).json({ message: "เลขบิลนี้มีอยู่แล้ว กรุณาใช้เลขบิลอื่น" });
    }

    // กำหนดวันที่ปัจจุบัน
    const currentDate = new Date().toISOString().split("T")[0];

    // อัปเดต inDate ในทุก product ถ้าไม่ได้ระบุมา
    const updatedItems = billData.items.map(item => ({
      product: {
        ...item.product,
        inDate: item.product.inDate || currentDate // ถ้าไม่ระบุ inDate ให้ใช้วันที่ปัจจุบัน
      }
    }));

    // นับจำนวน productId ที่ไม่ซ้ำกัน
    const uniqueProductIds = new Set(updatedItems.map(item => item.product.productId));
    const uniqueProductCount = uniqueProductIds.size;

    // สร้างข้อมูลบิลใหม่
    const updatedBillData = {
      ...billData,
      items: updatedItems
    };

    const newBill = await Bill.create(updatedBillData);
    res.status(201).json({
      ...newBill.toObject(),
      uniqueProductCount: uniqueProductCount // เพิ่มจำนวนสินค้าที่ไม่ซ้ำกันใน response
    });
  } catch (error) {
    console.error("Error adding bill:", error);
    // ตรวจสอบว่า error เป็นเพราะ billNumber ซ้ำ (E11000)
    if (error.code === 11000) {
      return res.status(400).json({ message: "เลขบิลนี้มีอยู่แล้ว กรุณาใช้เลขบิลอื่น" });
    }
    res.status(500).json({ message: "เกิดข้อผิดพลาด", error: error.message });
  }
});

// 3. Route สำหรับดึงข้อมูลเซลล์ (ยังคงไว้เผื่อใช้งานในอนาคต)
router.get("/cells", async (req, res) => {
  try {
    const { col, row } = req.query;
    let query = {};

    // สร้าง query ตาม col และ row
    if (col) query.col = col;
    if (row) query.row = parseInt(row);

    console.log("Querying cells with:", query);
    const cells = await Cell.find(query);

    // จัดกลุ่มเซลล์ตามคอลัมน์
    const newCells = cells.reduce((acc, cell) => {
      if (!acc[cell.col]) acc[cell.col] = [];
      acc[cell.col].push({
        id: cell.cellId,
        row: cell.row,
        subCells: cell.subCells || [],
        products: cell.products || [],
      });
      return acc;
    }, {});

    // สร้าง object สถานะเซลล์
    const cellStatus = cells.reduce((acc, cell) => {
      acc[cell.cellId] = cell.status;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: { newCells, cellStatus },
    });
  } catch (error) {
    console.error("Failed to fetch cells:", error);
    res.status(500).json({ success: false, error: "Failed to fetch cells" });
  }
});

export default router;