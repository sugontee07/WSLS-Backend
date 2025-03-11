import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// สร้าง Schema สำหรับ Cell
const cellSchema = new mongoose.Schema({
  col: { type: String, required: true, index: true }, // คอลัมน์ (เช่น "A", "B")
  row: { type: String, required: true }, // แถว (เช่น "1", "2")
  cellId: { type: String, required: true, unique: true }, // ID เฉพาะของเซลล์ (เช่น "A-1")
  capacity: { type: Number, default: 0, min: 0 }, // ความจุ (ต้องไม่ติดลบ)
  subCells: [
    {
      id: { type: String, required: true, unique: true }, // ID เฉพาะของ subCell
      capacity: { type: Number, default: 0, min: 0 }, // ความจุของ subCell
    },
  ], // รองรับ subCells
  status: { type: String, enum: ["enabled", "disabled"], default: "enabled" }, // สถานะ
  isCapacitySet: { type: Boolean, default: false }, // ระบุว่า capacity ถูกตั้งค่าแล้วหรือไม่
}, { timestamps: true });

const Cell = mongoose.model("Cell", cellSchema);

// Middleware เพื่อตรวจสอบข้อมูลขาเข้า
const validateCellData = (req, res, next) => {
  const { cellId, row, col, capacity, subCells, status } = req.body;

  if (!cellId && !req.params.cellId) {
    return res.status(400).json({ success: false, error: "Missing cellId" });
  }
  if (capacity !== undefined && capacity < 0) {
    return res.status(400).json({ success: false, error: "Capacity cannot be negative" });
  }
  if (status && !["enabled", "disabled"].includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid status value" });
  }
  if (subCells && !Array.isArray(subCells)) {
    return res.status(400).json({ success: false, error: "subCells must be an array" });
  }
  if (subCells) {
    const invalidSubCells = subCells.some(
      (sub) => !sub.id || sub.capacity === undefined || sub.capacity < 0
    );
    if (invalidSubCells) {
      return res.status(400).json({ success: false, error: "Invalid subCells data" });
    }
  }
  req.validatedData = { cellId: req.params.cellId || cellId, row, col, capacity, subCells, status };
  next();
};

// 1. ดึงข้อมูลเซลล์ทั้งหมด (Initial Data Load)
router.get("/cells", async (req, res) => {
  try {
    const { col, row } = req.query;
    let query = {};

    if (col) query.col = col;
    if (row) query.row = row;

    const cells = await Cell.find(query);

    const newCells = cells.reduce((acc, cell) => {
      if (!acc[cell.col]) acc[cell.col] = [];
      acc[cell.col].push({
        id: cell.cellId,
        row: cell.row,
        capacity: cell.capacity,
        subCells: cell.subCells,
      });
      return acc;
    }, {});

    const cellStatus = cells.reduce((acc, cell) => {
      acc[cell.cellId] = cell.status;
      return acc;
    }, {});

    const isCapacitySet = cells.reduce((acc, cell) => {
      acc[cell.cellId] = cell.isCapacitySet;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: { newCells, cellStatus, isCapacitySet },
    });
  } catch (error) {
    console.error("Failed to fetch cells:", error);
    res.status(500).json({ success: false, error: "Failed to fetch cells" });
  }
});

// 2. ดึงข้อมูลสรุปสำหรับ Dashboard
router.get("/cells/summary", async (req, res) => {
  try {
    // นับจำนวนเซลล์ทั้งหมด
    const totalBoxes = await Cell.countDocuments();

    // นับจำนวนเซลล์ที่ enabled
    const activeBoxes = await Cell.countDocuments({ status: "enabled" });

    // นับจำนวนเซลล์ที่ disabled
    const disabledBoxes = await Cell.countDocuments({ status: "disabled" });

    res.status(200).json({
      success: true,
      data: {
        totalBoxes,
        activeBoxes,
        disabledBoxes,
      },
    });
  } catch (error) {
    console.error("Failed to fetch cell summary:", error);
    res.status(500).json({ success: false, error: "Failed to fetch cell summary" });
  }
});

