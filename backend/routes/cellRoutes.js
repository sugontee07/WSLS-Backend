import express from "express";
import dotenv from 'dotenv';
import { protect, isAdmin } from '../middleware/auth.js';
import Cell from "../model/Cell.js"; // นำเข้า Cell model จาก Cell.js

dotenv.config();

const router = express.Router();

// Middleware สำหรับตรวจสอบข้อมูล Cell
const validateCellData = (req, res, next) => {
  const { cellId, col, row, status } = req.body;
  if (!cellId || !col || !row) {
    return res.status(400).json({ success: false, error: "Missing required fields: cellId, col, or row" });
  }
  if (status !== undefined && ![0, 1, 2, 3].includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid status value, must be 0, 1, 2, or 3" });
  }
  req.validatedData = { cellId, col, row, status };
  next();
};

// Middleware สำหรับตรวจสอบการอัปเดตสถานะ
const validateStatusUpdate = (req, res, next) => {
  const { cellId, status } = req.body;
  if (!cellId) {
    return res.status(400).json({ success: false, error: "Missing required field: cellId" });
  }
  if (status === undefined || ![0, 1, 2, 3].includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid status value, must be 0, 1, 2, or 3" });
  }
  req.validatedData = { cellId, status };
  next();
};

// Middleware สำหรับตรวจสอบการแก้ไข subCells
const validateEditSubCells = (req, res, next) => {
  const { cellId, subCellChoice } = req.body;
  if (!cellId) {
    return res.status(400).json({ success: false, error: "Missing required field: cellId" });
  }
  if (!subCellChoice || !["R1", "R2", "both"].includes(subCellChoice)) {
    return res.status(400).json({ success: false, error: "Invalid subCellChoice, must be 'R1', 'R2', or 'both'" });
  }
  req.validatedData = { cellId, subCellChoice };
  next();
};

// Route: สร้าง Cell
router.post("/create/cells", validateCellData, async (req, res) => {
  try {
    const { cellId, col, row, status } = req.validatedData;
    const existingCell = await Cell.findOne({ cellId });
    if (existingCell) {
      return res.status(400).json({ success: false, error: "Cell ID already exists" });
    }
    const newCell = new Cell({
      cellId,
      col,
      row,
      status: status !== undefined ? status : 0,
    });
    await newCell.save();
    res.status(201).json({
      success: true,
      data: {
        cellId: newCell.cellId,
        col: newCell.col,
        row: newCell.row,
        status: newCell.status,
        divisionType: newCell.divisionType,
        subCellsA: newCell.subCellsA,
        subCellsB: newCell.subCellsB,
      },
    });
  } catch (error) {
    console.error("Failed to create cell:", error);
    res.status(500).json({ success: false, error: "Failed to create cell", details: error.message });
  }
});

// Route: แก้ไขเซลล์ให้มี subCells
router.put("/edit-subcells", validateEditSubCells, async (req, res) => {
  try {
    const { cellId, subCellChoice } = req.validatedData;
    const cell = await Cell.findOne({ cellId });
    if (!cell) {
      return res.status(404).json({ success: false, error: "Cell not found" });
    }

    if (cell.divisionType !== "single") {
      return res.status(400).json({ success: false, error: "Cell is already divided or not in single mode" });
    }

    // ตรวจสอบว่ามีสินค้าใน Cell หรือไม่
    if (cell.products && cell.products.length > 0) {
      return res.status(400).json({ success: false, error: "Cannot divide cell with existing products" });
    }

    cell.divisionType = "dual";
    cell.status = 0;

    if (subCellChoice === "both") {
      cell.subCellsA.status = 1;
      cell.subCellsB.status = 1;
      cell.subCellsA.label = `${cell.cellId}R1`;
      cell.subCellsB.label = `${cell.cellId}R2`;
    } else {
      cell.subCellsA.status = subCellChoice === "R1" ? 1 : 0;
      cell.subCellsB.status = subCellChoice === "R2" ? 1 : 0;
      cell.subCellsA.label = subCellChoice === "R1" || subCellChoice === "both" ? `${cell.cellId}R1` : null;
      cell.subCellsB.label = subCellChoice === "R2" || subCellChoice === "both" ? `${cell.cellId}R2` : null;
    }

    await cell.save();

    res.status(200).json({
      success: true,
      data: {
        cellId: cell.cellId,
        col: cell.col,
        row: cell.row,
        divisionType: cell.divisionType,
        status: cell.status,
        subCellsA: cell.subCellsA,
        subCellsB: cell.subCellsB,
      },
    });
  } catch (error) {
    console.error("Failed to edit subcells:", error);
    res.status(500).json({ success: false, error: "Failed to edit subcells", details: error.message });
  }
});

