import express from 'express';
import dotenv from 'dotenv';
import { protect, isAdmin } from '../middleware/auth.js';
import Cell from "../model/Cell.js"; 
import ImpostPdf from "../model/ImportPdf.js";
import { ImportBill } from "../model/Bill.js"; // ใช้ ImportBill แทน Manage
import ImportExportList from "../model/ImportExportList.js";

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


// Route: ย้ายสินค้าจาก Cell หนึ่งไปยังอีก Cell หนึ่ง (รองรับหลายรายการและ subCell)
router.post("/move-product", protect, validateMoveProduct, async (req, res) => {
  try {
    const moves = req.validatedMoves;

    const moveResults = [];
    const cellsToUpdate = new Map();

    for (const { sourceCellId, targetCellId, productId, quantity } of moves) {
      // แยก sourceCellId เพื่อตรวจสอบว่าเป็น subCell หรือไม่
      const [sourceMainCellId, sourceSubCellPart] = sourceCellId.split('-').length > 2 
        ? [sourceCellId.split('-').slice(0, 2).join('-'), sourceCellId.split('-')[2]] 
        : [sourceCellId, null];

      // แยก targetCellId เพื่อตรวจสอบว่าเป็น subCell หรือไม่
      const [targetMainCellId, targetSubCellPart] = targetCellId.split('-').length > 2 
        ? [targetCellId.split('-').slice(0, 2).join('-'), targetCellId.split('-')[2]] 
        : [targetCellId, null];

      // ดึงข้อมูล Cell ต้นทางและปลายทาง
      let sourceCell = cellsToUpdate.get(sourceMainCellId) || (await Cell.findOne({ cellId: sourceMainCellId }));
      let targetCell = cellsToUpdate.get(targetMainCellId) || (await Cell.findOne({ cellId: targetMainCellId }));

      // ตรวจสอบว่า Cell ต้นทางและปลายทางมีอยู่หรือไม่
      if (!sourceCell) {
        return res.status(404).json({ success: false, error: `Source cell ${sourceMainCellId} not found` });
      }
      if (!targetCell) {
        return res.status(404).json({ success: false, error: `Target cell ${targetMainCellId} not found` });
      }

      cellsToUpdate.set(sourceMainCellId, sourceCell);
      cellsToUpdate.set(targetMainCellId, targetCell);

      // ตัวแปรสำหรับ source
      let sourceProducts;
      let sourceStatus;

      // ตรวจสอบว่า sourceCellId เป็น subCell หรือ Cell หลัก
      if (sourceSubCellPart) {
        if (sourceCell.divisionType !== "dual") {
          return res.status(400).json({
            success: false,
            error: `Source cell ${sourceMainCellId} is not a dual-divided cell, cannot use subCell ${sourceCellId}`,
          });
        }

        if (sourceSubCellPart === "A") {
          sourceStatus = sourceCell.subCellsA.status;
          sourceProducts = sourceCell.subCellsA.products || [];
        } else if (sourceSubCellPart === "B") {
          sourceStatus = sourceCell.subCellsB.status;
          sourceProducts = sourceCell.subCellsB.products || [];
        } else {
          return res.status(400).json({
            success: false,
            error: `Invalid subCell part in ${sourceCellId}, must be 'A' or 'B'`,
          });
        }
      } else {
        if (sourceCell.divisionType === "dual") {
          return res.status(400).json({
            success: false,
            error: `Cannot move products from a dual-divided cell ${sourceCellId} directly; specify subCell (e.g., ${sourceCellId}-A)`,
          });
        }
        sourceStatus = sourceCell.status;
        sourceProducts = sourceCell.products || [];
      }

      // ตัวแปรสำหรับ target
      let targetProducts;
      let targetStatus;

      // ตรวจสอบว่า targetCellId เป็น subCell หรือ Cell หลัก
      if (targetSubCellPart) {
        if (targetCell.divisionType !== "dual") {
          return res.status(400).json({
            success: false,
            error: `Target cell ${targetMainCellId} is not a dual-divided cell, cannot use subCell ${targetCellId}`,
          });
        }

        if (targetSubCellPart === "A") {
          targetStatus = targetCell.subCellsA.status;
          targetProducts = targetCell.subCellsA.products || [];
        } else if (targetSubCellPart === "B") {
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

      // ค้นหาสินค้าใน sourceProducts
      const sourceProductIndex = sourceProducts.findIndex(p => p.product.productId === productId);
      if (sourceProductIndex === -1) {
        return res.status(404).json({
          success: false,
          error: `Product ${productId} not found in source cell ${sourceCellId}`,
        });
      }

      const sourceProduct = sourceProducts[sourceProductIndex];

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
        sourceProducts.splice(sourceProductIndex, 1);
      }

      // อัปเดต sourceProducts กลับไปที่ Cell หรือ subCell
      if (sourceSubCellPart === "A") {
        sourceCell.subCellsA.products = sourceProducts;
      } else if (sourceSubCellPart === "B") {
        sourceCell.subCellsB.products = sourceProducts;
      } else {
        sourceCell.products = sourceProducts;
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
      if (targetSubCellPart === "A") {
        targetCell.subCellsA.products = targetProducts;
      } else if (targetSubCellPart === "B") {
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

    // ตรวจสอบว่า req.user.employeeId มีค่าหรือไม่
    if (!req.user.employeeId) {
      console.error("req.user.employeeId is missing:", req.user);
      return res.status(400).json({
        success: false,
        error: "Employee ID is missing in user data",
      });
    }

    // ดึงข้อมูลจาก ImportBill
    const billRecord = await ImportBill.findOne({ billNumber });
    if (!billRecord) {
      return res.status(404).json({ success: false, error: "Bill not found" });
    }

    // ตรวจสอบสถานะของบิล
    if (billRecord.type !== "pending") {
      return res.status(400).json({
        success: false,
        error: `Bill ${billNumber} is not in 'pending' status. Current status: ${billRecord.type}`,
      });
    }

    // ดึง items จาก billRecord
    const items = billRecord.items;
    if (!items || items.length === 0) {
      return res.status(400).json({ success: false, error: "No items found in the bill" });
    }

    // คำนวณจำนวนสินค้าที่นำเข้า (inCount)
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

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
      const item = items.find((i) => i.product.productId === productId);
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
        assignedBy: req.user.employeeId, // เพิ่ม employeeId ของผู้ที่ทำการ assign
      };

      // เพิ่มสินค้าใน array ที่เหมาะสม
      const existingProduct = targetProductsArray.find((p) => p.product.productId === productId);
      if (existingProduct) {
        existingProduct.quantity += Number(quantity);
      } else {
        targetProductsArray.push(productData);
      }

      // บันทึกการเปลี่ยนแปลงใน Cell
      await cell.save();

      // เก็บผลลัพธ์
      assignmentResults.push({
        cellId,
        productId,
        quantity,
        subCell: subCell || null,
        assignedBy: req.user.employeeId, // เพิ่ม employeeId ในผลลัพธ์
      });
    }

    // เปลี่ยน type ของบิลเป็น "in" และบันทึก employeeId ใน ImportBill
    billRecord.type = "in";
    billRecord.employeeId = req.user.employeeId; // เพิ่ม employeeId จาก req.user
    console.log("Saving employeeId to ImportBill:", req.user.employeeId); // Debug
    await billRecord.save();

    // อัปเดต ImpostPdf เพื่อบันทึก employeeId
    let impostPdf = await ImpostPdf.findOne({ billNumber });
    if (!impostPdf) {
      return res.status(404).json({
        success: false,
        error: `ImpostPdf for bill ${billNumber} not found`,
      });
    }

    // อัปเดต employeeId ใน ImpostPdf
    impostPdf.employeeId = req.user.employeeId;
    console.log("Saving employeeId to ImpostPdf:", req.user.employeeId); // Debug
    await impostPdf.save();

    // บันทึกข้อมูลลง ImportExportList
    const today = new Date();
    today.setHours(0, 0, 0, 0); // ตั้งค่าให้เป็นวันที่ไม่มีเวลา

    // ค้นหา record ของวันนี้
    let record = await ImportExportList.findOne({ date: today });
    if (!record) {
      // ถ้าไม่พบ ให้สร้าง record ใหม่
      record = new ImportExportList({
        date: today,
        inCount: totalQuantity,
        outCount: 0,
      });
    } else {
      // ถ้าพบ ให้เพิ่ม inCount
      record.inCount += totalQuantity;
    }
    await record.save();

    res.status(200).json({
      success: true,
      message: "Products assigned successfully",
      data: {
        billNumber: billRecord.billNumber,
        type: billRecord.type,
        employeeId: billRecord.employeeId, // เพิ่ม employeeId ใน response
        assignmentResults,
      },
    });
  } catch (error) {
    console.error("Failed to assign products from bill:", error);
    res.status(500).json({
      success: false,
      error: "Failed to assign products",
      details: error.message,
    });
  }
});

// เส้นทาง: ดึงข้อมูล Impost PDFs (ไม่ตรวจสอบการล็อกอิน)
router.get("/impostpdfs", async (req, res) => {
  try {
    // ดึงข้อมูล ImpostPdf ทั้งหมดพร้อมข้อมูล employeeId จาก User
    const impostPdfs = await ImpostPdf.find({})
      .populate({
        path: "user",
        select: "employeeId firstName lastName", // เลือกเฉพาะฟิลด์ที่ต้องการ
      })
      .lean();

    if (impostPdfs.length === 0) {
      return res.status(200).json({
        success: true,
        message: "ยังไม่มี PDF ใด ๆ ในระบบ",
        data: [],
      });
    }

    const pdfData = await Promise.all(
      impostPdfs.map(async (pdf) => {
        const bill = await ImportBill.findOne({ billNumber: pdf.billNumber }).lean();

        if (!bill) {
          return {
            billNumber: pdf.billNumber,
            importDate: null,
            importTime: null,
            items: [],
            pdfUrl: pdf.pdfUrl,
            employeeId: pdf.employeeId || pdf.user?.employeeId || "ไม่ระบุ", // ดึงจาก pdf.employeeId ก่อน
            createdBy: pdf.user
              ? `${pdf.user.firstName || "ไม่ระบุ"} ${pdf.user.lastName || "ไม่ระบุ"}`
              : undefined,
            type: null,
          };
        }

        const createdAt = new Date(bill.createdAt);
        const importDate = createdAt.toLocaleDateString("th-TH", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        const importTime = createdAt.toLocaleTimeString("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        });

        const groupedItems = bill.items.reduce((map, item) => {
          const productId = item.product.productId;
          const existing = map.get(productId);
          if (existing) {
            existing.quantity += item.quantity;
          } else {
            map.set(productId, { name: item.product.name, quantity: item.quantity });
          }
          return map;
        }, new Map());

        const itemsList = Array.from(groupedItems.values()).map(
          (item) => `${item.name} [${item.quantity}]`
        );

        return {
          billNumber: pdf.billNumber,
          importDate,
          importTime,
          items: itemsList,
          pdfUrl: pdf.pdfUrl,
          employeeId: pdf.employeeId || bill.employeeId || pdf.user?.employeeId || "ไม่ระบุ", // ดึงจาก pdf.employeeId, bill.employeeId, แล้วค่อย pdf.user?.employeeId
          createdBy: pdf.user
            ? `${pdf.user.firstName || "ไม่ระบุ"} ${pdf.user.lastName || "ไม่ระบุ"}`
            : undefined,
          type: bill.type || null,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "ดึงข้อมูล PDF สำเร็จ",
      data: pdfData,
    });
  } catch (error) {
    console.error("Error in GET /impostpdfs route:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูล PDF",
      details: error.message,
    });
  }
});

export default router;