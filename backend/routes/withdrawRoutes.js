import express from "express";
import path from "path";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import PdfMake from "pdfmake";
import jwt from "jsonwebtoken";
import Cell from "../model/Cell.js";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js";
import { User } from "../model/User.js";
import ExportPdf from "../model/ExportPdf.js"; // โมเดล ExportPdf
import ImportExportList from "../model/ImportExportList.js";

// หา __dirname ใน ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// กำหนดฟอนต์สำหรับ pdfmake
const fonts = {
  THSarabunNew: {
    normal: path.join(__dirname, "../THSarabunNew/THSarabunNew.ttf"),
    bold: path.join(__dirname, "../THSarabunNew/THSarabunNew Bold.ttf"),
    italics: path.join(__dirname, "../THSarabunNew/THSarabunNew Italic.ttf"),
    bolditalics: path.join(__dirname, "../THSarabunNew/THSarabunNew BoldItalic.ttf"),
  },
};

// สร้าง instance ของ pdfmake พร้อมฟอนต์
const printer = new PdfMake(fonts);

const router = express.Router();

// ฟังก์ชัน protect
export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select("-password");
      next();
    } catch (error) {
      console.error("ไม่สามารถตรวจสอบ token ได้:", error);
      res.status(401).json({ success: false, error: "ไม่ได้รับอนุญาต" });
    }
  }
  if (!token) {
    res.status(401).json({ success: false, error: "ไม่ได้รับอนุญาต ไม่มี token" });
  }
};

// ฟังก์ชัน generatePDF
const generatePDF = async (billNumber, user) => {
  const bill = await ExportBill.findOne({ billNumber });
  if (!bill) {
    throw new Error(`ไม่พบบิลที่มีเลขที่ ${billNumber}`);
  }

  const groupedItems = new Map();
  bill.items.forEach((item) => {
    const productId = item.product.productId;
    if (groupedItems.has(productId)) {
      const existing = groupedItems.get(productId);
      existing.quantity += item.quantity;
    } else {
      groupedItems.set(productId, {
        name: item.product.name,
        quantity: item.quantity,
      });
    }
  });

  const tableBody = [
    [
      { text: "รหัสสินค้า", style: "tableHeader", alignment: "center" },
      { text: "รายการสินค้า", style: "tableHeader", alignment: "center" },
      { text: "จำนวน", style: "tableHeader", alignment: "center" },
    ],
  ];

  groupedItems.forEach((item, productId) => {
    tableBody.push([
      { text: productId, alignment: "center" },
      { text: item.name, alignment: "center" },
      { text: item.quantity.toString(), alignment: "center" },
    ]);
  });

  const withdrawDate = bill.createdAt.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const withdrawTime = bill.createdAt.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const requesterName = `${user.firstName || "ไม่ระบุ"} ${user.lastName || "ไม่ระบุ"}`;
  const employeeId = user.employeeId || "ไม่ระบุ";
  const department = user.department || "ไม่ระบุ";

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 60, 40, 60],
    defaultStyle: {
      font: "THSarabunNew",
      fontSize: 14,
    },
    content: [
      { text: "J.I.B.", style: "header", alignment: "center" },
      { text: "ใบเบิกสินค้า", style: "subheader", alignment: "center" },
      { text: "", margin: [0, 10] },
      {
        columns: [
          [
            { text: "สาขา: สำนักงานใหญ่", style: "info" },
            { text: "เรื่อง: เบิกสินทรัพย์", style: "info" },
          ],
          [
            { text: `เลขที่: ${billNumber}`, style: "info", alignment: "right" },
            { text: `วันที่เบิกสินค้า: ${withdrawDate}`, style: "info", alignment: "right" },
            { text: `เวลาเบิกสินค้า: ${withdrawTime} น.`, style: "info", alignment: "right" },
          ],
        ],
      },
      { text: "", margin: [0, 10] },
      {
        columns: [
          [
            { text: `รหัสพนักงาน: ${employeeId}`, style: "info" },
            { text: `แผนก: ${department}`, style: "info" },
            { text: `ผู้ขอเบิก: ${requesterName}`, style: "info" },
          ],
        ],
        margin: [0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: [100, "*", 100],
          body: tableBody,
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
        },
      },
      {
        columns: [
          { text: "ผู้อนุมัติ .......................................", alignment: "left" },
          { text: "ผู้เบิก .......................................", alignment: "right" },
        ],
        absolutePosition: { x: 40, y: 700 },
      },
      {
        columns: [
          { text: "วันที่ ......./........./........", alignment: "left" },
          { text: "วันที่ ......./........./........", alignment: "right" },
        ],
        absolutePosition: { x: 40, y: 720 },
      },
    ],
    styles: {
      header: { fontSize: 20, bold: true },
      subheader: { fontSize: 16, bold: true },
      info: { fontSize: 14 },
      tableHeader: { bold: true, fontSize: 14, fillColor: "#eeeeee" },
    },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  const chunks = [];

  return new Promise((resolve, reject) => {
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const uploadPath = path.join(__dirname, "../uploads/exports");
      const timestamp = Date.now();
      const fileName = `bill-${billNumber}-${timestamp}.pdf`;
      const fullPath = path.join(uploadPath, fileName);

      try {
        await fs.mkdir(uploadPath, { recursive: true });
        await fs.writeFile(fullPath, pdfBuffer);
        console.log(`PDF saved to ${fullPath}`);
        const pdfUrl = `/uploads/exports/${fileName}`;
        resolve(pdfUrl);
      } catch (error) {
        reject(error);
      }
    });
    pdfDoc.end();
  });
};

