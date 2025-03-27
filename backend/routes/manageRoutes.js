import express from 'express';
import dotenv from 'dotenv';
import { protect, isAdmin } from '../middleware/auth.js';
import Cell from "../model/Cell.js"; 
import { ImportBill } from "../model/Bill.js"; // ใช้ ImportBill แทน Manage

dotenv.config();

const router = express.Router();

// Middleware สำหรับตรวจสอบข้อมูลการย้ายสินค้า (รองรับ array)
const validateMoveProduct = (req, res, next) => {
  const { moves } = req.body;

  // ตรวจสอบว่า moves มีอยู่และเป็น array
  if (!moves || !Array.isArray(moves) || moves.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid 'moves' field: must be a non-empty array",
    });
  }

  // ตรวจสอบแต่ละรายการใน moves
  for (const move of moves) {
    const { sourceCellId, targetCellId, productId, quantity } = move;

    if (!sourceCellId || !targetCellId || !productId || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Each move must include sourceCellId, targetCellId, productId, and quantity",
      });
    }

    if (typeof quantity !== "number" || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be a positive number for each move",
      });
    }
  }

  req.validatedMoves = moves; // ส่งข้อมูลที่ตรวจสอบแล้วไปยัง handler
  next();
};

// Middleware สำหรับตรวจสอบข้อมูลการเบิกสินค้า (รองรับ array)
const validateWithdrawProduct = (req, res, next) => {
  const { withdrawals } = req.body;

  // ตรวจสอบว่า withdrawals มีอยู่และเป็น array
  if (!withdrawals || !Array.isArray(withdrawals) || withdrawals.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Missing or invalid 'withdrawals' field: must be a non-empty array",
    });
  }

  // ตรวจสอบแต่ละรายการใน withdrawals
  for (const withdrawal of withdrawals) {
    const { cellId, productId, quantity } = withdrawal;

    if (!cellId || !productId || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Each withdrawal must include cellId, productId, and quantity",
      });
    }

    if (typeof quantity !== "number" || quantity <= 0) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be a positive number for each withdrawal",
      });
    }
  }

  req.validatedWithdrawals = withdrawals; // ส่งข้อมูลที่ตรวจสอบแล้วไปยัง handler
  next();
};

router.post("/assign-products-from-bill", protect, async (req, res) => {
  try {
    const { billNumber, assignments } = req.body;

    // ตรวจสอบ input
    if (!billNumber || !assignments || !Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: billNumber and assignments (array) are required",
      });
    }

    // ดึงข้อมูลจาก ImportBill
    const billRecord = await ImportBill.findOne({ billNumber });
    if (!billRecord) {
      return res.status(404).json({ success: false, error: "Bill not found" });
    }

    const items = billRecord.items;
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: "No items found in the bill" });
    }

    // เก็บผลลัพธ์การ assign
    const assignmentResults = [];

    for (const assignment of assignments) {
      const { productId, cellId, subCell } = assignment;

      // ตรวจสอบข้อมูล assignment
      if (!productId || !cellId) {
        return res.status(400).json({
          success: false,
          error: "Each assignment must include productId and cellId",
        });
      }

      // ตรวจสอบว่าสินค้าอยู่ในบิลหรือไม่
      const item = items.find(i => i.product.productId === productId);
      if (!item) {
        return res.status(400).json({
          success: false,
          error: `Product with ID ${productId} not found in bill ${billNumber}`,
        });
      }

      // ตรวจสอบ quantity จาก bill
      const quantity = item.quantity;
      if (!quantity || quantity < 1) {
        return res.status(400).json({
          success: false,
          error: `Invalid quantity for product ${productId} in bill ${billNumber}`,
        });
      }

      // ดึงข้อมูล Cell
      let cell = await Cell.findOne({ cellId });
      if (!cell) {
        return res.status(404).json({ success: false, error: `Cell ${cellId} not found` });
      }

      // ตรวจสอบ subCell และ divisionType
      let targetProductsArray = cell.products; // Default: ใช้ products หลัก
      if (subCell) {
        if (!["subCellsA", "subCellsB"].includes(subCell)) {
          return res.status(400).json({
            success: false,
            error: "Invalid subCell value. Must be 'subCellsA' or 'subCellsB'",
          });
        }

        // ตรวจสอบ divisionType
        if (cell.divisionType !== "dual") {
          return res.status(400).json({
            success: false,
            error: `Cell ${cellId} is not a dual cell. Cannot assign to ${subCell}`,
          });
        }

        // กำหนด target array ตาม subCell
        targetProductsArray = subCell === "subCellsA" ? cell.subCellsA.products : cell.subCellsB.products;
      }

      // สร้าง object สินค้าให้สอดคล้องกับ productSchema
      const productData = {
        product: {
          productId: item.product.productId,
          type: item.product.type || "Unknown",
          name: item.product.name || "Unknown",
          image: item.product.image || null,
        },
        quantity: Number(quantity),
        endDate: item.product.endDate || new Date(),
        inDate: item.product.inDate || new Date(),
      };

      // เพิ่มสินค้าใน array ที่เหมาะสม
      const existingProduct = targetProductsArray.find(p => p.product.productId === productId);
      if (existingProduct) {
        existingProduct.quantity += Number(quantity);
      } else {
        targetProductsArray.push(productData);
      }

      // อัปเดตสถานะ Cell หรือ subCell
      if (subCell) {
        if (subCell === "subCellsA" && cell.subCellsA.status === 0) {
          cell.subCellsA.status = 1; // เปลี่ยนสถานะ subCellsA
        } else if (subCell === "subCellsB" && cell.subCellsB.status === 0) {
          cell.subCellsB.status = 1; // เปลี่ยนสถานะ subCellsB
        }
      } else if (cell.status === 0 && cell.products.length > 0) {
        cell.status = 1; // เปลี่ยนสถานะ cell หลัก
      }

      // บันทึกการเปลี่ยนแปลงใน Cell (pre("save") จะจัดการ total และการรวม quantity อัตโนมัติ)
      await cell.save();

      // เก็บผลลัพธ์
      assignmentResults.push({
        cellId,
        productId,
        quantity,
        subCell: subCell || null,
      });
    }

    res.status(200).json({
      success: true,
      message: "Products assigned successfully",
      data: assignmentResults,
    });
  } catch (error) {
    console.error("Failed to assign products from bill:", error);
    res.status(500).json({ success: false, error: "Failed to assign products", details: error.message });
  }
});

