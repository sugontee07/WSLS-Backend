import express from 'express';
import { User } from '../model/User.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Register Route
router.post('/Register', async (req, res) => {
  // Destructuring โดยไม่มี role เพื่อไม่รับจาก request
  const { firstName, lastName, department, employeeId, email, phoneNumber, password, confirmPassword } = req.body;

  try {
    // ตรวจสอบฟิลด์ที่จำเป็น
    if (!firstName || !lastName || !department || !employeeId || !email || !phoneNumber || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    // ตรวจสอบผู้ใช้ที่ซ้ำ
    const existingUser = await User.findOne({ $or: [{ email }, { employeeId }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email or Employee ID already exists' });
    }

    // สร้างผู้ใช้ใหม่โดยไม่ระบุ role (Schema จะตั้ง default เป็น 'user')
    const newUser = new User({
      firstName,
      lastName,
      department,
      employeeId,
      email,
      phoneNumber,
      password
    });

    await newUser.save();

    // สร้าง JWT token รวม role (จะเป็น 'user' จาก default)
    const token = jwt.sign({ id: newUser._id, role: newUser.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        firstName,
        lastName,
        email,
        employeeId,
        role: newUser.role // จะเป็น 'user' เสมอ
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Login Route (ไม่เปลี่ยนแปลง)
router.post('/login', async (req, res) => {
  const { employeeId, password } = req.body;

  try {
    if (!employeeId || !password) {
      return res.status(400).json({ success: false, message: 'EmployeeID and password are required' });
    }

    const user = await User.findOne({ employeeId });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID or password' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d'
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;