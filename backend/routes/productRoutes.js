//productRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import Product from '../model/Product.js'; // แก้ path ให้ถูกต้อง
// import { protect, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ตั้งค่า Multer สำหรับการอัปโหลดรูปภาพ
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join('uploads', 'product');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `product_${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Images only! (jpeg, jpg, png)'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Middleware สำหรับจัดการการอัปโหลดภาพ
const handleImageUpload = (req, res, next) => {
  if (!req.headers['content-type']?.includes('multipart/form-data')) {
    console.log('Not multipart/form-data, skipping image upload');
    req.file = undefined;
    return next();
  }

  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
      console.log('MulterError: Unexpected field');
      req.file = undefined;
      return next();
    }
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      console.log('MulterError: File too large');
      return res.status(400).json({ success: false, error: 'File size exceeds 5MB limit' });
    }
    if (err) {
      console.log('MulterError:', err.message);
      return res.status(400).json({ success: false, error: err.message });
    }
    console.log('File uploaded:', req.file);
    next();
  });
};

// Middleware สำหรับตรวจสอบข้อมูล Product
const validateProduct = (req, res, next) => {
  const { productId, type, name } = req.body;

  if (!productId || !type || !name) {
    return res.status(400).json({ success: false, error: "Missing required fields (productId, type, name)" });
  }

  if (typeof productId !== 'string' || productId.trim() === '') {
    return res.status(400).json({ success: false, error: "productId must be a non-empty string" });
  }

  if (typeof type !== 'string' || type.trim() === '') {
    return res.status(400).json({ success: false, error: "type must be a non-empty string" });
  }

  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ success: false, error: "name must be a non-empty string" });
  }

  next();
};

// Route: สร้าง Product ใหม่
router.post('/create', handleImageUpload, validateProduct, async (req, res) => {
  try {
    const { productId, type, name } = req.body;

    console.log('Creating product with data:', { productId, type, name, file: req.file });

    // ตรวจสอบว่า productId ซ้ำหรือไม่
    const existingProduct = await Product.findOne({ productId });
    if (existingProduct) {
      return res.status(400).json({ success: false, error: "Product with this productId already exists" });
    }

    // สร้าง Product ใหม่
    const newProduct = new Product({
      productId,
      type,
      name,
      image: req.file ? `/uploads/product/${req.file.filename}` : null,
    });

    await newProduct.save();

    res.status(201).json({
      success: true,
      data: {
        productId: newProduct.productId,
        type: newProduct.type,
        name: newProduct.name,
        image: newProduct.image ? `${process.env.BASE_URL}${newProduct.image}` : null,
      },
    });
  } catch (error) {
    console.error('Failed to create product:', error);
    res.status(500).json({ success: false, error: 'Failed to create product', details: error.message });
  }
});

// Route: ดึงข้อมูล Product ทั้งหมด
router.get('/products', async (req, res) => {
  try {
    // ดึงข้อมูลทั้งหมดจากโมเดล Product และเรียงลำดับตาม type
    const products = await Product.find()
      .sort({ type: 1 }) // เรียงลำดับตาม type (ascending)
      .lean();

    // ตรวจสอบว่ามีข้อมูลหรือไม่
    if (!products || products.length === 0) {
      return res.status(200).json({
        success: true,
        message: "ยังไม่มีสินค้าในระบบ",
        data: [],
      });
    }

    // ส่งข้อมูลกลับไปยังผู้ใช้
    res.status(200).json({
      success: true,
      data: products.map(product => ({
        productId: product.productId,
        type: product.type,
        name: product.name,
        image: product.image ? `${process.env.BASE_URL}${product.image}` : null,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
      details: error.message,
    });
  }
});

export default router;