// Route: อัปเดตสถานะของ Cell หรือ Subcell
router.put("/update-status", protect, async (req, res) => {
  try {
    const { cellId, status, divisionType } = req.body;

    // ตรวจสอบว่ามี cellId และ status ใน request หรือไม่
    if (!cellId || status === undefined) {
      return res.status(400).json({ success: false, error: "Missing required fields: cellId and status are required" });
    }

    // ตรวจสอบว่า status อยู่ในช่วงที่กำหนด
    if (![0, 1, 2, 3].includes(status)) {
      return res.status(400).json({ success: false, error: "Invalid status value, must be 0, 1, 2, or 3" });
    }

    const isSubCell = cellId.includes("-A") || cellId.includes("-B");
    let cell;

    if (isSubCell) {
      const mainCellId = cellId.split("-").slice(0, 2).join("-");
      cell = await Cell.findOne({ cellId: mainCellId });
      if (!cell) {
        return res.status(404).json({ success: false, error: "Main cell not found" });
      }

      if (cell.divisionType !== "dual") {
        return res.status(400).json({ success: false, error: "Cell is not divided into subcells" });
      }

      if (status === 0 && divisionType === "single") {
        const subCellAProducts = cell.subCellsA.products || [];
        const subCellBProducts = cell.subCellsB.products || [];

        if (subCellAProducts.length > 0 || subCellBProducts.length > 0) {
          cell.subCellsA.products = [];
          cell.subCellsB.products = [];
        }

        cell.divisionType = "single";
        cell.status = 0;
        cell.subCellsA = { status: 0, products: [], label: null };
        cell.subCellsB = { status: 0, products: [], label: null };
      } else {
        if (cellId.endsWith("-A")) {
          if (status === 0) {
            cell.subCellsA.products = [];
          }
          cell.subCellsA.status = status;
        } else if (cellId.endsWith("-B")) {
          if (status === 0) {
            cell.subCellsB.products = [];
          }
          cell.subCellsB.status = status;
        }
      }
    } else {
      cell = await Cell.findOne({ cellId });
      if (!cell) {
        return res.status(404).json({ success: false, error: "Cell not found" });
      }
      if (cell.divisionType === "dual") {
        return res.status(400).json({
          success: false,
          error: "Cannot update status of a dual-divided cell directly; update subcells instead",
        });
      }
      if (status === 0) {
        cell.products = [];
      }
      cell.status = status;
    }

    // อัปเดต updatedAt ด้วยวันที่ปัจจุบัน (ถ้า schema ไม่มี timestamps)
    cell.updatedAt = new Date();

    await cell.save();

    res.status(200).json({
      success: true,
      data: {
        cellId: cell.cellId,
        col: cell.col,
        row: cell.row,
        status: cell.status,
        divisionType: cell.divisionType,
        subCellsA: cell.subCellsA,
        subCellsB: cell.subCellsB,
        updatedAt: cell.updatedAt, // เพิ่ม updatedAt ใน response เพื่อให้เห็นวันที่ล่าสุด
      },
    });
  } catch (error) {
    console.error("Failed to update cell status:", error);
    res.status(500).json({ success: false, error: "Failed to update cell status", details: error.message });
  }
});

// Route: ดึงข้อมูล Cells ทั้งหมด
router.get("/cellsAll", async (req, res) => {
  try {
    const { col, row } = req.query;
    let query = {};
    if (col) query.col = col;
    if (row) query.row = row;

    // ดึงข้อมูล Cells และแปลงเป็น plain JavaScript object ด้วย .lean()
    const cells = await Cell.find(query).lean();

    // ปรับแต่งข้อมูลใน cells
    const formattedCells = cells.map(cell => {
      // ฟังก์ชันสำหรับแปลงวันที่
      const formatProduct = (product) => {
        return {
          product: {
            productId: product.product.productId,
            type: product.product.type,
            name: product.product.name,
            image: product.product.image,
          },
          quantity: product.quantity,
          endDate: product.endDate ? new Date(product.endDate).toISOString().split("T")[0] : null,
          inDate: product.inDate ? new Date(product.inDate).toISOString().split("T")[0] : null,
        };
      };

      // ปรับแต่ง products
      if (cell.products && cell.products.length > 0) {
        cell.products = cell.products.map(formatProduct);
      }

      // ปรับแต่ง subCellsA.products
      if (cell.subCellsA && cell.subCellsA.products && cell.subCellsA.products.length > 0) {
        cell.subCellsA.products = cell.subCellsA.products.map(formatProduct);
      }

      // ปรับแต่ง subCellsB.products
      if (cell.subCellsB && cell.subCellsB.products && cell.subCellsB.products.length > 0) {
        cell.subCellsB.products = cell.subCellsB.products.map(formatProduct);
      }

      return cell;
    });

    res.status(200).json({ success: true, data: formattedCells });
  } catch (error) {
    console.error("Failed to fetch cells:", error);
    res.status(500).json({ success: false, error: "Failed to fetch cells" });
  }
});

