//billRoutes.js 
import express from "express";
import mongoose from "mongoose";
import Bill from "../model/Bill.js";
import Product from "../model/Product.js";
import { protect, isAdmin } from "../middleware/auth.js";

const router = express.Router();

// Middleware สำหรับตรวจสอบข้อมูล Bill
const validateBill = async (req, res, next) => {
  if (!req.body) {
    return res.status(400).json({ success: false, error: "Request body is missing" });
  }

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "Items must be a non-empty array" });
  }

  for (const item of items) {
    if (!item.productId || !item.quantity || !item.endDate) {
      return res.status(400).json({ success: false, error: "Each item must have productId, quantity, and endDate" });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(item.endDate)) {
      return res.status(400).json({
        success: false,
        error: "endDate must be in format YYYY-MM-DD",
      });
    }

    const endDateObj = new Date(item.endDate);
    if (isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        error: "endDate is not a valid date",
      });
    }

    if (typeof item.quantity !== "number" || item.quantity < 1) {
      return res.status(400).json({ success: false, error: "Quantity must be a number greater than 0" });
    }

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
    const { items } = req.body;

    const updatedItems = [];
    for (const item of items) {
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
          type: product.type, // เพิ่ม type
          image: product.image || "",
        },
        quantity: item.quantity,
        endDate: item.endDate,
      });
    }

    console.log("Updated Items:", JSON.stringify(updatedItems, null, 2));

    const newBill = new Bill({
      items: updatedItems,
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
            type: item.product.type,
            name: item.product.name,
            image: item.product.image || null,
          },
          quantity: item.quantity,
          endDate: item.endDate,
        })),
        totalItems: bill.totalItems,
        inDate: bill.inDate,
      })),
    });
  } catch (error) {
    console.error("Failed to fetch bills:", error);
    res.status(500).json({ success: false, error: "Failed to fetch bills", details: error.message });
  }
});

// Route: ดึงข้อมูลบิลตาม billNumber
router.get("/buillNumber/:billNumber", protect, async (req, res) => {
  try {
    const billNumber = req.params.billNumber;
    if (!billNumber || typeof billNumber !== "string") {
      return res.status(400).json({
        success: false,
        error: "Invalid bill number: billNumber must be a non-empty string",
      });
    }
    const bill = await Bill.findOne({ billNumber });
    if (!bill) {
      return res.status(404).json({
        success: false,
        error: `Bill not found with billNumber: ${billNumber}`,
      });
    }
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

export default router;