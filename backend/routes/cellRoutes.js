import express from "express";
import mongoose from "mongoose";
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
    console.log("Raw cells data:", cells); // เพิ่ม log เพื่อตรวจสอบข้อมูลดิบ

    // ปรับแต่งข้อมูลใน cells
    const formattedCells = cells.map(cell => {
      // ฟังก์ชันสำหรับแปลงวันที่
      const formatProduct = (product) => {
        console.log("Raw product data:", product); // เพิ่ม log เพื่อตรวจสอบ product
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

// Route: เพิ่มสินค้าจากบิลไปยัง Cell ที่เลือก (แยกสินค้าไปยัง location ต่าง ๆ ได้)
router.post("/assign-products-from-bill", async (req, res) => {
  try {
    const { billNumber, assignments } = req.body;

    // ตรวจสอบ input
    if (!billNumber || !assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: billNumber and assignments (array) are required",
      });
    }

    // ตรวจสอบว่า assignments มีข้อมูลครบถ้วน
    for (const assignment of assignments) {
      if (!assignment.productId || !assignment.cellId) {
        return res.status(400).json({
          success: false,
          error: "Each assignment must include productId and cellId",
        });
      }
    }

    // ดึงข้อมูลบิล
    const Bill = mongoose.model("Bill");
    const bill = await Bill.findOne({ billNumber });
    if (!bill) {
      return res.status(404).json({ success: false, error: "Bill not found" });
    }

    const items = bill.items;
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: "No items found in the bill" });
    }

    // ตรวจสอบ inDate ของ bill
    if (!bill.inDate) {
      return res.status(400).json({
        success: false,
        error: "Bill is missing required field: inDate",
      });
    }

    // เก็บผลลัพธ์การ assign
    const assignmentResults = [];
    const cellsToUpdate = new Map();

    // วนลูปเพื่อ assign สินค้าแต่ละตัว
    for (const assignment of assignments) {
      const { productId, cellId, subCell } = assignment;

      // ตรวจสอบว่าสินค้าอยู่ในบิลหรือไม่
      const item = items.find(i => i.product.productId === productId);
      if (!item) {
        return res.status(400).json({
          success: false,
          error: `Product with ID ${productId} not found in bill ${billNumber}`,
        });
      }

      // ตรวจสอบข้อมูลที่จำเป็น
      if (!item.product.type || !item.product.name) {
        return res.status(400).json({
          success: false,
          error: `Product with ID ${productId} is missing required fields: type or name`,
        });
      }

      // ตรวจสอบ endDate ของ item
      if (!item.endDate) {
        return res.status(400).json({
          success: false,
          error: `Product with ID ${productId} is missing required field: endDate`,
        });
      }

      // ตรวจสอบและแปลงวันที่
      const inDate = new Date(bill.inDate);
      const endDate = new Date(item.endDate);
      if (isNaN(inDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Invalid date format for inDate or endDate",
        });
      }

      // ดึงข้อมูล Cell
      let cell = cellsToUpdate.get(cellId);
      if (!cell) {
        cell = await Cell.findOne({ cellId });
        if (!cell) {
          return res.status(404).json({ success: false, error: `Cell ${cellId} not found` });
        }
        cellsToUpdate.set(cellId, cell);
      }

      // Handle "null" string as null
      const effectiveSubCell = subCell === "null" ? null : subCell;

      let targetStatus;
      let targetProducts;

      // ตรวจสอบว่าเป็น subCell หรือ Cell หลัก
      if (effectiveSubCell) {
        if (cell.divisionType !== "dual") {
          return res.status(400).json({ success: false, error: `Cell ${cellId} is not divided into subCells` });
        }

        if (effectiveSubCell === "subCellsA") {
          targetStatus = cell.subCellsA.status;
          targetProducts = cell.subCellsA.products || [];
        } else if (effectiveSubCell === "subCellsB") {
          targetStatus = cell.subCellsB.status;
          targetProducts = cell.subCellsB.products || [];
        } else {
          return res.status(400).json({
            success: false,
            error: "Invalid subCell value, must be 'subCellsA' or 'subCellsB'",
          });
        }
      } else {
        if (cell.divisionType === "dual") {
          return res.status(400).json({
            success: false,
            error: "Cannot assign products to a dual-divided cell directly; specify subCell instead",
          });
        }
        targetStatus = cell.status;
        targetProducts = cell.products || [];
      }

      // ตรวจสอบว่า Cell หรือ subCell พร้อมรับสินค้าหรือไม่ (status ต้องเป็น 1)
      if (targetStatus !== 1) {
        return res.status(400).json({
          success: false,
          error: `Selected cell or subCell ${cellId}${effectiveSubCell ? `-${effectiveSubCell}` : ''} is not available (status must be 1)`,
        });
      }

      // ตรวจสอบ productId ซ้ำและรวม quantity
      const existingProduct = targetProducts.find(p => p.product.productId === item.product.productId);
      if (existingProduct) {
        existingProduct.quantity += item.quantity;
      } else {
        // เพิ่มสินค้าลงใน targetProducts ด้วยโครงสร้างใหม่
        targetProducts.push({
          product: {
            productId: item.product.productId,
            type: item.product.type,
            name: item.product.name,
            image: item.product.image || null,
          },
          quantity: item.quantity,
          endDate: endDate,
          inDate: inDate,
        });
      }

      // บันทึกสินค้าลงใน Cell หรือ subCell โดยไม่เปลี่ยน status
      if (effectiveSubCell === "subCellsA") {
        cell.subCellsA.products = targetProducts;
      } else if (effectiveSubCell === "subCellsB") {
        cell.subCellsB.products = targetProducts;
      } else {
        cell.products = targetProducts;
      }

      // Debug log
      console.log(`Assigned product ${productId} to Cell ${cellId}${effectiveSubCell ? `-${effectiveSubCell}` : ''}`);

      // เก็บผลลัพธ์สำหรับสินค้านี้
      assignmentResults.push({
        product: {
          productId: item.product.productId,
          type: item.product.type,
          name: item.product.name,
          image: item.product.image || null,
        },
        quantity: item.quantity,
        endDate: endDate.toISOString().split("T")[0], // แปลงเป็น "YYYY-MM-DD"
        inDate: inDate.toISOString().split("T")[0], // เพิ่ม inDate ในผลลัพธ์
      });
    }

    // บันทึกการเปลี่ยนแปลงทั้งหมดใน Cell
    await Promise.all([...cellsToUpdate.values()].map(async (cell) => {
      console.log(`Before saving Cell ${cell.cellId}:`, cell.products);
      await cell.save();
      console.log(`After saving Cell ${cell.cellId}:`, (await Cell.findOne({ cellId: cell.cellId })).products);
    }));

    res.status(200).json({
      success: true,
      message: "Products assigned to cells successfully",
      data: assignmentResults,
    });
  } catch (error) {
    console.error("Failed to assign products from bill:", error);
    res.status(500).json({ success: false, error: "Failed to assign products", details: error.message });
  }
});

