//productRoutes.js 
import express from "express";
import mongoose from "mongoose";
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();


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
    cellId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Cell" },
    subCell: { type: String, enum: ["A", "B"], default: null },
  },
  status: { type: Number, enum: [0, 1, 2, 3], default: 2 },
}, { timestamps: true });

const Product = mongoose.model("Product", productSchema);

// Middleware สำหรับตรวจสอบข้อมูล Product และ Cell
const validateAddProduct = async (req, res, next) => {
  const { productId, type, name, inDate, endDate, quantity, image, location } = req.body;

  if (!productId || !type || !name || !inDate || !endDate || !quantity || !location || !location.cellId) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    return res.status(400).json({ success: false, error: "Quantity must be a positive integer" });
  }

  // ตรวจสอบและแปลงรูปแบบวันที่
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(inDate) || !dateRegex.test(endDate)) {
    return res.status(400).json({
      success: false,
      error: "inDate and endDate must be in YYYY-MM-DD format (e.g., 2025-03-13)",
    });
  }

  // ตรวจสอบว่าเป็นวันที่ที่ถูกต้อง
  const inDateObj = new Date(inDate);
  const endDateObj = new Date(endDate);
  if (isNaN(inDateObj.getTime()) || isNaN(endDateObj.getTime())) {
    return res.status(400).json({
      success: false,
      error: "inDate or endDate is not a valid date",
    });
  }

  const Cell = mongoose.model("Cell"); // อ้างอิง Cell model จาก mongoose
  const cell = await Cell.findOne({ cellId: location.cellId });
  if (!cell) {
    return res.status(404).json({ success: false, error: "Cell not found" });
  }

  if (cell.divisionType === "dual") {
    if (!location.subCell || !["A", "B"].includes(location.subCell)) {
      return res.status(400).json({
        success: false,
        error: "subCell must be specified as 'A' or 'B' for a dual-divided cell",
      });
    }
    const subCellStatus = location.subCell === "A" ? cell.subCellsA.status : cell.subCellsB.status;
    if (subCellStatus !== 1) {
      return res.status(400).json({
        success: false,
        error: `SubCell ${location.subCell} is not available (status: ${subCellStatus})`,
      });
    }
  } else {
    if (location.subCell) {
      return res.status(400).json({
        success: false,
        error: "Cannot specify subCell for a non-dual cell",
      });
    }
    if (cell.status !== 1) {
      return res.status(400).json({
        success: false,
        error: `Cell is not available (status: ${cell.status})`,
      });
    }
  }

  req.validatedData = { productId, type, name, inDate, endDate, quantity, image, location, cell, cellObjectId: cell._id };
  next();
};

// Route: เพิ่ม Product และเลือก Cell
router.post("/add-product", validateAddProduct, async (req, res) => {
  try {
    const { productId, type, name, inDate, endDate, quantity, image, location, cell, cellObjectId } = req.validatedData;

    // ตรวจสอบว่ามี Product เดิมที่มี productId เดียวกันในตำแหน่งเดียวกันหรือไม่
    const existingProduct = await Product.findOne({ productId, "location.cellId": cellObjectId, "location.subCell": location.subCell || null });
    if (existingProduct) {
      // อัปเดต quantity ของ Product เดิม
      existingProduct.quantity += quantity;
      await existingProduct.save();

      await existingProduct.populate({
        path: "location.cellId",
        select: "cellId",
      });

      return res.status(200).json({
        success: true,
        data: {
          productId: existingProduct.productId,
          type: existingProduct.type,
          name: existingProduct.name,
          quantity: existingProduct.quantity,
          location: {
            cellId: existingProduct.location.cellId ? existingProduct.location.cellId.cellId : null,
            subCell: existingProduct.location.subCell || null,
          },
        },
      });
    }

    // สร้าง Product ใหม่ถ้าไม่มี
    const newProduct = new Product({
      productId,
      type,
      name,
      inDate,
      endDate,
      quantity,
      image,
      location: {
        cellId: cellObjectId,
        subCell: location.subCell || null,
      },
      status: 2,
    });

    // เพิ่ม Product ใน subCell หรือ Cell หลัก
    if (cell.divisionType === "dual") {
      if (location.subCell === "A") {
        cell.subCellsA.products.push(newProduct._id);
      } else if (location.subCell === "B") {
        cell.subCellsB.products.push(newProduct._id);
      }
    } else {
      // ไม่ต้องทำอะไรเพิ่มสำหรับ non-dual cell เพราะไม่มี subCell
    }

    await newProduct.save();
    await cell.save();

    await newProduct.populate({
      path: "location.cellId",
      select: "cellId",
    });

    res.status(201).json({
      success: true,
      data: {
        productId: newProduct.productId,
        type: newProduct.type,
        name: newProduct.name,
        quantity: newProduct.quantity,
        location: {
          cellId: newProduct.location.cellId ? newProduct.location.cellId.cellId : null,
          subCell: newProduct.location.subCell || null,
        },
      },
    });
  } catch (error) {
    console.error("Failed to add product:", error);
    res.status(500).json({ success: false, error: "Failed to add product", details: error.message });
  }
});

// Route: ดึงข้อมูล Products ทั้งหมด
router.get("/products", async (req, res) => {
  try {
    const products = await Product.find().populate({
      path: "location.cellId",
      select: "cellId",
    });

    const formattedProducts = products.map(product => {
      const location = {
        cellId: product.location.cellId ? product.location.cellId.cellId : null,
        subCell: product.location.subCell || null,
      };
      return {
        ...product._doc,
        location,
      };
    });

    res.status(200).json({ success: true, data: formattedProducts });
  } catch (error) {
    console.error("Failed to fetch products:", error);
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

export default router;