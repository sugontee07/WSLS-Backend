import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// Route สำหรับดึงข้อมูลบิลตาม billNumber
router.get("/:billNumber", async (req, res) => {
  try {
    const billNumber = req.params.billNumber;
    const db = mongoose.connection.db;
    const bill = await db.collection("bills").findOne({ billNumber: billNumber });
    if (bill) {
      res.json(bill);
    } else {
      res.status(404).json({ message: "ไม่พบข้อมูลบิล" });
    }
  } catch (error) {
    console.error("Error fetching bill:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด", error: error.message });
  }
});

// Route สำหรับเพิ่มบิลใหม่ (ตั้งค่า inDate อัตโนมัติ)
router.post("/", async (req, res) => {
  try {
    const billData = req.body; // ข้อมูลบิลจาก body (เช่น billNumber และ items)

    // กำหนดวันที่ปัจจุบันในรูปแบบ YYYY-MM-DD
    const currentDate = new Date().toISOString().split("T")[0];

    // อัปเดต inDate ในทุก product ภายใน items ให้เป็นวันที่ปัจจุบัน
    const updatedItems = billData.items.map(item => ({
      product: {
        ...item.product,
        inDate: currentDate // แทนที่ inDate เดิมด้วยวันที่ปัจจุบัน
      }
    }));

    // สร้างข้อมูลบิลใหม่พร้อม items ที่อัปเดตแล้ว
    const updatedBillData = {
      ...billData,
      items: updatedItems
    };

    const db = mongoose.connection.db;
    await db.collection("bills").insertOne(updatedBillData);
    res.status(201).json(updatedBillData); // ส่งข้อมูลบิลที่เพิ่มเข้าไปกลับมา
  } catch (error) {
    console.error("Error adding bill:", error);
    res.status(500).json({ message: "เกิดข้อผิดพลาด", error: error.message });
  }
});

// Route สำหรับอัปเดตบิลตาม billNumber
router.get("/cells", async (req, res) => {
    try {
      const { col, row } = req.query;
      let query = {};
  
      if (col) query.col = col;
      if (row) query.row = row;
  
      console.log("Querying cells with:", query);
      const cells = await Cell.find(query);
      console.log("Found cells:", cells);
  
      const newCells = cells.reduce((acc, cell) => {
        if (!acc[cell.col]) acc[cell.col] = [];
        acc[cell.col].push({
          id: cell.cellId,
          row: cell.row,
          subCells: cell.subCells,
          products: cell.products,
        });
        return acc;
      }, {});
  
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