router.get("/exportpdfs", async (req, res) => {
  try {
    // ดึงข้อมูล PDF ทั้งหมดพร้อมข้อมูล employeeId จาก User
    const exportPDFs = await ExportPdf.find({})
      .populate({
        path: "createdBy",
        select: "employeeId firstName lastName", // เลือกเฉพาะฟิลด์ที่ต้องการ
      })
      .lean();

    if (exportPDFs.length === 0) {
      return res.status(200).json({
        success: true,
        message: "ยังไม่มี PDF ใด ๆ ในระบบ",
        data: [],
      });
    }

    // ดึงข้อมูลเพิ่มเติมจาก ExportBill และจัดรูปแบบ
    const pdfData = await Promise.all(
      exportPDFs.map(async (pdf) => {
        const bill = await ExportBill.findOne({ billNumber: pdf.billNumber }).lean();

        if (!bill) {
          return {
            billNumber: pdf.billNumber,
            withdrawDate: null,
            withdrawTime: null,
            items: [],
            pdfUrl: pdf.pdfUrl,
            employeeId: pdf.createdBy?.employeeId || "ไม่ระบุ", // เพิ่ม employeeId
            createdBy: pdf.createdBy
              ? `${pdf.createdBy.firstName || "ไม่ระบุ"} ${pdf.createdBy.lastName || "ไม่ระบุ"}`
              : "ไม่ระบุ",
            type: null,
          };
        }

        const createdAt = new Date(bill.createdAt);
        const withdrawDate = createdAt.toLocaleDateString("th-TH", {
          day: "2-digit",
          month: "long",
          year: "numeric",
        });
        const withdrawTime = createdAt.toLocaleTimeString("th-TH", {
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
          withdrawDate,
          withdrawTime,
          items: itemsList,
          pdfUrl: pdf.pdfUrl,
          employeeId: pdf.createdBy?.employeeId || "ไม่ระบุ", // เพิ่ม employeeId
          createdBy: pdf.createdBy
            ? `${pdf.createdBy.firstName || "ไม่ระบุ"} ${pdf.createdBy.lastName || "ไม่ระบุ"}`
            : "ไม่ระบุ",
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
    console.error("Error in GET /exportpdfs route:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการดึงข้อมูล PDF",
      details: error.message,
    });
  }
});

// API เบิกสินค้าออกจาก Cell และเด้งไปหน้า PDF
router.post("/withdraw", protect, async (req, res) => {
  try {
    const { withdrawals } = req.body;
    const withdrawResults = [];
    const billItems = [];
    const billDate = new Date();

    const withdrawDate = new Date().toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const withdrawTime = new Date().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    if (!withdrawals || !Array.isArray(withdrawals) || withdrawals.length === 0) {
      return res.status(400).json({
        success: false,
        message: "กรุณาระบุข้อมูลการเบิกสินค้า (withdrawals) เป็น array",
      });
    }

    // ตรวจสอบข้อมูลผู้ใช้
    if (!req.user || !req.user._id) {
      return res.status(400).json({
        success: false,
        error: "ไม่พบข้อมูลผู้ใช้งานในคำขอ",
      });
    }

    const user = await User.findById(req.user._id).select("employeeId firstName lastName department");
    if (!user) {
      return res.status(404).json({
        success: false,
        error: "ไม่พบข้อมูลผู้ใช้งานในฐานข้อมูล",
      });
    }

    // ตรวจสอบว่า user มี employeeId หรือไม่
    if (!user.employeeId) {
      return res.status(400).json({
        success: false,
        error: "ผู้ใช้งานไม่มี employeeId",
      });
    }

    // ประมวลผลการเบิกสินค้า
    for (const { cellId, productId, quantity } of withdrawals) {
      // แยก cellId เพื่อตรวจสอบว่าเป็น subCell หรือไม่
      let baseCellId = cellId;
      let subCell = null;

      if (cellId.endsWith("-A")) {
        baseCellId = cellId.slice(0, -2); // เช่น "A-02-A" -> "A-02"
        subCell = "subCellsA";
      } else if (cellId.endsWith("-B")) {
        baseCellId = cellId.slice(0, -2); // เช่น "A-02-B" -> "A-02"
        subCell = "subCellsB";
      }

      // ดึงข้อมูล Cell
      const cell = await Cell.findOne({ cellId: baseCellId });
      if (!cell) {
        return res.status(404).json({
          success: false,
          message: `ไม่พบ Cell ที่มีรหัส ${baseCellId}`,
        });
      }

      // ตรวจสอบ divisionType และเลือก array products ที่เหมาะสม
      let targetProductsArray = cell.products;
      if (subCell) {
        if (cell.divisionType !== "dual") {
          return res.status(400).json({
            success: false,
            message: `Cell ${baseCellId} ไม่ใช่ dual cell ไม่สามารถเบิกจาก ${subCell} ได้`,
          });
        }
        targetProductsArray = subCell === "subCellsA" ? cell.subCellsA.products : cell.subCellsB.products;
      } else if (cell.divisionType === "dual") {
        return res.status(400).json({
          success: false,
          message: `Cell ${baseCellId} เป็น dual cell กรุณาระบุ subCell (เช่น ${baseCellId}-A หรือ ${baseCellId}-B)`,
        });
      }

      // ค้นหาสินค้าใน array products
      const productIndex = targetProductsArray.findIndex(
        (p) => p.product.productId === productId
      );
      if (productIndex === -1) {
        return res.status(404).json({
          success: false,
          message: `ไม่พบสินค้า ${productId} ใน Cell ${cellId}`,
        });
      }

      const product = targetProductsArray[productIndex];
      if (product.quantity < quantity) {
        return res.status(400).json({
          success: false,
          message: `จำนวนสินค้าใน Cell ${cellId} ไม่เพียงพอ (มี ${product.quantity} ชิ้น)`,
        });
      }

      // อัปเดต quantity
      product.quantity -= quantity;
      if (product.quantity === 0) {
        targetProductsArray.splice(productIndex, 1);
      }

      // เพิ่มข้อมูลใน billItems
      billItems.push({
        cellId: baseCellId,
        subCell, // บันทึก subCell (เช่น "subCellsA" หรือ "subCellsB")
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

      withdrawResults.push({ cellId, productId, quantity });
      await cell.save();
    }

    // คำนวณจำนวนสินค้าที่เบิกออก
    const totalQuantity = withdrawals.reduce((sum, w) => sum + w.quantity, 0);

    // สร้างบิลการเบิกสินค้า
    const billNumber = await generateUniqueBillNumber();
    const newBill = new ExportBill({
      billNumber,
      items: billItems,
      type: "out",
      createdAt: billDate,
      createdBy: req.user._id,
      employeeId: user.employeeId,
    });
    await newBill.save();

    // บันทึกข้อมูลลง ImportExportList
    const today = new Date();
    today.setHours(0, 0, 0, 0); // ตั้งค่าให้เป็นวันที่ไม่มีเวลา

    // ค้นหา record ของวันนี้
    let record = await ImportExportList.findOne({ date: today });
    if (!record) {
      // ถ้าไม่พบ ให้สร้าง record ใหม่
      record = new ImportExportList({
        date: today,
        inCount: 0,
        outCount: totalQuantity,
      });
    } else {
      // ถ้าพบ ให้เพิ่ม outCount
      record.outCount += totalQuantity;
    }
    await record.save();

    // สร้าง PDF และบันทึก URL
    const pdfUrl = await generatePDF(billNumber, user);
    const exportPdf = new ExportPdf({
      billNumber,
      pdfUrl,
      createdBy: req.user._id,
      employeeId: user.employeeId,
    });
    await exportPdf.save();

    // ส่ง response พร้อม URL ของ PDF
    res.status(200).json({
      success: true,
      message: "เบิกสินค้าและสร้าง PDF เรียบร้อย",
      data: {
        billNumber,
        withdrawResults,
        employeeId: user.employeeId,
        pdfUrl,
      },
    });
  } catch (error) {
    console.error("Error in /withdraw route:", error);
    res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในการเบิกสินค้า",
      details: error.message,
    });
  }
});

export default router;