import express from 'express';
import { User } from '../model/User.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { protect, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ตั้งค่า Multer สำหรับ profile pictures
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads/profile'),
  filename: (req, file, cb) => {
    const userId = req.user.id;
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `user_${userId}_${uniqueSuffix}${ext}`);
  }
});

const uploadProfile = multer({
  storage: profileStorage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) cb(null, true);
    else cb(new Error('Images only! (jpeg, jpg, png)'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// API สำหรับดึงข้อมูลผู้ใช้ทั้งหมด (เฉพาะ Admin)
router.get('/all', protect, isAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password -__v').sort({ employeeId: 1 });
    const usersWithFullUrl = users.map(user => {
      const profilePic = user.profilePicture;
      const fullProfilePic = profilePic
        ? profilePic.startsWith('http')
          ? profilePic
          : `http://172.18.43.37:3000${profilePic}`
        : '';
      return {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
        phoneNumber: user.phoneNumber,
        profilePicture: fullProfilePic,
        userstatus: user.userstatus ? 'true' : 'false', // เพิ่มฟิลด์ userstatus
        updated_at: user.updated_at
      };
    });

    res.status(200).json({
      success: true,
      message: 'Users retrieved successfully',
      data: usersWithFullUrl
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// API สำหรับดึงข้อมูลโปรไฟล์ผู้ใช้ที่ล็อกอิน
router.get('/profile/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    const profilePic = user.profilePicture;
    const fullProfilePic = profilePic
      ? profilePic.startsWith('http')
        ? profilePic
        : `http://172.18.43.37:3000${profilePic}`
      : '';

    const userResponse = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      employeeId: user.employeeId,
      department: user.department,
      phoneNumber: user.phoneNumber || '', // ใส่ค่า default เป็น '' ถ้าไม่มี
      profilePicture: fullProfilePic,
      role: user.role,
      updated_at: user.updated_at
    };

    res.status(200).json({
      status: 'success',
      message: 'Profile retrieved successfully',
      data: userResponse
    });
  } catch (error) {
    console.error('Fetch profile error:', error.stack);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// API อัปเดตโปรไฟล์ของผู้ใช้ที่ล็อกอิน (สำหรับ User)
router.put('/profile/me', protect, uploadProfile.single('profilePicture'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    let updatedData = {};
    const { firstName, lastName, department, email, phoneNumber } = req.body;

    // จัดการการอัปโหลดรูปภาพ
    if (req.file) {
      if (!req.file.mimetype.match(/^image\/(jpeg|jpg|png)$/)) {
        return res.status(400).json({ status: 'error', message: 'Only image files are allowed (jpeg, jpg, png)' });
      }

      if (user.profilePicture) {
        const basePath = path.resolve(process.cwd(), 'uploads', 'profile');
        const oldImagePath = path.resolve(basePath, user.profilePicture.replace(/^\/uploads\/profile\//, ''));
        try {
          const fileExists = await fs.access(oldImagePath).then(() => true).catch(() => false);
          if (fileExists) {
            await fs.unlink(oldImagePath);
            console.log(`Deleted old profile picture: ${oldImagePath}`);
          } else {
            console.log(`Old profile picture not found: ${oldImagePath}`);
          }
        } catch (err) {
          console.error(`Error deleting old profile picture: ${err.message}`);
          return res.status(500).json({ status: 'error', message: 'Failed to delete old profile picture' });
        }
      }

      updatedData.profilePicture = `/uploads/profile/${req.file.filename}`;
      console.log('New profile picture path:', updatedData.profilePicture);
    }

    // ตรวจสอบและอัปเดตข้อมูล (ไม่รวม role)
    if (firstName || lastName || department || email || phoneNumber || req.file) {
      if (firstName && (firstName.length > 50 || !firstName.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid first name' });
      }
      if (lastName && (lastName.length > 50 || !lastName.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid last name' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ status: 'error', message: 'Invalid email' });
      }
      if (phoneNumber && !/^\d{10}$/.test(phoneNumber)) {
        return res.status(400).json({ status: 'error', message: 'Invalid phone number' });
      }

      updatedData = {
        ...updatedData,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        department: department || user.department,
        email: email || user.email,
        phoneNumber: phoneNumber || user.phoneNumber || '',
        updated_at: new Date()
      };
    } else {
      return res.status(400).json({ status: 'error', message: 'No updates provided' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updatedData,
      { new: true, runValidators: true, select: '-password' }
    );

    const profilePic = updatedUser.profilePicture;
    const fullProfilePic = profilePic
      ? profilePic.startsWith('http')
        ? profilePic
        : `http://172.18.43.37:3000${profilePic}`
      : '';

    const userResponse = {
      id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      employeeId: updatedUser.employeeId,
      department: updatedUser.department,
      phoneNumber: updatedUser.phoneNumber || '',
      profilePicture: fullProfilePic,
      role: updatedUser.role,
      updated_at: updatedUser.updated_at
    };

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: userResponse
    });
  } catch (error) {
    console.error('Update profile error:', error.stack);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

// API อัปเดตโปรไฟล์ของผู้ใช้โดย Admin
router.put('/profile/:userId', protect, isAdmin, uploadProfile.single('profilePicture'), async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    let updatedData = {};
    const { firstName, lastName, department, email, phoneNumber, role } = req.body;

    if (req.file) {
      if (!req.file.mimetype.match(/^image\/(jpeg|jpg|png)$/)) {
        return res.status(400).json({ status: 'error', message: 'Only image files are allowed (jpeg, jpg, png)' });
      }

      if (user.profilePicture) {
        const basePath = path.resolve(process.cwd(), 'uploads', 'profile');
        const oldImagePath = path.resolve(basePath, user.profilePicture.replace(/^\/uploads\/profile\//, ''));
        try {
          const fileExists = await fs.access(oldImagePath).then(() => true).catch(() => false);
          if (fileExists) {
            await fs.unlink(oldImagePath);
            console.log(`Deleted old profile picture: ${oldImagePath}`);
          } else {
            console.log(`Old profile picture not found: ${oldImagePath}`);
          }
        } catch (err) {
          console.error(`Error deleting old profile picture: ${err.message}`);
          return res.status(500).json({ status: 'error', message: 'Failed to delete old profile picture' });
        }
      }

      updatedData.profilePicture = `/uploads/profile/${req.file.filename}`;
      console.log('New profile picture path:', updatedData.profilePicture);
    }

    if (firstName || lastName || department || email || phoneNumber || role || req.file) {
      if (firstName && (firstName.length > 50 || !firstName.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid first name' });
      }
      if (lastName && (lastName.length > 50 || !lastName.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid last name' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ status: 'error', message: 'Invalid email' });
      }
      if (phoneNumber && !/^\d{10}$/.test(phoneNumber)) {
        return res.status(400).json({ status: 'error', message: 'Invalid phone number' });
      }
      if (role && !['user', 'admin'].includes(role)) {
        return res.status(400).json({ status: 'error', message: 'Invalid role' });
      }

      updatedData = {
        ...updatedData,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        department: department || user.department,
        email: email || user.email,
        phoneNumber: phoneNumber || user.phoneNumber || '',
        role: role || user.role,
        updated_at: new Date()
      };
    } else {
      return res.status(400).json({ status: 'error', message: 'No updates provided' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updatedData,
      { new: true, runValidators: true, select: '-password' }
    );

    const profilePic = updatedUser.profilePicture;
    const fullProfilePic = profilePic
      ? profilePic.startsWith('http')
        ? profilePic
        : `http://172.18.43.37:3000${profilePic}`
      : '';

    const userResponse = {
      id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      employeeId: updatedUser.employeeId,
      department: updatedUser.department,
      phoneNumber: updatedUser.phoneNumber || '',
      profilePicture: fullProfilePic,
      role: updatedUser.role,
      updated_at: updatedUser.updated_at
    };

    res.status(200).json({
      status: 'success',
      message: 'Profile updated successfully',
      data: userResponse
    });
  } catch (error) {
    console.error('Update profile by admin error:', error.stack);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

router.put('/status/:employeeId', protect, isAdmin, async (req, res) => {
  try {
    const employeeIdToUpdate = req.params.employeeId;
    const adminEmployeeId = req.user.employeeId;
    const { userstatus } = req.body;

    // ตรวจสอบ input
    if (!userstatus || (userstatus !== 'true' && userstatus !== 'false')) {
      return res.status(400).json({
        status: 'error',
        message: 'กรุณาระบุ userstatus เป็น "true" หรือ "false"'
      });
    }

    // ค้นหาผู้ใช้
    const user = await User.findOne({ employeeId: employeeIdToUpdate });
    if (!user) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'ไม่พบผู้ใช้' 
      });
    }

    // ตรวจสอบสิทธิ์
    if (employeeIdToUpdate === adminEmployeeId) {
      return res.status(403).json({
        status: 'error',
        message: 'ไม่ได้รับอนุญาต: ไม่สามารถแก้ไขสถานะบัญชีของตัวเองได้'
      });
    }

    // อัปเดตสถานะ
    user.userstatus = userstatus === 'true'; // แปลง string เป็น boolean
    await user.save();

    // ส่ง response
    res.status(200).json({
      status: 'success',
      message: `อัปเดตสถานะผู้ใช้สำเร็จ บัญชีนี้ขณะนี้ ${user.userstatus ? 'ใช้งานได้' : 'ไม่สามารถใช้งานได้'}`,
      data: { 
        employeeId: user.employeeId,
        userstatus: user.userstatus
      }
    });
  } catch (error) {
    // ปรับปรุง error handling
    console.error('ข้อผิดพลาดในการอัปเดตสถานะผู้ใช้:', {
      error: error.message,
      stack: error.stack,
      employeeId: req.params.employeeId
    });
    res.status(500).json({ 
      status: 'error', 
      message: 'ข้อผิดพลาดของเซิร์ฟเวอร์',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
export default router;