import express from 'express';
import { User } from '../model/User.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { protect, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// ตั้งค่า Multer สำหรับการอัปโหลดไฟล์
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, './uploads'),
  filename: (req, file, cb) => {
    const userId = req.user.id;
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `user_${userId}_${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) cb(null, true);
    else cb(new Error('Images only! (jpeg, jpg, png)'));
  },
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// API สำหรับดึงข้อมูลผู้ใช้ทั้งหมด
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
        updated_at: user.updated_at
      };
    });

    res.status(200).json({
      status: 'success',
      message: 'Users retrieved successfully',
      data: usersWithFullUrl
    });
  } catch (error) {
    console.error('Fetch users error:', error.stack);
    res.status(500).json({ status: 'error', message: 'Server error' });
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
      phoneNumber: user.phoneNumber,
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

// API อัปเดตโปรไฟล์ของผู้ใช้ที่ล็อกอิน
router.put('/profile/me', protect, upload.single('profilePicture'), async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    let updatedData = {};
    const { firstName, lastName, department, email, phoneNumber } = req.body;

    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ status: 'error', message: 'Only image files are allowed' });
      }

      if (user.profilePicture) {
        const oldImagePath = path.join(
          process.cwd(),
          user.profilePicture.replace(/^\/uploads\//, 'uploads/')
        );
        try {
          await fs.unlink(oldImagePath);
          console.log(`Deleted old profile picture: ${oldImagePath}`);
        } catch (err) {
          console.error(`Error deleting old profile picture: ${err.message}`);
        }
      }

      updatedData.profilePicture = `/uploads/${req.file.filename}`;
      console.log('New profile picture path:', updatedData.profilePicture);
    }

    if (firstName || lastName || department || email || phoneNumber || req.file) {
      if (firstName && (firstName.length > 50 || !firstName.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid first name' });
      }
      if (lastName && (lastName.length > 50 || !lastName.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid last name' });
      }
      if (department && (department.length > 50 || !department.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid department' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ status: 'error', message: 'Invalid email format' });
      }
      if (phoneNumber && !/^\d{9,}$/.test(phoneNumber.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid phone number (at least 9 digits)' });
      }
      if (email && email !== user.email) {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
          return res.status(400).json({ status: 'error', message: 'Email already exists' });
        }
      }

      updatedData = {
        ...updatedData,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        department: department || user.department,
        email: email || user.email,
        phoneNumber: phoneNumber || user.phoneNumber,
        profilePicture: updatedData.profilePicture || user.profilePicture,
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
      phoneNumber: updatedUser.phoneNumber,
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

// API อัปเดตโปรไฟล์ของผู้ใช้ตาม ID (เฉพาะ Admin)
router.put('/profile/:userId', protect, isAdmin, upload.single('profilePicture'), async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    let updatedData = {};
    const { firstName, lastName, department, email, phoneNumber, role } = req.body;

    if (req.file) {
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({ status: 'error', message: 'Only image files are allowed' });
      }

      if (user.profilePicture) {
        const oldImagePath = path.join(
          process.cwd(),
          user.profilePicture.replace(/^\/uploads\//, 'uploads/')
        );
        try {
          await fs.unlink(oldImagePath);
          console.log(`Deleted old profile picture: ${oldImagePath}`);
        } catch (err) {
          console.error(`Error deleting old profile picture: ${err.message}`);
        }
      }

      updatedData.profilePicture = `/uploads/${req.file.filename}`;
      console.log('New profile picture path:', updatedData.profilePicture);
    }

    if (firstName || lastName || department || email || phoneNumber || role || req.file) {
      if (firstName && (firstName.length > 50 || !firstName.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid first name' });
      }
      if (lastName && (lastName.length > 50 || !lastName.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid last name' });
      }
      if (department && (department.length > 50 || !department.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid department' });
      }
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ status: 'error', message: 'Invalid email format' });
      }
      if (phoneNumber && !/^\d{9,}$/.test(phoneNumber.trim())) {
        return res.status(400).json({ status: 'error', message: 'Invalid phone number (at least 9 digits)' });
      }
      if (email && email !== user.email) {
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
          return res.status(400).json({ status: 'error', message: 'Email already exists' });
        }
      }

      updatedData = {
        ...updatedData,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        department: department || user.department,
        email: email || user.email,
        phoneNumber: phoneNumber || user.phoneNumber,
        role: role || user.role,
        profilePicture: updatedData.profilePicture || user.profilePicture,
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
      phoneNumber: updatedUser.phoneNumber,
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

// API ลบผู้ใช้ (เฉพาะ Admin)
router.delete('/users/:userId', protect, isAdmin, async (req, res) => {
  try {
    const userIdToDelete = req.params.userId;
    const adminId = req.user.id;

    if (userIdToDelete === adminId) {
      return res.status(403).json({
        status: 'error',
        message: 'Unauthorized: Cannot delete your own account'
      });
    }

    const user = await User.findById(userIdToDelete);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    if (user.profilePicture) {
      const imagePath = path.join(
        process.cwd(),
        user.profilePicture.replace(/^\/uploads\//, 'uploads/')
      );
      try {
        await fs.unlink(imagePath);
        console.log(`Deleted profile picture: ${imagePath}`);
      } catch (err) {
        console.error(`Error deleting profile picture: ${err.message}`);
      }
    }

    await User.findByIdAndDelete(userIdToDelete);

    res.status(200).json({
      status: 'success',
      message: 'User deleted successfully',
      data: { id: userIdToDelete }
    });
  } catch (error) {
    console.error('Delete user error:', error.stack);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

export default router;
