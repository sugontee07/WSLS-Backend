import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import pdfkit from "pdfkit";
import mongoose from "mongoose";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js"; 
import Cell from "../model/Cell.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();
const printer = pdfkit;

// ฟังก์ชันสำหรับแก้ไขปัญหา __dirname ใน ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware สำหรับตรวจสอบข้อมูลการเบิกสินค้า
const validateWithdrawProduct = async (req, res, next) => {
  console.log("Validating withdrawals:", req.body); // Debug
  if (!req.body) {
    return res.status(400).json({ success: false, error: "Request body is missing" });
  }

  const { withdrawals } = req.body;

  if (!withdrawals || !Array.isArray(withdrawals) || withdrawals.length === 0) {
    return res.status(400).json({ success: false, error: "Withdrawals must be a non-empty array" });
  }

  for (const withdrawal of withdrawals) {
    const { cellId, productId, quantity } = withdrawal;

    if (!cellId || !productId || !quantity) {
      return res.status(400).json({
        success: false,
        error: "Each withdrawal must have cellId, productId, and quantity",
      });
    }

    if (typeof quantity !== "number" || quantity < 1) {
      return res.status(400).json({
        success: false,
        error: "Quantity must be a number greater than 0",
      });
    }

    const cell = await Cell.findOne({ cellId });
    if (!cell) {
      return res.status(404).json({
        success: false,
        error: `Cell not found with cellId: ${cellId}`,
      });
    }
  }

  req.validatedWithdrawals = withdrawals;
  next();
};

