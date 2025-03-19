//cellRoutes.js
import express from "express";
import mongoose from "mongoose";
import dotenv from 'dotenv';  

dotenv.config();

const router = express.Router();

// Schema สำหรับ Cell
const cellSchema = new mongoose.Schema({
  cellId: { type: String, required: true, unique: true },
  col: { type: String, required: true },
  row: { type: String, required: true },
  status: { type: Number, enum: [0, 1, 2, 3], default: 0 },
  divisionType: { type: String, enum: [null, "single", "dual"], default: null },
  subCellsA: {
    status: { type: Number, enum: [0, 1, 2, 3], default: 0 },
    products: { type: [mongoose.Schema.Types.ObjectId], ref: "Product", default: [] },
    label: { type: String, default: function() { return this.cellId + "R1"; } },
  },
  subCellsB: {
    status: { type: Number, enum: [0, 1, 2, 3], default: 0 },
    products: { type: [mongoose.Schema.Types.ObjectId], ref: "Product", default: [] },
    label: { type: String, default: function() { return this.cellId + "R2"; } },
  },
}, { timestamps: true });

// ตรวจสอบและกำหนดค่าเริ่มต้นให้ subCells ก่อนบันทึก
cellSchema.pre('save', function(next) {
  if (!this.subCellsA || typeof this.subCellsA.status === 'undefined') {
    this.subCellsA = { status: 0, products: [], label: this.cellId + "R1" };
  }
  if (!this.subCellsB || typeof this.subCellsB.status === 'undefined') {
    this.subCellsB = { status: 0, products: [], label: this.cellId + "R2" };
  }
  this.subCellsA.status = Number(this.subCellsA.status);
  this.subCellsB.status = Number(this.subCellsB.status);
  next();
});

const Cell = mongoose.model("Cell", cellSchema);

// Migration script เพื่ออัปเดตข้อมูลเก่า
async function migrateOldCells() {
  const cells = await Cell.find();
  for (const cell of cells) {
    if (cell.status === null || cell.status === undefined) {
      cell.status = 0;
    }

    if (!cell.subCellsA || !cell.subCellsB || !cell.divisionType) {
      cell.divisionType = cell.divisionType || null;
      cell.subCellsA = { status: 0, products: [], label: cell.cellId + "R1" };
      cell.subCellsB = { status: 0, products: [], label: cell.cellId + "R2" };
    } else {
      if (cell.subCellsA.status === null || cell.subCellsA.status === undefined) {
        cell.subCellsA.status = 0;
      }
      if (cell.subCellsB.status === null || cell.subCellsB.status === undefined) {
        cell.subCellsB.status = 0;
      }
    }

    await cell.save();
  }
}

migrateOldCells().catch(console.error);

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

    if (cell.divisionType !== null) {
      return res.status(400).json({ success: false, error: "Cell is already divided" });
    }

    const Product = mongoose.model("Product"); // อ้างอิง Product model จาก mongoose
    const productsInCell = await Product.find({ "location.cellId": cell._id });
    if (productsInCell.length > 0) {
      return res.status(400).json({ success: false, error: "Cannot divide cell with existing products" });
    }

    cell.divisionType = "dual";
    cell.status = 0;

    if (subCellChoice === "both") {
      cell.subCellsA.status = 1;
      cell.subCellsB.status = 1;
    } else {
      cell.subCellsA.status = Number(subCellChoice === "R1" ? 1 : 0);
      cell.subCellsB.status = Number(subCellChoice === "R2" ? 1 : 0);
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
router.put("/update-status", validateStatusUpdate, async (req, res) => {
  try {
    const { cellId, status, divisionType } = req.body;

    const isSubCell = cellId.includes("-A") || cellId.includes("-B");
    let cell;

    const Product = mongoose.model("Product"); // อ้างอิง Product model จาก mongoose

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
          await Product.deleteMany({
            _id: { $in: [...subCellAProducts, ...subCellBProducts] },
          });
        }

        cell.divisionType = "single";
        cell.status = 0;
        cell.subCellsA = { status: 0, products: [], label: `${mainCellId}R1` };
        cell.subCellsB = { status: 0, products: [], label: `${mainCellId}R2` };
      } else {
        if (cellId.endsWith("-A")) {
          if (status === 0) {
            const productIds = cell.subCellsA.products || [];
            if (productIds.length > 0) {
              await Product.deleteMany({ _id: { $in: productIds } });
              cell.subCellsA.products = [];
            }
          }
          cell.subCellsA.status = status;
        } else if (cellId.endsWith("-B")) {
          if (status === 0) {
            const productIds = cell.subCellsB.products || [];
            if (productIds.length > 0) {
              await Product.deleteMany({ _id: { $in: productIds } });
              cell.subCellsB.products = [];
            }
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
        const products = await Product.find({ "location.cellId": cell._id });
        if (products.length > 0) {
          await Product.deleteMany({ "location.cellId": cell._id });
        }
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
    const cells = await Cell.find(query);
    res.status(200).json({ success: true, data: cells });
  } catch (error) {
    console.error("Failed to fetch cells:", error);
    res.status(500).json({ success: false, error: "Failed to fetch cells" });
  }
});

/// Route: ดึงข้อมูลสรุป
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