// Route: ดึงข้อมูลสรุป
router.get("/summary", protect, async (req, res) => {
  try {
    // นับ Cell ที่มี divisionType เป็น null หรือ single
    const singleOrNullActiveBoxes = await Cell.countDocuments({ divisionType: { $in: [null, "single"] }, status: 1 });
    const singleOrNullInactiveBoxes = await Cell.countDocuments({ divisionType: { $in: [null, "single"] }, status: 2 });
    const singleOrNullDisabledBoxes = await Cell.countDocuments({ divisionType: { $in: [null, "single"] }, status: 3 });
    const singleOrNullNullBoxes = await Cell.countDocuments({ divisionType: { $in: [null, "single"] }, status: 0 });

    // นับ subCellsA
    const activeSubCellsA = await Cell.countDocuments({ divisionType: "dual", "subCellsA.status": 1 });
    const inactiveSubCellsA = await Cell.countDocuments({ divisionType: "dual", "subCellsA.status": 2 });
    const disabledSubCellsA = await Cell.countDocuments({ divisionType: "dual", "subCellsA.status": 3 });
    const nullSubCellsA = await Cell.countDocuments({ divisionType: "dual", "subCellsA.status": 0 });

    // นับ subCellsB
    const activeSubCellsB = await Cell.countDocuments({ divisionType: "dual", "subCellsB.status": 1 });
    const inactiveSubCellsB = await Cell.countDocuments({ divisionType: "dual", "subCellsB.status": 2 });
    const disabledSubCellsB = await Cell.countDocuments({ divisionType: "dual", "subCellsB.status": 3 });
    const nullSubCellsB = await Cell.countDocuments({ divisionType: "dual", "subCellsB.status": 0 });

    // คำนวณ Total Boxes เป็นผลรวมของ status 1, 2, 3 เท่านั้น
    const totalBoxes = singleOrNullActiveBoxes + singleOrNullInactiveBoxes + singleOrNullDisabledBoxes +
                       activeSubCellsA + inactiveSubCellsA + disabledSubCellsA +
                       activeSubCellsB + inactiveSubCellsB + disabledSubCellsB;

    // คำนวณ emptyBoxes (status: 0)
    const emptyBoxes = singleOrNullNullBoxes + nullSubCellsA + nullSubCellsB;

    // คำนวณ allBoxes โดยนับจำนวน Cell และ subCells ทั้งหมด
    const singleOrNullCells = await Cell.countDocuments({ divisionType: { $in: [null, "single"] } });
    const dualCells = await Cell.countDocuments({ divisionType: "dual" });
    const allBoxes = singleOrNullCells + (dualCells * 2); // dualCells มี 2 subCells (A และ B)

    // หาเซลล์ที่มี updatedAt ล่าสุด
    const latestUpdate = await Cell.findOne().sort({ updatedAt: -1 }).lean();
    const lastUpdateDate = latestUpdate ? latestUpdate.updatedAt : new Date();

    // แปลงวันที่เป็นรูปแบบ DD/MM/YY (ตามภาพ)
    const formattedLastUpdate = lastUpdateDate.toLocaleDateString('th-TH', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });

    res.status(200).json({
      success: true,
      data: {
        totalBoxes: totalBoxes,
        activeBoxes: singleOrNullActiveBoxes + activeSubCellsA + activeSubCellsB,
        inactiveBoxes: singleOrNullInactiveBoxes + inactiveSubCellsA + inactiveSubCellsB,
        disabledBoxes: singleOrNullDisabledBoxes + disabledSubCellsA + disabledSubCellsB,
        emptyBoxes: emptyBoxes,
        allBoxes: allBoxes, // เพิ่ม allBoxes
        lastUpdate: formattedLastUpdate
      },
    });
  } catch (error) {
    console.error("Failed to fetch cell summary:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch cell summary",
      details: error.message,
    });
  }
});

export default router;