// Route: เบิกสินค้า
router.post("/withdraw", protect, validateWithdrawProduct, async (req, res) => {
  try {
    console.log("Processing /withdraw request:", req.body); // Debug log
    const withdrawals = req.validatedWithdrawals;

    const withdrawResults = [];
    const cellsToUpdate = new Map();
    const billItems = [];

    const billDate = new Date();

    // วนลูปเพื่อจัดการการเบิกสินค้า
    for (const { cellId, productId, quantity } of withdrawals) {
      console.log(`Processing withdrawal: cellId=${cellId}, productId=${productId}, quantity=${quantity}`); // Debug log

      const [mainCellId, subCellPart] =
        cellId.split("-").length > 2
          ? [cellId.split("-").slice(0, 2).join("-"), cellId.split("-")[2]]
          : [cellId, null];

      let cell = cellsToUpdate.get(mainCellId) || (await Cell.findOne({ cellId: mainCellId }));
      if (!cell) {
        console.log(`Cell not found: ${mainCellId}`); // Debug log
        return res.status(404).json({ success: false, error: `ไม่พบ Cell ${mainCellId}` });
      }

      cellsToUpdate.set(mainCellId, cell);

      let sourceProducts;
      let sourceLocation;

      if (subCellPart) {
        if (cell.divisionType !== "dual") {
          console.log(`Cell ${mainCellId} is not dual, cannot use subCell ${cellId}`); // Debug log
          return res.status(400).json({
            success: false,
            error: `Cell ${mainCellId} ไม่ได้ถูกแบ่งเป็น subCell ไม่สามารถใช้ subCell ${cellId} ได้`,
          });
        }

        if (subCellPart === "A") {
          sourceProducts = cell.subCellsA?.products || [];
          sourceLocation = "subCellsA";
        } else if (subCellPart === "B") {
          sourceProducts = cell.subCellsB?.products || [];
          sourceLocation = "subCellsB";
        } else {
          console.log(`Invalid subCell part in ${cellId}, must be 'A' or 'B'`); // Debug log
          return res.status(400).json({
            success: false,
            error: `ส่วนของ subCell ไม่ถูกต้องใน ${cellId} ต้องเป็น 'A' หรือ 'B'`,
          });
        }
      } else {
        if (cell.divisionType === "dual") {
          console.log(`Cannot withdraw directly from dual cell ${cellId}, specify subCell`); // Debug log
          return res.status(400).json({
            success: false,
            error: `ไม่สามารถเบิกสินค้าจาก Cell ที่ถูกแบ่งเป็น dual ได้โดยตรง ${cellId} ต้องระบุ subCell (เช่น ${cellId}-A)`,
          });
        }
        sourceProducts = cell.products || [];
        sourceLocation = "products";
      }

      // ตรวจสอบว่า sourceProducts เป็นอาร์เรย์
      if (!Array.isArray(sourceProducts)) {
        console.log(`Invalid data: sourceProducts in ${sourceLocation} of Cell ${cellId} is not an array`); // Debug log
        return res.status(500).json({
          success: false,
          error: `ข้อมูลใน Cell ${cellId} ไม่ถูกต้อง: ${sourceLocation}.products ไม่ใช่อาร์เรย์`,
        });
      }

      const product = sourceProducts.find((p) => {
        // ตรวจสอบโครงสร้างของ p และ p.product
        if (!p || !p.product || typeof p.product.productId !== "string") {
          console.log(`Invalid product structure in ${sourceLocation} of Cell ${cellId}:`, p); // Debug log
          return false;
        }
        return p.product.productId === productId;
      });

      if (!product) {
        console.log(`Product ${productId} not found in ${sourceLocation} of Cell ${cellId}`); // Debug log
        return res.status(404).json({
          success: false,
          error: `ไม่พบสินค้า ${productId} ใน Cell ${cellId}`,
        });
      }

      // ตรวจสอบ quantity
      if (typeof product.quantity !== "number") {
        console.log(`Invalid quantity for product ${productId} in Cell ${cellId}: ${product.quantity}`); // Debug log
        return res.status(500).json({
          success: false,
          error: `ข้อมูลใน Cell ${cellId} ไม่ถูกต้อง: จำนวนสินค้าไม่ใช่ตัวเลข`,
        });
      }

      if (product.quantity < quantity) {
        console.log(`Insufficient quantity in Cell ${cellId}: available=${product.quantity}, requested=${quantity}`); // Debug log
        return res.status(400).json({
          success: false,
          error: `จำนวนสินค้าใน Cell ${cellId} ไม่เพียงพอ มี: ${product.quantity}, ต้องการ: ${quantity}`,
        });
      }

      // ตรวจสอบ endDate
      if (!product.endDate || isNaN(new Date(product.endDate).getTime())) {
        console.log(`Product ${productId} in Cell ${cellId} has invalid or missing endDate: ${product.endDate}`); // Debug log
        return res.status(400).json({
          success: false,
          error: `สินค้า ${productId} ใน Cell ${cellId} ไม่มีข้อมูล endDate หรือ endDate ไม่ถูกต้อง`,
        });
      }

      // ตรวจสอบ inDate
      if (!product.inDate || isNaN(new Date(product.inDate).getTime())) {
        console.log(`Product ${productId} in Cell ${cellId} has invalid or missing inDate: ${product.inDate}`); // Debug log
        return res.status(400).json({
          success: false,
          error: `สินค้า ${productId} ใน Cell ${cellId} ไม่มีข้อมูล inDate หรือ inDate ไม่ถูกต้อง`,
        });
      }

      // อัปเดตจำนวนสินค้า
      product.quantity -= quantity;

      if (product.quantity === 0) {
        if (sourceLocation === "products") {
          cell.products = cell.products.filter((p) => p.product.productId !== productId);
        } else if (sourceLocation === "subCellsA") {
          cell.subCellsA.products = cell.subCellsA.products.filter(
            (p) => p.product.productId !== productId
          );
        } else if (sourceLocation === "subCellsB") {
          cell.subCellsB.products = cell.subCellsB.products.filter(
            (p) => p.product.productId !== productId
          );
        }
      }

      billItems.push({
        cellId,
        product: {
          productId: product.product.productId,
          type: product.product.type || "unknown",
          name: product.product.name || "unknown",
          image: product.product.image || "",
          endDate: product.endDate,
          inDate: product.inDate,
        },
        quantity,
        withdrawDate: billDate,
      });

      withdrawResults.push({
        cellId,
        productId,
        quantity,
      });
    }

    // สร้างบิลใหม่
    const billNumber = await generateUniqueBillNumber(); // เพิ่มการสร้าง billNumber
    const newBill = new ExportBill({ // เปลี่ยนจาก Bill เป็น ExportBill
      billNumber, // ใช้ billNumber ที่สร้างจาก generateUniqueBillNumber
      items: billItems,
      type: "out",
    });

    // บันทึกบิลและอัปเดต Cell
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await newBill.save({ session });
      await Promise.all([...cellsToUpdate.values()].map((cell) => cell.save({ session })));
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      console.error("Transaction failed:", error);
      throw error;
    } finally {
      session.endSession();
    }

    console.log(`Withdrawal successful: billNumber=${newBill.billNumber}`); // Debug log

    // ส่งผลลัพธ์กลับ
    res.status(200).json({
      success: true,
      message: "เบิกสินค้าสำเร็จ",
      data: {
        bill: {
          billNumber: newBill.billNumber,
          billDate: billDate.toISOString().split("T")[0],
          items: newBill.items,
          type: newBill.type,
        },
        withdrawals: withdrawResults,
      },
    });
  } catch (error) {
    console.error("Error in /withdraw route:", error); // Log the error
    res.status(500).json({
      success: false,
      error: "ไม่สามารถเบิกสินค้าได้",
      details: error.message,
    });
  }
});

export default router;