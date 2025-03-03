// routes/userRoutes.js
import express from 'express';
import { User } from '../model/User.js';
import multer from 'multer';
import path from 'path';
import fsPromises from 'fs/promises';
import fs from 'fs';
import { protect, isAdmin } from '../middleware/auth.js';

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
    const userId = req.user.id; // ใช้ req.user.id จาก token
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

// API สำหรับดึงข้อมูลผู้ใช้ทั้งหมด
router.get('/all', protect, isAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -__v')
      .sort({ employeeId: 1 });

    // const baseUrl = `${req.protocol}://${req.get('host')}`;
    const usersWithFullUrl = users.map(user => ({
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      employeeId: user.employeeId,
      department: user.department,
      role: user.role,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture ? `http://172.18.43.37:3000/${user.profilePicture}` : '',
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

router.get('/profile/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    // const baseUrl = `${req.protocol}://${req.get('host')}`;
    const userResponse = {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      employeeId: user.employeeId,
      department: user.department,
      phoneNumber: user.phoneNumber,
      profilePicture: user.profilePicture ? `http://172.18.43.37:3000/${user.profilePicture}` : '',
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

// API สำหรับดึงข้อมูลผู้ใช้ที่กำลังล็อกอินอยู่
router.put('/profile/me', protect, (req, res, next) => {
  if (req.is('multipart/form-data')) {
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
    const targetUserId = req.user.id;
    const user = await User.findById(targetUserId).select('-password');
    if (!user) {
      return res.status(404).json({ status: "error", message: 'User not found' });
    }

    let updatedData = {};
    let profilePictureUrl = user.profilePicture;

    // Handle file upload (multipart/form-data)
    const file = req.files?.['profilePicture']?.[0] || req.files?.['image']?.[0];
    if (file) {
      if (!file.mimetype.startsWith('image/')) {
        return res.status(400).json({ status: "error", message: 'Only image files are allowed' });
      }

      if (user.profilePicture) {
        const oldImagePath = path.join(path.resolve(), user.profilePicture.replace(/^.*\/uploads\//, 'uploads/'));
        try {
          await fsPromises.unlink(oldImagePath);
          console.log(`Deleted old profile picture: ${oldImagePath}`);
        } catch (err) {
          console.error(`Error deleting old profile picture: ${err.message}`);
        }
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      profilePictureUrl = `${baseUrl}/uploads/${file.filename}`;
      updatedData.profilePicture = profilePictureUrl;
      console.log('New profile picture URL:', profilePictureUrl);
    }

    // Handle profile data updates (multipart/form-data or JSON)
    const { firstName, lastName, department, email, phoneNumber, profilePicture } = req.body;
    if (firstName || lastName || department || email || phoneNumber || profilePicture || file) {
      // ... validation and update logic ...
      updatedData = {
        ...updatedData,
        firstName: firstName || user.firstName,
        lastName: lastName || user.lastName,
        department: department || user.department,
        email: email || user.email,
        phoneNumber: phoneNumber || user.phoneNumber,
        profilePicture: profilePicture || profilePictureUrl,
        updated_at: new Date()
      };
      } else {
      return res.status(400).json({
        status: "error",
        message: 'No updates provided (neither profile data nor image)',
      });
    }

    console.log('Sending user response:', userResponse);

    res.status(200).json({
      status: "success",
      message: "User retrieved successfully",
      data: userResponse
    });
  } catch (error) {
    console.error('Fetch logged-in user error:', error);
    res.status(500).json({ status: "error", message: "Server error", details: error.message });
  }
});

// Route สำหรับอัปเดตโปรไฟล์ผู้ใช้ที่กำลังล็อกอินอยู่ (User และ Admin สามารถใช้งานได้)
router.put('/profile/me/:userId', protect, (req, res, next) => {
  if (req.is('multipart/form-data')) {
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
    const targetUserId = req.user.id; // From JWT token
    const urlUserId = req.params.userId; // From URL

    // Optional: Ensure the user can only update their own profile
    if (targetUserId !== urlUserId) {
      return res.status(403).json({ status: "error", message: "Unauthorized: You can only update your own profile" });
    }

    const user = await User.findById(targetUserId).select('-password');
    if (!user) {
      return res.status(404).json({ status: "error", message: 'User not found' });
    }

    let updatedData = {};
    let profilePictureUrl = user.profilePicture;

    const file = req.files?.['profilePicture']?.[0] || req.files?.['image']?.[0];
    if (file) {
      if (!file.mimetype.startsWith('image/')) {
        return res.status(400).json({ status: "error", message: 'Only image files are allowed' });
      }

      if (user.profilePicture) {
        const oldImagePath = path.join(path.resolve(), user.profilePicture.replace(/^.*\/uploads\//, 'uploads/'));
        try {
          await fsPromises.unlink(oldImagePath);
          console.log(`Deleted old profile picture: ${oldImagePath}`);
        } catch (err) {
          console.error(`Error deleting old profile picture: ${err.message}`);
        }
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      profilePictureUrl = `${baseUrl}/uploads/${file.filename}`;
      updatedData.profilePicture = profilePictureUrl;
      console.log('New profile picture URL:', profilePictureUrl);
    }

    const { firstName, lastName, department, email, phoneNumber, profilePicture } = req.body;
    if (firstName || lastName || department || email || phoneNumber || profilePicture || file) {
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
        profilePicture: profilePicture || profilePictureUrl,
        updated_at: new Date()
      };
    } else {
      return res.status(400).json({
        status: "error",
        message: 'No updates provided (neither profile data nor image)',
      });
    }

    if (updatedData.profilePicture) {
      const imagePath = path.join(path.resolve(), updatedData.profilePicture.replace(/^.*\/uploads\//, 'uploads/'));
      if (!fs.existsSync(imagePath)) {
        console.log('Profile picture file does not exist:', imagePath);
        updatedData.profilePicture = '';
      }
    }

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

export default router;