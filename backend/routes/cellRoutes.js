import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// ตรวจสอบการเชื่อมต่อ MongoDB
mongoose.connection.on("connected", () => {
  console.log("MongoDB connected successfully");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected");
});

// Schema สำหรับ Cell (ไม่มี subCells)
const cellSchema = new mongoose.Schema({
  cellId: { type: String, required: true, unique: true }, // รหัสเซลล์ เช่น A-01
  col: { type: String, required: true }, // แกน X (เช่น A, B, C)
  row: { type: String, required: true }, // แกน Y (เช่น 01, 02, 03)
  status: { type: Number, enum: [0, 1, 2, 3], default: 0 }, // สถานะ: 0=ไม่ใช้งาน, 1=เปิดใช้งาน, 2=ปิดใช้งาน, 3=รีเซ็ตเซลล์
}, { timestamps: true });

const Cell = mongoose.model("Cell", cellSchema);

// Schema สำหรับ Product
const productSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  type: { type: String, required: true },
  name: { type: String, required: true },
  inDate: { type: String, required: true },
  endDate: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0 },
  image: { type: String },
  location: {
    cellId: { type: String, required: true, ref: "Cell" },
  },
  status: { type: Number, enum: [0, 1, 2, 3], default: 1 },
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);

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

// Middleware สำหรับตรวจสอบข้อมูล Product
const validateProductData = (req, res, next) => {
  const { productId, type, name, inDate, endDate, quantity, image, location, status } = req.body;
  if (!productId || !type || !name || !inDate || !endDate || quantity === undefined) {
    return res.status(400).json({ success: false, error: "Missing required product fields" });
  }
  if (quantity < 0) {
    return res.status(400).json({ success: false, error: "Quantity cannot be negative" });
  }
  if (status !== undefined && ![0, 1, 2, 3].includes(status)) {
    return res.status(400).json({ success: false, error: "Invalid status value, must be 0, 1, 2, or 3" });
  }
  if (!location || !location.cellId) {
    return res.status(400).json({ success: false, error: "Missing location details: cellId is required" });
  }
  req.validatedData = { productId, type, name, inDate, endDate, quantity, image, location, status };
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
      },
    });
  } catch (error) {
    console.error("Failed to create cell:", error);
    res.status(500).json({ success: false, error: "Failed to create cell", details: error.message });
  }
});

// Route: อัปเดตสถานะของ Cell
router.put("/update-status", validateStatusUpdate, async (req, res) => {
  try {
    const { cellId, status } = req.validatedData;
    const cell = await Cell.findOne({ cellId });
    if (!cell) {
      return res.status(404).json({ success: false, error: "Cell not found" });
    }
    console.log(req, res);
    cell.status = status;
    await cell.save();
    res.status(200).json({
      success: true,
      data: {
        cellId: cell.cellId,
        col: cell.col,
        row: cell.row,
        status: cell.status,
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

// Route: ดึงข้อมูล Products ทั้งหมด
router.get("/products", async (req, res) => {
  try {
    const products = await Product.find().populate("location.cellId");
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error("Failed to fetch products:", error);
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

// Route: ดึงเซลล์ที่ว่าง (สำหรับ dropdown)
router.get("/cells/available", async (req, res) => {
  try {
    const availableCells = await Cell.find({ status: 1 }); // เฉพาะเซลล์ที่เปิดใช้งาน (status: 1)
    const availableLocations = [];
    for (const cell of availableCells) {
      const productsInCell = await Product.find({ "location.cellId": cell.cellId });
      if (productsInCell.length === 0) {
        availableLocations.push({
          cellId: cell.cellId,
          label: `${cell.col}${cell.row}`,
        });
      }
    }
    res.status(200).json({ success: true, data: availableLocations });
  } catch (error) {
    console.error("Failed to fetch available cells:", error);
    res.status(500).json({ success: false, error: "Failed to fetch available cells" });
  }
});

// Route: ดึงข้อมูลสรุป
router.get("/summary", async (req, res) => {
  try {
    const totalBoxes = await Cell.countDocuments({ status: { $in: [1, 2, 3] } });
    const activeBoxes = await Cell.countDocuments({ status: 1 }); // เปิดใช้งาน
    const inactiveBoxes = await Cell.countDocuments({ status: 2 }); // ปิดใช้งาน
    const disabledBoxes = await Cell.countDocuments({ status: 3 }); // รีเซ็ตเซลล์
    const emptyBoxes = await Cell.countDocuments({ status: 0 }); // ไม่ใช้งาน
    res.status(200).json({
      success: true,
      data: {
        totalBoxes,
        activeBoxes,
        inactiveBoxes,
        disabledBoxes,
        emptyBoxes,
      },
    });
  } catch (error) {
    console.error("Failed to fetch cell summary:", error);
    res.status(500).json({ success: false, error: "Failed to fetch cell summary" });
  }
});

export default router;