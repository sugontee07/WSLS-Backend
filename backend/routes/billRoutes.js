import express from "express";
import { ImportBill, ExportBill, generateUniqueBillNumber } from "../model/Bill.js";
import Product from "../model/Product.js";
import { protect, isAdmin } from "../middleware/auth.js";
import { fileURLToPath } from 'url';
import path from 'path';
import PdfMake from 'pdfmake';
import fs from 'fs/promises';
import bwipjs from 'bwip-js';
import ImpostPdf from "../model/ImpostPdf.js";

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
      bcid: 'code128',
      text: text,
      scale: 2,
      height: 10,
      includetext: false,
    });
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error('Error generating barcode:', error);
    throw error;
  }
};

// ฟังก์ชันสร้าง PDF
const generatePDF = async (billNumber, items, user) => {
  if (!user || !user._id) {
    throw new Error("ไม่พบข้อมูลผู้ใช้สำหรับสร้าง PDF");
  }

  const barcodeImage = await generateBarcode(billNumber);

  const tableBody = [
    [
      { text: "รหัสสินค้า", style: "tableHeader", alignment: "center" },
      { text: "รายการสินค้า", style: "tableHeader", alignment: "center" },
      { text: "จำนวน", style: "tableHeader", alignment: "center" },
      { text: "วันหมดอายุ", style: "tableHeader", alignment: "center" },
    ],
    ...items.map(item => [
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
      },
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

        // บันทึกข้อมูล PDF ลงฐานข้อมูล
        const pdfRecord = new ImpostPdf({
          billNumber,
          pdfUrl,
          userId: user._id
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

// Middleware validateBill
const validateBill = async (req, res, next) => {
  if (!req.body) {
    return res.status(400).json({ success: false, error: "ไม่พบข้อมูลในคำขอ" });
  }

  const { items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: "รายการสินค้าต้องเป็นอาร์เรย์และไม่ว่างเปล่า" });
  }

  for (const item of items) {
    if (!item.productId || !item.quantity || !item.endDate) {
      return res.status(400).json({ success: false, error: "แต่ละรายการต้องมี productId, quantity และ endDate" });
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(item.endDate)) {
      return res.status(400).json({
        success: false,
        error: "endDate ต้องอยู่ในรูปแบบ YYYY-MM-DD",
      });
    }

    const endDateObj = new Date(item.endDate);
    if (isNaN(endDateObj.getTime())) {
      return res.status(400).json({
        success: false,
        error: "endDate ไม่ใช่วันที่ที่ถูกต้อง",
      });
    }

    if (typeof item.quantity !== "number" || item.quantity < 1) {
      return res.status(400).json({ success: false, error: "จำนวนต้องเป็นตัวเลขและมากกว่า 0" });
    }

    const productExists = await Product.findOne({ productId: item.productId });
    if (!productExists) {
      return res.status(404).json({ success: false, error: `ไม่พบสินค้าที่มี productId: ${item.productId}` });
    }
  }

  next();
};

// เส้นทาง: ดึงข้อมูล Impost PDFs ของผู้ใช้ที่ล็อกอิน
router.get("/impostpdfs", protect, async (req, res) => {
  try {
    // ตรวจสอบว่ามี req.user หรือไม่
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        error: "ไม่ได้รับอนุญาต",
      });
    }

    // ดึงข้อมูล Impost PDFs ที่สร้างโดยผู้ใช้ที่ล็อกอิน
    const impostPdfs = await ImpostPdf.find({ userId: req.user._id }).lean();

    // ตรวจสอบว่ามี Impost PDFs หรือไม่
    if (impostPdfs.length === 0) {
      return res.status(200).json({
        success: true,
        message: "คุณยังไม่เคยนำเข้าสินค้าหรือสร้าง PDF",
        data: [],
      });
    }

    // ดึงข้อมูลเพิ่มเติมจาก ImportBill และจัดรูปแบบ
    const pdfData = await Promise.all(
      impostPdfs.map(async (pdf) => {
        // ดึงข้อมูลใบเบิกที่ตรงกับ billNumber ของ PDF
        const bill = await ImportBill.findOne({ billNumber: pdf.billNumber }).lean();

        if (!bill) {
          // กรณีไม่พบ bill ที่สัมพันธ์กับ PDF
          return {
            billNumber: pdf.billNumber,
            importDate: null,
            importTime: null,
            items: [],
            pdfUrl: pdf.pdfUrl,
            type: null,
          };
        }

        // แปลงวันที่และเวลา
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

        // จัดกลุ่มรายการสินค้า
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
          type: bill.type || null,
        };
      })
    );

    // กรองเฉพาะบิลที่มี type: "in" และเรียงลำดับตามวันที่
    const filteredData = pdfData
      .filter(item => item.type === "in")
      .sort((a, b) => {
        const dateA = a.importDate && a.importTime ? new Date(`${a.importDate} ${a.importTime}`) : new Date(0);
        const dateB = b.importDate && b.importTime ? new Date(`${b.importDate} ${b.importTime}`) : new Date(0);
        return dateB - dateA; // เรียงจากล่าสุดไปเก่าสุด
      });

    res.status(200).json({
      success: true,
      message: "ดึงข้อมูล PDF ของผู้ใช้สำเร็จ",
      data: filteredData,
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

// เส้นทาง: สร้างบิลใหม่ (ปรับปรุงให้มี PDF)
router.post("/create", protect, validateBill, async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, error: "ไม่พบข้อมูลผู้ใช้" });
    }

    const { items } = req.body;

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
      type: "in",
    });

    await newBill.save();

    // สร้าง PDF
    const pdfUrl = await generatePDF(billNumber, updatedItems, req.user);

    res.status(201).json({
      success: true,
      data: {
        billNumber: newBill.billNumber,
        items: newBill.items.map(item => ({
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
        pdfUrl: pdfUrl
      },
    });
  } catch (error) {
    console.error("ไม่สามารถสร้างบิลได้:", error);
    res.status(500).json({ success: false, error: "ไม่สามารถสร้างบิลได้", details: error.message });
  }
});


