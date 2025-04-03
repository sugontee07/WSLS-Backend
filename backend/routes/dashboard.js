import express from "express";
import { protect } from "../middleware/auth.js";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js";
import dotenv from "dotenv";
import ImportExportList from "../model/ImportExportList.js"; // แก้ไขเส้นทางให้ถูกต้อง

dotenv.config();

const router = express.Router();

// API: ดึงข้อมูลสินค้าเข้าและออก (สามารถกรองตามสถานะได้)
router.get("/latest-items", protect, async (req, res) => {
  try {
    // รับ query parameter "status" เพื่อกรองข้อมูล (in หรือ out)
    const { status } = req.query;

    // ดึงข้อมูลใบนำเข้าสินค้า (ImportBill) เฉพาะ type: "in"
    const importBills = await ImportBill.find({ type: "in" })
      .sort({ createdAt: -1 })
      .limit(5);

    // ดึงข้อมูลใบส่งออกสินค้า (ExportBill) เฉพาะ type: "out"
    const exportBills = await ExportBill.find({ type: "out" })
      .sort({ createdAt: -1 })
      .limit(5);

    // แปลงข้อมูล ImportBill โดยแยกแต่ละ item ออกมาเป็นแถว
    const importOrders = importBills.flatMap((bill) =>
      bill.items.map((item) => ({
        trackingNo: item.product.productId || "N/A",
        productName: item.product.name || "Unknown",
        status: "in",
        amount: item.quantity,
        createdAt: bill.createdAt,
      }))
    );

    // แปลงข้อมูล ExportBill โดยแยกแต่ละ item ออกมาเป็นแถว
    const exportOrders = exportBills.flatMap((bill) =>
      bill.items.map((item) => ({
        trackingNo: item.product.productId || "N/A",
        productName: item.product.name || "Unknown",
        status: "out",
        amount: item.quantity,
        createdAt: bill.createdAt,
      }))
    );

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
      })),
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

// API: ดึงข้อมูลสินค้าเข้าและออกต่อวัน
router.get("/daily-items", protect, async (req, res) => {
  try {
    const { date } = req.query;

    let targetDate;
    if (date) {
      targetDate = new Date(date);
      if (isNaN(targetDate)) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Please use YYYY-MM-DD",
        });
      }
    } else {
      targetDate = new Date();
    }

    targetDate.setHours(0, 0, 0, 0);

    let record = await ImportExportList.findOne({ date: targetDate }).lean();

    if (!record) {
      record = {
        date: targetDate,
        inCount: 0,
        outCount: 0,
      };
    }

    res.status(200).json({
      success: true,
      data: {
        inCount: record.inCount,
        outCount: record.outCount,
      },
    });
  } catch (error) {
    console.error("เกิดข้อผิดพลาดใน GET /daily-items:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูลสินค้าเข้าและออก",
      details: error.message,
    });
  }
});

export default router;