// Route: ดึงข้อมูลสรุป
router.get("/summary", async (req, res) => {
  try {
    const singleOrNullActiveBoxes = await Cell.countDocuments({ divisionType: { $in: [null, "single"] }, status: 1 });
    const singleOrNullInactiveBoxes = await Cell.countDocuments({ divisionType: { $in: [null, "single"] }, status: 2 });
    const singleOrNullDisabledBoxes = await Cell.countDocuments({ divisionType: { $in: [null, "single"] }, status: 3 });
    const singleOrNullNullBoxes = await Cell.countDocuments({ divisionType: { $in: [null, "single"] }, status: 0 });

    const activeSubCellsA = await Cell.countDocuments({ divisionType: "dual", "subCellsA.status": 1 });
    const inactiveSubCellsA = await Cell.countDocuments({ divisionType: "dual", "subCellsA.status": 2 });
    const disabledSubCellsA = await Cell.countDocuments({ divisionType: "dual", "subCellsA.status": 3 });
    const nullSubCellsA = await Cell.countDocuments({ divisionType: "dual", "subCellsA.status": 0 });

    const activeSubCellsB = await Cell.countDocuments({ divisionType: "dual", "subCellsB.status": 1 });
    const inactiveSubCellsB = await Cell.countDocuments({ divisionType: "dual", "subCellsB.status": 2 });
    const disabledSubCellsB = await Cell.countDocuments({ divisionType: "dual", "subCellsB.status": 3 });
    const nullSubCellsB = await Cell.countDocuments({ divisionType: "dual", "subCellsB.status": 0 });

    // คำนวณ Total Boxes เป็นผลรวมของ status 1, 2, 3 เท่านั้น
    const totalBoxes = singleOrNullActiveBoxes + singleOrNullInactiveBoxes + singleOrNullDisabledBoxes +
                       activeSubCellsA + inactiveSubCellsA + disabledSubCellsA +
                       activeSubCellsB + inactiveSubCellsB + disabledSubCellsB;

    // คำนวณ emptyBoxes (เดิมคือ nullBoxes) เป็นเซลล์ที่มี status: 0
    const emptyBoxes = singleOrNullNullBoxes + nullSubCellsA + nullSubCellsB;

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
        lastUpdate: formattedLastUpdate // ใช้ lastUpdate แทน Lastupdate
      },
    });
  } catch (error) {
    console.error("Failed to fetch cell summary:", error);
    res.status(500).json({ success: false, error: "Failed to fetch cell summary" });
  }
});

export default router;