// เส้นทาง: ดึงข้อมูลบิลทั้งหมด (เพิ่ม pdfUrl)
router.get("/allBills", async (req, res) => {
  try {
    const importBills = await ImportBill.find();
    const exportBills = await ExportBill.find();
    const bills = [...importBills, ...exportBills];

    // ดึงข้อมูล PDF ที่เกี่ยวข้อง
    const pdfs = await ImpostPdf.find({ billNumber: { $in: bills.map(b => b.billNumber) } });

    res.status(200).json({
      success: true,
      data: bills.map(bill => {
        const pdf = pdfs.find(p => p.billNumber === bill.billNumber);
        return {
          billNumber: bill.billNumber,
          items: bill.items.map(item => ({
            cellId: item.cellId || null,
            product: {
              productId: item.product.productId,
              type: item.product.type,
              name: item.product.name,
              image: item.product.image || null,
              endDate: item.product.endDate,
              inDate: item.product.inDate,
            },
            quantity: item.quantity,
            withdrawDate: item.withdrawDate || null,
          })),
          totalItems: bill.totalItems,
          type: bill.type,
          createdAt: bill.createdAt,
          updatedAt: bill.updatedAt,
          pdfUrl: pdf?.pdfUrl || null
        };
      }),
    });
  } catch (error) {
    console.error("ไม่สามารถดึงข้อมูลบิลได้:", error);
    res.status(500).json({ success: false, error: "ไม่สามารถดึงข้อมูลบิลได้", details: error.message });
  }
});

// เส้นทาง: ดึงข้อมูลบิลตาม billNumber (เพิ่ม pdfUrl)
router.get("/billNumber/:billNumber", protect, async (req, res) => {
  try {
    const billNumber = req.params.billNumber;
    if (!billNumber || typeof billNumber !== "string") {
      return res.status(400).json({
        success: false,
        error: "เลขบิลไม่ถูกต้อง: billNumber ต้องเป็นสตริงและไม่ว่างเปล่า",
      });
    }

    const bill = await ImportBill.findOne({ billNumber });
    if (!bill) {
      return res.status(404).json({
        success: false,
        error: `ไม่พบบิลที่มี billNumber: ${billNumber}`,
      });
    }

    const pdf = await ImpostPdf.findOne({ billNumber });

    res.status(200).json({
      success: true,
      data: {
        billNumber: bill.billNumber,
        items: bill.items.map(item => ({
          cellId: item.cellId || null,
          product: {
            productId: item.product.productId,
            name: item.product.name,
            type: item.product.type,
            image: item.product.image || null,
            endDate: item.product.endDate,
            inDate: item.product.inDate,
          },
          quantity: item.quantity,
          withdrawDate: item.withdrawDate || null,
        })),
        totalItems: bill.totalItems,
        type: bill.type,
        createdAt: bill.createdAt,
        updatedAt: bill.updatedAt,
        pdfUrl: pdf?.pdfUrl || null
      },
    });
  } catch (error) {
    console.error("ไม่สามารถดึงข้อมูลบิลได้:", error);
    res.status(500).json({ success: false, error: "ไม่สามารถดึงข้อมูลบิลได้", details: error.message });
  }
});

export default router;