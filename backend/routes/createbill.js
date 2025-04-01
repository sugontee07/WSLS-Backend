import express from "express";
import Product from "../model/Product.js";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js";
import { fileURLToPath } from "url";
import path from "path";
import PdfMake from "pdfmake";
import fs from "fs/promises";
import bwipjs from "bwip-js";
import ImpostPdf from "../model/ImpostPdf.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

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

const printer = new PdfMake(fonts);

// ฟังก์ชันสร้างบาร์โค้ด
const generateBarcode = async (text) => {
  try {
    const buffer = await bwipjs.toBuffer({
      bcid: "code128",
      text: text,
      scale: 2,
      height: 10,
      includetext: false,
    });
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error("Error generating barcode:", error);
    throw error;
  }
};

// ฟังก์ชันสร้าง PDF (ไม่ใช้ข้อมูล user)
const generatePDF = async (billNumber, items) => {
  const barcodeImage = await generateBarcode(billNumber);

  const tableBody = [
    [
      { text: "รหัสสินค้า", style: "tableHeader", alignment: "center" },
      { text: "รายการสินค้า", style: "tableHeader", alignment: "center" },
      { text: "จำนวน", style: "tableHeader", alignment: "center" },
      { text: "วันหมดอายุ", style: "tableHeader", alignment: "center" },
    ],
    ...items.map((item) => [
      { text: item.product.productId, alignment: "center" },
      { text: item.product.name, alignment: "center" },
      { text: item.quantity.toString(), alignment: "center" },
      { text: item.product.endDate.toLocaleDateString("th-TH"), alignment: "center" },
    ]),
  ];

  const inDate = new Date().toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  const docDefinition = {
    pageSize: "A4",
    pageMargins: [40, 60, 40, 60],
    defaultStyle: {
      font: "THSarabunNew",
      fontSize: 14,
    },
    content: [
      { image: barcodeImage, width: 100, absolutePosition: { x: 450, y: 20 } },
      { text: "J.I.B.", style: "header", alignment: "center" },
      { text: "ใบนำเข้าสินค้า", style: "subheader", alignment: "center" },
      { text: "", margin: [0, 10] },
      {
        columns: [
          [
            { text: "สาขา: สำนักงานใหญ่", style: "info" },
            { text: "เรื่อง: นำเข้าสินทรัพย์", style: "info" },
          ],
          [
            { text: `เลขที่: ${billNumber}`, style: "info", alignment: "right" },
            { text: `วันที่นำเข้า: ${inDate}`, style: "info", alignment: "right" },
          ],
        ],
      },
      { text: "", margin: [0, 10] },
      {
        table: {
          headerRows: 1,
          widths: [100, "*", 80, 100],
          body: tableBody,
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => "#000000",
          vLineColor: () => "#000000",
        },
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

  return new Promise(async (resolve, reject) => {
    pdfDoc.on("data", (chunk) => chunks.push(chunk));
    pdfDoc.on("end", async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const uploadPath = path.join(__dirname, "../uploads/imports");
      const timestamp = Date.now();
      const fileName = `import-bill-${billNumber}-${timestamp}.pdf`;
      const fullPath = path.join(uploadPath, fileName);

      try {
        await fs.mkdir(uploadPath, { recursive: true });
        await fs.writeFile(fullPath, pdfBuffer);
        const pdfUrl = `/uploads/imports/${fileName}`;

        // บันทึกข้อมูล PDF ลงฐานข้อมูล (ไม่มี userId)
        const pdfRecord = new ImpostPdf({
          billNumber,
          pdfUrl,
        });
        await pdfRecord.save();

        resolve(pdfUrl);
      } catch (error) {
        reject(error);
      }
    });
    pdfDoc.end();
  });
};

// เส้นทาง: สร้างบิลใหม่ (ไม่ตรวจสอบการล็อกอิน)
router.post("/create", async (req, res) => {
  try {
    const { items, type } = req.body;

    // ตรวจสอบว่า items ถูกส่งมาหรือไม่
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: "ต้องระบุ items และต้องเป็น array ที่ไม่ว่าง",
      });
    }

    // ตรวจสอบโครงสร้างของแต่ละ item
    for (const item of items) {
      if (!item.productId || typeof item.productId !== "string") {
        return res.status(400).json({ success: false, error: "ต้องระบุ productId และต้องเป็น string" });
      }
      if (!item.quantity || typeof item.quantity !== "number" || item.quantity < 1) {
        return res.status(400).json({ success: false, error: "ต้องระบุ quantity และต้องเป็นตัวเลขที่มากกว่า 0" });
      }
      if (!item.endDate || isNaN(new Date(item.endDate).getTime())) {
        return res.status(400).json({ success: false, error: "ต้องระบุ endDate และต้องเป็นวันที่ที่ถูกต้อง" });
      }
    }

    const updatedItems = [];
    for (const item of items) {
      const product = await Product.findOne({ productId: item.productId });
      if (!product) {
        return res.status(404).json({
          success: false,
          error: `ไม่พบสินค้าที่มี ID ${item.productId}`,
        });
      }

      updatedItems.push({
        product: {
          productId: item.productId,
          name: product.name,
          type: product.type,
          image: product.image || "",
          endDate: new Date(item.endDate),
          inDate: new Date(),
        },
        quantity: item.quantity,
      });
    }

    const billNumber = await generateUniqueBillNumber();

    const newBill = new ImportBill({
      billNumber,
      items: updatedItems,
      type: type || "pending",
    });

    await newBill.save();

    // สร้าง PDF หลังจากบันทึกบิลสำเร็จ (ไม่ส่ง user)
    const pdfUrl = await generatePDF(billNumber, updatedItems);

    res.status(201).json({
      success: true,
      data: {
        billNumber: newBill.billNumber,
        items: newBill.items.map((item) => ({
          product: {
            productId: item.product.productId,
            name: item.product.name,
            type: item.product.type,
            image: item.product.image,
            endDate: item.product.endDate,
            inDate: item.product.inDate,
          },
          quantity: item.quantity,
        })),
        totalItems: newBill.totalItems,
        type: newBill.type,
        createdAt: newBill.createdAt,
        updatedAt: newBill.updatedAt,
        pdfUrl: pdfUrl,
      },
    });
  } catch (error) {
    console.error("ไม่สามารถสร้างบิลได้:", error);
    res.status(500).json({ success: false, error: "ไม่สามารถสร้างบิลได้", details: error.message });
  }
});

export default router;