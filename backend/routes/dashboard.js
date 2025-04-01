import express from "express";
import { protect } from "../middleware/auth.js";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js";
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// API: ดึงข้อมูลสินค้าเข้าและออก (สามารถกรองตามสถานะได้)
router.get("/latest-items", protect, async (req, res) => {
  try {
    // รับ query parameter "status" เพื่อกรองข้อมูล (in หรือ out)
    const { status } = req.query;

    // ดึงข้อมูลใบนำเข้าสินค้า (ImportBill) เฉพาะ type: "in"
    const importBills = await ImportBill.find({ type: "in" })
      .sort({ createdAt: -1 }) // เรียงลำดับจากล่าสุด
      .limit(5); // จำกัดจำนวน 5 รายการล่าสุด

    // ดึงข้อมูลใบส่งออกสินค้า (ExportBill) เฉพาะ type: "out"
    const exportBills = await ExportBill.find({ type: "out" })
      .sort({ createdAt: -1 }) // เรียงลำดับจากล่าสุด
      .limit(5); // จำกัดจำนวน 5 รายการล่าสุด

    // แปลงข้อมูล ImportBill เป็นรูปแบบที่ต้องการ
    const importOrders = importBills.map((bill) => ({
      trackingNo: bill.billNumber || "N/A",
      productName: bill.items.map((item) => item.product.name).join(", "),
      status: "in", // ใช้ type จาก bill
      amount: bill.items.reduce((sum, item) => sum + item.quantity, 0),
      createdAt: bill.createdAt,
    }));

    // แปลงข้อมูล ExportBill เป็นรูปแบบที่ต้องการ
    const exportOrders = exportBills.map((bill) => ({
      trackingNo: bill.billNumber || "N/A",
      productName: bill.items.map((item) => item.product.name).join(", "),
      status: "out", // ใช้ type จาก bill
      amount: bill.items.reduce((sum, item) => sum + item.quantity, 0),
      createdAt: bill.createdAt,
    }));

    // รวมข้อมูลสินค้าเข้าและออก
    let recentOrders = [...importOrders, ...exportOrders];

    // กรองข้อมูลตามสถานะ (ถ้ามีการระบุ status)
    if (status) {
      const validStatuses = ["in", "out"];
      if (!validStatuses.includes(status.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: `Invalid status: ${status}. Status must be 'in' or 'out'`,
        });
      }
      recentOrders = recentOrders.filter(
        (order) => order.status.toLowerCase() === status.toLowerCase()
      );
      if (recentOrders.length === 0) {
        return res.status(404).json({
          success: false,
          message: `No orders found with status: ${status}`,
        });
      }
    }

    // เรียงลำดับข้อมูลตามวันที่สร้าง (ล่าสุดอยู่บนสุด)
    recentOrders.sort((a, b) => b.createdAt - a.createdAt);

    // จำกัดจำนวน 5 รายการล่าสุดหลังจากรวมและเรียงลำดับ
    const limitedRecentOrders = recentOrders.slice(0, 5);

    // ส่งผลลัพธ์กลับไป
    res.status(200).json({
      success: true,
      data: limitedRecentOrders.map(({ trackingNo, productName, status, amount }) => ({
        trackingNo,
        productName,
        status,
        amount,
      })), // ส่งเฉพาะ field ที่ต้องการให้ตรงกับตาราง
    });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดใน GET /latest-items:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลสินค้าเข้าและออก",
      details: error.message,
    });
  }
});

export default router;