// 3. สร้างหรืออัปเดตข้อมูลเซลล์ (Add/Update Cell)
router.post("/cells", validateCellData, async (req, res) => {
  try {
    const { cellId, row, col, capacity, subCells, status } = req.validatedData;

    const existingCell = await Cell.findOne({ cellId });
    if (existingCell) {
      return res.status(400).json({ success: false, error: "Cell ID already exists" });
    }

    const newCell = new Cell({
      cellId,
      row,
      col,
      capacity: capacity || 0,
      subCells: subCells || [],
      status: status || "enabled",
      isCapacitySet: capacity !== undefined,
    });

    await newCell.save();

    res.status(201).json({
      success: true,
      data: {
        cellId: newCell.cellId,
        row: newCell.row,
        col: newCell.col,
        capacity: newCell.capacity,
        subCells: newCell.subCells,
        status: newCell.status,
      },
    });
  } catch (error) {
    console.error("Failed to create cell:", error);
    res.status(500).json({ success: false, error: "Failed to create cell" });
  }
});

router.put("/cells/:cellId", validateCellData, async (req, res) => {
  try {
    const { cellId, row, col, capacity, subCells, status } = req.validatedData;
    const updatedCell = await Cell.findOneAndUpdate(
      { cellId: req.params.cellId },
      { row, col, capacity, subCells, status, isCapacitySet: capacity !== undefined },
      { new: true, runValidators: true }
    );

    if (!updatedCell) {
      return res.status(404).json({ success: false, error: "Cell not found" });
    }

    res.status(200).json({
      success: true,
      data: {
        cellId: updatedCell.cellId,
        row: updatedCell.row,
        col: updatedCell.col,
        capacity: updatedCell.capacity,
        subCells: updatedCell.subCells,
        status: updatedCell.status,
      },
    });
  } catch (error) {
    console.error("Failed to update cell:", error);
    res.status(500).json({ success: false, error: "Failed to update cell" });
  }
});

// 4. เพิ่ม subCells ให้กับเซลล์ที่มีอยู่
router.post("/cells/:cellId/subCells", validateCellData, async (req, res) => {
  try {
    const { subCells } = req.validatedData;
    const cell = await Cell.findOne({ cellId: req.params.cellId });

    if (!cell) {
      return res.status(404).json({ success: false, error: "Cell not found" });
    }

    const existingSubCellIds = new Set(cell.subCells.map((sub) => sub.id));
    const newSubCells = subCells.filter((sub) => {
      if (existingSubCellIds.has(sub.id)) {
        return false;
      }
      existingSubCellIds.add(sub.id);
      return true;
    });

    if (newSubCells.length === 0) {
      return res.status(400).json({ success: false, error: "All subCell IDs already exist" });
    }

    cell.subCells = [...cell.subCells, ...newSubCells];
    await cell.save();

    res.status(201).json({
      success: true,
      data: {
        cellId: cell.cellId,
        subCells: cell.subCells,
      },
    });
  } catch (error) {
    console.error("Failed to add subCells:", error);
    res.status(500).json({ success: false, error: "Failed to add subCells" });
  }
});

// 5. เปลี่ยนสถานะเซลล์โดยตรงที่ /cells/:cellId
router.patch("/cells/:cellId", async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !["enabled", "disabled"].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status value" });
    }

    const updatedCell = await Cell.findOneAndUpdate(
      { cellId: req.params.cellId },
      { status },
      { new: true, runValidators: true }
    );

    if (!updatedCell) {
      return res.status(404).json({ success: false, error: "Cell not found" });
    }

    res.status(200).json({
      success: true,
      data: { cellId: updatedCell.cellId, status: updatedCell.status },
    });
  } catch (error) {
    console.error("Failed to update cell status:", error);
    res.status(500).json({ success: false, error: "Failed to update cell status" });
  }
});

// 6. รีเซ็ต/ลบเซลล์ (Reset Cell)
router.delete("/cells/:cellId", async (req, res) => {
  try {
    const deletedCell = await Cell.findOneAndDelete({ cellId: req.params.cellId });

    if (!deletedCell) {
      return res.status(404).json({ success: false, error: "Cell not found" });
    }

    res.status(200).json({
      success: true,
      message: `Cell ${deletedCell.cellId} has been reset`,
    });
  } catch (error) {
    console.error("Failed to delete cell:", error);
    res.status(500).json({ success: false, error: "Failed to delete cell" });
  }
});

// 7. เพิ่ม Column ใหม่ (Add Location)
router.post("/columns", async (req, res) => {
  try {
    const { col } = req.body;
    if (!col) {
      return res.status(400).json({ success: false, error: "Column is required" });
    }

    const existingCol = await Cell.findOne({ col });
    if (existingCol) {
      return res.status(400).json({ success: false, error: "Column already exists" });
    }

    res.status(201).json({
      success: true,
      data: { col, cells: [] },
    });
  } catch (error) {
    console.error("Failed to add column:", error);
    res.status(500).json({ success: false, error: "Failed to add column" });
  }
});

export default router;