// routes/userRoutes.js
import express from 'express';
import { User } from '../model/User.js';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fsPromises from 'fs/promises';
import fs from 'fs';

const router = express.Router();

// ตรวจสอบและสร้างโฟลเดอร์ uploads
const uploadDir = './uploads';
try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('Created uploads directory');
  }
} catch (err) {
  console.error('Error creating uploads directory:', err);
}

// ตั้งค่า Multer สำหรับการอัปโหลดไฟล์
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log('Saving file to:', uploadDir);
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const userId = req.params.user_id;
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = `user_${userId}_${uniqueSuffix}${ext}`;
    console.log('Generated filename:', filename);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      console.log(`File ${file.originalname} passed filter (type: ${mimetype})`);
      cb(null, true);
    } else {
      console.log(`File ${file.originalname} failed filter`);
      cb(new Error('Images only! (jpeg, jpg, png)'));
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Middleware ตรวจสอบผู้ใช้ (เปลี่ยนชื่อจาก authenticateUser เป็น protect เพื่อให้สอดคล้องกับโค้ดตัวอย่าง)
const protect = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: "error", message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ status: "error", message: "Invalid token" });
  }
};

// Middleware ตรวจสอบว่าเป็น Admin
const isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ status: "error", message: "Admin access required" });
  }
  next();
};

// API สำหรับดึงข้อมูลผู้ใช้ทั้งหมด
router.get('/all', protect, isAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -__v')
      .sort({ employeeId: 1 });

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const usersWithFullUrl = users.map(user => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      employeeId: user.employeeId,
      department: user.department,
      role: user.role,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture ? `${baseUrl}${user.profilePicture}` : '',
      updated_at: user.updated_at
    }));

    res.status(200).json({
      status: "success",
      message: "Users retrieved successfully",
      data: usersWithFullUrl
    });
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ status: "error", message: "Server error", details: error.message });
  }
});