// Route: ย้ายสินค้าจาก Cell หนึ่งไปยังอีก Cell หนึ่ง (รองรับหลายรายการและ subCell)
router.post("/move-product", protect, validateMoveProduct, async (req, res) => {
  try {
    const moves = req.validatedMoves;

    const moveResults = [];
    const cellsToUpdate = new Map();

    for (const { sourceCellId, targetCellId, productId, quantity } of moves) {
      // แยก targetCellId เพื่อตรวจสอบว่าเป็น subCell หรือไม่
      const [mainCellId, subCellPart] = targetCellId.split('-').length > 2 
        ? [targetCellId.split('-').slice(0, 2).join('-'), targetCellId.split('-')[2]] 
        : [targetCellId, null];

      // ดึงข้อมูล Cell ต้นทางและปลายทาง
      let sourceCell = cellsToUpdate.get(sourceCellId) || (await Cell.findOne({ cellId: sourceCellId }));
      let targetCell = cellsToUpdate.get(mainCellId) || (await Cell.findOne({ cellId: mainCellId }));

      // ตรวจสอบว่า Cell ต้นทางและปลายทางมีอยู่หรือไม่
      if (!sourceCell) {
        return res.status(404).json({ success: false, error: `Source cell ${sourceCellId} not found` });
      }
      if (!targetCell) {
        return res.status(404).json({ success: false, error: `Target cell ${mainCellId} not found` });
      }

      cellsToUpdate.set(sourceCellId, sourceCell);
      cellsToUpdate.set(mainCellId, targetCell);

      // ตัวแปรสำหรับ target
      let targetProducts;
      let targetStatus;

      // ตรวจสอบว่า targetCellId เป็น subCell หรือ Cell หลัก
      if (subCellPart) {
        if (targetCell.divisionType !== "dual") {
          return res.status(400).json({
            success: false,
            error: `Cell ${mainCellId} is not a dual-divided cell, cannot use subCell ${targetCellId}`,
          });
        }

        if (subCellPart === "A") {
          targetStatus = targetCell.subCellsA.status;
          targetProducts = targetCell.subCellsA.products || [];
        } else if (subCellPart === "B") {
          targetStatus = targetCell.subCellsB.status;
          targetProducts = targetCell.subCellsB.products || [];
        } else {
          return res.status(400).json({
            success: false,
            error: `Invalid subCell part in ${targetCellId}, must be 'A' or 'B'`,
          });
        }
      } else {
        if (targetCell.divisionType === "dual") {
          return res.status(400).json({
            success: false,
            error: `Cannot move products to a dual-divided cell ${targetCellId} directly; specify subCell (e.g., ${targetCellId}-A)`,
          });
        }
        targetStatus = targetCell.status;
        targetProducts = targetCell.products || [];
      }

      // ตรวจสอบว่า Cell หรือ subCell ปลายทางพร้อมรับสินค้าหรือไม่ (status ต้องเป็น 1)
      if (targetStatus !== 1) {
        return res.status(400).json({
          success: false,
          error: `Target ${targetCellId} is not available (status must be 1)`,
        });
      }

      // ค้นหาสินค้าใน Cell ต้นทาง
      let sourceProduct = null;
      let sourceLocation = null;

      if (sourceCell.products && sourceCell.products.length > 0) {
        sourceProduct = sourceCell.products.find(p => p.product.productId === productId);
        if (sourceProduct) sourceLocation = "products";
      }

      if (!sourceProduct && sourceCell.subCellsA && sourceCell.subCellsA.products && sourceCell.subCellsA.products.length > 0) {
        sourceProduct = sourceCell.subCellsA.products.find(p => p.product.productId === productId);
        if (sourceProduct) sourceLocation = "subCellsA";
      }

      if (!sourceProduct && sourceCell.subCellsB && sourceCell.subCellsB.products && sourceCell.subCellsB.products.length > 0) {
        sourceProduct = sourceCell.subCellsB.products.find(p => p.product.productId === productId);
        if (sourceProduct) sourceLocation = "subCellsB";
      }

      if (!sourceProduct) {
        return res.status(404).json({
          success: false,
          error: `Product ${productId} not found in source cell ${sourceCellId}`,
        });
      }

      // ตรวจสอบจำนวนสินค้าที่มีใน Cell ต้นทาง
      if (sourceProduct.quantity < quantity) {
        return res.status(400).json({
          success: false,
          error: `Not enough quantity in source cell ${sourceCellId}. Available: ${sourceProduct.quantity}, Requested: ${quantity}`,
        });
      }

      // ลดจำนวนสินค้าใน Cell ต้นทาง
      sourceProduct.quantity -= quantity;

      if (sourceProduct.quantity === 0) {
        if (sourceLocation === "products") {
          sourceCell.products = sourceCell.products.filter(p => p.product.productId !== productId);
        } else if (sourceLocation === "subCellsA") {
          sourceCell.subCellsA.products = sourceCell.subCellsA.products.filter(p => p.product.productId !== productId);
        } else if (sourceLocation === "subCellsB") {
          sourceCell.subCellsB.products = sourceCell.subCellsB.products.filter(p => p.product.productId !== productId);
        }
      }

      // เพิ่มสินค้าใน Cell หรือ subCell ปลายทาง
      const existingProductInTarget = targetProducts.find(p => p.product.productId === productId);
      if (existingProductInTarget) {
        existingProductInTarget.quantity += quantity;
      } else {
        targetProducts.push({
          product: {
            productId: sourceProduct.product.productId,
            type: sourceProduct.product.type,
            name: sourceProduct.product.name,
            image: sourceProduct.product.image,
          },
          quantity: quantity,
          endDate: sourceProduct.endDate,
          inDate: sourceProduct.inDate,
        });
      }

      // อัปเดต targetProducts กลับไปที่ Cell หรือ subCell
      if (subCellPart === "A") {
        targetCell.subCellsA.products = targetProducts;
      } else if (subCellPart === "B") {
        targetCell.subCellsB.products = targetProducts;
      } else {
        targetCell.products = targetProducts;
      }

      moveResults.push({
        sourceCellId,
        targetCellId,
        productId,
        quantity,
      });
    }

    // บันทึกการเปลี่ยนแปลงทั้งหมดใน Cell
    await Promise.all([...cellsToUpdate.values()].map(cell => cell.save()));

    res.status(200).json({
      success: true,
      message: "Products moved successfully",
      data: moveResults,
    });
  } catch (error) {
    console.error("Failed to move products:", error);
    res.status(500).json({ success: false, error: "Failed to move products", details: error.message });
  }
});

export default router;