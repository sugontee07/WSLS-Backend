// controllers/authController.js
import jwt from 'jsonwebtoken';
import { User } from '../model/User.js';

export const login = async (req, res) => {
  const { employeeId, password } = req.body;

  try {
    // ตรวจสอบว่ามี email และ password หรือไม่
    if (!employeeId || !password) {
      return res.status(400).json({ success: false, message: 'EmployeeID and password are required' });
    }

    // ค้นหาผู้ใช้จาก email
    const user = await User.findOne({ employeeId });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    // ตรวจสอบรหัสผ่าน (สมมติว่าใช้ bcrypt ใน User schema)
    const isMatch = await user.comparePassword(password); // ต้องมี method นี้ใน User schema
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid email or password' });
    }

    // สร้าง JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d'
    });

    // ส่ง response กลับ
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        employeeId: user.employeeId
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};