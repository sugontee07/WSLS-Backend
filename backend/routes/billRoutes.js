import express from "express";
import mongoose from "mongoose";
import Bill from "../model/Bill.js";
import Product from "../model/Product.js";
import { protect, isAdmin } from "../middleware/auth.js";

const router = express.Router();

// Middleware สำหรับตรวจสอบข้อมูล Bill
const validateBill = async (req, res, next) => {
  // ตรวจสอบว่า req.body มีอยู่
  if (!req.body) {
    return res.status(400).json({ success: false, error: "Request body is missing" });
  }

  const { items, endDate } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "Items must be a non-empty array" });
  }

  if (!endDate) {
    return res.status(400).json({
      success: false,
      error: "endDate is required",
    });
  }

  // ตรวจสอบรูปแบบวันที่ของ endDate
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(endDate)) {
    return res.status(400).json({
      success: false,
      error: "endDate must be in format YYYY-MM-DD",
    });
  }

  // ตรวจสอบว่า endDate เป็นวันที่ที่ถูกต้อง
  const endDateObj = new Date(endDate);
  if (isNaN(endDateObj.getTime())) {
    return res.status(400).json({
      success: false,
      error: "endDate is not a valid date",
    });
  }

  for (const item of items) {
    // ตรวจสอบว่าแต่ละ item มี productId และ quantity
    if (!item.productId || !item.quantity) {
      return res.status(400).json({ success: false, error: "Each item must have productId and quantity" });
    }

    // ตรวจสอบว่า quantity เป็นตัวเลขและมากกว่า 0
    if (typeof item.quantity !== "number" || item.quantity < 1) {
      return res.status(400).json({ success: false, error: "Quantity must be a number greater than 0" });
    }

    // ตรวจสอบว่า product มีอยู่ในตาราง Products โดยใช้ productId
    const productExists = await Product.findOne({ productId: item.productId });
    if (!productExists) {
      return res.status(404).json({ success: false, error: `Product not found with productId: ${item.productId}` });
    }
  }

  next();
};

// Route: สร้างบิลใหม่
router.post("/create", validateBill, async (req, res) => {
  try {
    const { items, endDate } = req.body;

    // ตรวจสอบข้อมูล items และดึงข้อมูลจาก Product
    const updatedItems = [];
    for (const item of items) {
      // ดึงข้อมูลสินค้าจาก Product collection โดยใช้ productId
      const product = await Product.findOne({ productId: item.productId });
      if (!product) {
        return res.status(404).json({
          success: false,
          error: `Product with ID ${item.productId} not found`,
        });
      }

      updatedItems.push({
        product: {
          productId: item.productId,
          name: product.name,
          image: product.image || "",
        },
        quantity: item.quantity,
      });
    }

    const newBill = new Bill({
      items: updatedItems,
      endDate,
    });

    await newBill.save();

    res.status(201).json({
      success: true,
      data: newBill,
    });
  } catch (error) {
    console.error("Failed to create bill:", error);
    res.status(500).json({ success: false, error: "Failed to create bill", details: error.message });
  }
});

// Route: ดึงข้อมูลบิลตาม billNumber
router.get("/allBills/:billNumber", protect, async (req, res) => {
  try {
    const billNumber = req.params.billNumber;

    // ตรวจสอบว่า billNumber เป็น string และไม่ว่างเปล่า
    if (!billNumber || typeof billNumber !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid bill number: billNumber must be a non-empty string",
      });
    }

    // ค้นหาบิลโดยใช้ billNumber
    const bill = await Bill.findOne({ billNumber });

    if (!bill) {
      return res.status(404).json({
        success: false,
        error: `Bill not found with billNumber: ${billNumber}`,
      });
    }

    // ส่งข้อมูลบิลกลับในรูปแบบที่ต้องการ
    res.status(200).json({
      success: true,
      data: {
        billNumber: bill.billNumber,
        items: bill.items.map(item => ({
          product: {
            productId: item.product.productId,
            name: item.product.name,
            image: item.product.image || null,
          },
          quantity: item.quantity,
        })),
        totalItems: bill.totalItems,
        inDate: bill.inDate,
        endDate: bill.endDate,
      },
    });
  } catch (error) {
    console.error("Failed to fetch bill:", error);
    res.status(500).json({ success: false, error: "Failed to fetch bill", details: error.message });
  }
});

// Route: ดึงข้อมูลบิลทั้งหมด
router.get("/allBills", async (req, res) => {
  try {
    const bills = await Bill.find();
    res.status(200).json({
      success: true,
      data: bills.map(bill => ({
        billNumber: bill.billNumber,
        items: bill.items.map(item => ({
          product: {
            productId: item.product.productId,
            name: item.product.name,
            image: item.product.image || null,
          },
          quantity: item.quantity,
        })),
        totalItems: bill.totalItems,
        inDate: bill.inDate,
        endDate: bill.endDate,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch bills:", error);
    res.status(500).json({ success: false, error: "Failed to fetch bills", details: error.message });
  }
});

// Route: ดึงข้อมูลบิลตาม billNumber
router.get("/:billNumber", protect, async (req, res) => {
  try {
    const billNumber = req.params.billNumber;

    // ตรวจสอบว่า billNumber เป็น string และไม่ว่างเปล่า
    if (!billNumber || typeof billNumber !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid bill number: billNumber must be a non-empty string",
      });
    }

    // ค้นหาบิลโดยใช้ billNumber
    const bill = await Bill.findOne({ billNumber });

    if (!bill) {
      return res.status(404).json({
        success: false,
        error: `Bill not found with billNumber: ${billNumber}`,
      });
    }

    // ส่งข้อมูลบิลกลับในรูปแบบที่ต้องการ
    res.status(200).json({
      success: true,
      data: {
        _id: bill._id,
        billNumber: bill.billNumber,
        items: bill.items.map(item => ({
          product: {
            productId: item.product.productId,
            name: item.product.name,
            image: item.product.image || null,
          },
          quantity: item.quantity,
        })),
        totalItems: bill.totalItems,
        inDate: bill.inDate,
        endDate: bill.endDate,
      },
    });
  } catch (error) {
    console.error("Failed to fetch bill:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch bill",
      details: error.message,
    });
  }
});

export default router;