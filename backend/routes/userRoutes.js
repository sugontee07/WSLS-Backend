import express from 'express';
import { User } from '../model/User.js';
import jwt from 'jsonwebtoken'; // ต้อง import เพื่อใช้ใน middleware

const router = express.Router();

// Middleware ตรวจสอบว่าเป็น Admin
const isAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ status: "error", message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ status: "error", message: "Admin access required" });
    }
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ status: "error", message: "Invalid token" });
  }
};

router.get('/all', isAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password -__v')
      .sort({ employeeId: 1 });

    res.status(200).json({
      status: "success",
      message: "Users retrieved successfully",
      data: users.map(user => ({
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        employeeId: user.employeeId,
        department: user.department,
        role: user.role,
        phoneNumber: user.phoneNumber,
        updated_at: user.updated_at
      }))
    });
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// API สำหรับอัปเดตโปรไฟล์
router.put('/profile/:user_id', async (req, res) => {
  const userId = req.params.user_id;
  const { username, first_name, last_name, email } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && !emailRegex.test(email)) {
      return res.status(400).json({ status: "error", message: "Invalid email format" });
    }

    const updatedData = {
      firstName: first_name || user.firstName,
      lastName: last_name || user.lastName,
      email: email || user.email,
      updated_at: new Date().toISOString()
    };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updatedData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      status: "success",
      message: "Profile updated successfully",
      data: {
        id: updatedUser._id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        email: updatedUser.email,
        employeeId: updatedUser.employeeId,
        department: updatedUser.department,
        updated_at: updatedUser.updated_at
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ status: "error", message: "Server error" });
  }
});

// API สำหรับอัปเดต Role (เฉพาะ Admin)
router.put('/role-by-employee/:employeeId', isAdmin, async (req, res) => {
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