// Route สำหรับอัปเดตโปรไฟล์ผู้ใช้ตาม userId (ต้องล็อกอินก่อน)
router.put('/profile/:user_id', protect, (req, res, next) => {
  // ตรวจสอบว่าเป็น JSON หรือ multipart/form-data
  if (req.is('multipart/form-data')) {
    // รองรับทั้งฟิลด์ 'profilePicture' และ 'image'
    upload.fields([
      { name: 'profilePicture', maxCount: 1 },
      { name: 'image', maxCount: 1 }
    ])(req, res, (err) => {
      if (err) {
        console.log('Multer error:', err.message);
        return res.status(400).json({ status: "error", message: err.message });
      }
      next();
    });
  } else {
    next();
  }
}, async (req, res) => {
  try {
    const targetUserId = req.params.user_id;
    const currentUserId = req.user.id;

    // ตรวจสอบว่าเป็นผู้ใช้เองหรือมีสิทธิ์ admin
    if (targetUserId !== currentUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        status: "error",
        message: 'You are not authorized to update this profile',
      });
    }

    // หาผู้ใช้จาก userId
    const user = await User.findById(targetUserId).select('-password');
    if (!user) {
      return res.status(404).json({ status: "error", message: 'User not found' });
    }

    let updatedData = {};
    let profilePictureUrl = user.profilePicture; // เก็บค่าเดิมไว้ก่อน

    // กรณีอัปโหลดไฟล์รูปภาพ (multipart/form-data)
    const file = req.files?.['profilePicture']?.[0] || req.files?.['image']?.[0];
    if (file) {
      if (!file.mimetype.startsWith('image/')) {
        return res.status(400).json({ status: "error", message: 'Only image files are allowed' });
      }

      // ลบรูปเก่าถ้ามี
      if (user.profilePicture) {
        const oldImagePath = path.join(path.resolve(), user.profilePicture);
        try {
          await fsPromises.unlink(oldImagePath);
          console.log(`Deleted old profile picture: ${oldImagePath}`);
        } catch (err) {
          console.error(`Error deleting old profile picture: ${err.message}`);
        }
      }

      // สร้าง URL สำหรับรูปใหม่
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      profilePictureUrl = `${baseUrl}/uploads/${file.filename}`;
      updatedData.profilePicture = profilePictureUrl; // อัปเดต URL รูปใหม่
      console.log('New profile picture URL:', profilePictureUrl);
    }

    // กรณีอัปเดตข้อมูลโปรไฟล์ (JSON)
    const { firstName, lastName, department, email, phoneNumber, profilePicture } = req.body;
    if (firstName || lastName || department || email || phoneNumber || profilePicture) {
      // ตรวจสอบความถูกต้องของข้อมูล
      if (!firstName && !lastName && !department && !email && !phoneNumber && !profilePicture && !file) {
        return res.status(400).json({
          status: "error",
          message: 'At least one field (firstName, lastName, department, email, phoneNumber, or profilePicture) is required',
        });
      }

      if (firstName && (firstName.length > 50 || !firstName.trim())) {
        return res.status(400).json({ status: "error", message: 'Invalid first name' });
      }
      if (lastName && (lastName.length > 50 || !lastName.trim())) {
        return res.status(400).json({ status: "error", message: 'Invalid last name' });
      }
      if (department && (department.length > 50 || !department.trim())) {
        return res.status(400).json({ status: "error", message: 'Invalid department' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ status: "error", message: 'Invalid email format' });
      }
      if (phoneNumber && !/^\d{9,}$/.test(phoneNumber.trim())) {
        return res.status(400).json({ status: "error", message: 'Invalid phone number (at least 9 digits)' });
      }
      if (profilePicture && !/^https?:\/\/.+/.test(profilePicture)) {
        return res.status(400).json({ status: "error", message: 'Invalid profile picture URL' });
      }

      // ตรวจสอบอีเมลซ้ำ
      if (email && email !== user.email) {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
          return res.status(400).json({ status: "error", message: 'Email already exists' });
        }
      }

      updatedData = {
        ...updatedData,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        department: department || user.department,
        email: email || user.email,
        phoneNumber: phoneNumber || user.phoneNumber,
        profilePicture: profilePicture || profilePictureUrl, // ใช้ profilePicture จาก body ถ้ามี หรือใช้ profilePictureUrl จากการอัปโหลด
        updated_at: new Date()
      };
    } else if (!file) {
      return res.status(400).json({
        status: "error",
        message: 'No updates provided (neither profile data nor image)',
      });
    }

    // อัปเดตข้อมูลใน MongoDB
    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      updatedData,
      { new: true, runValidators: true, select: '-password' }
    );

    if (!updatedUser) {
      return res.status(404).json({ status: "error", message: 'User not found' });
    }

    const userResponse = {
      id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      employeeId: updatedUser.employeeId,
      department: updatedUser.department,
      email: updatedUser.email,
      phoneNumber: updatedUser.phoneNumber,
      profilePicture: updatedUser.profilePicture,
      role: updatedUser.role,
      updated_at: updatedUser.updated_at
    };

    console.log('Sending response:', {
      status: "success",
      message: "User profile updated successfully",
      data: userResponse
    });

    return res.status(200).json({
      status: "success",
      message: "User profile updated successfully",
      data: userResponse
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      status: "error",
      message: "Server error",
      details: error.message
    });
  }
});

// API สำหรับอัปเดต Role
router.put('/role-by-employee/:employeeId', protect, isAdmin, async (req, res) => {
  const employeeId = req.params.employeeId;
  const { role } = req.body;

  try {
    const user = await User.findOne({ employeeId });
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ status: "error", message: "Invalid role. Must be 'user' or 'admin'" });
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      status: "success",
      message: "User role updated successfully",
      data: { id: user.employeeId, role: user.role }
    });
  } catch (error) {
    console.error('Update role by employeeId error:', error.stack);
    res.status(500).json({ status: "error", message: "Server error", details: error.message });
  }
});

export default router;