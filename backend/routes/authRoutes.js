import express from 'express';
import { User } from '../model/User.js';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// // Log email credentials for debugging
// console.log('Email User:', process.env.EMAIL_USER);
// console.log('Email Password:', process.env.EMAIL_PASSWORD);

// Create Nodemailer transporter (with fallback if credentials are missing)
let transporter;
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
  console.error('Email credentials are missing');
} else {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });
}

// Register Route
router.post('/Register', async (req, res) => {
  console.log(req.body);
  const { firstName, lastName, department, employeeId, email, phoneNumber, password, confirmPassword } = req.body;

  try {
    if (!firstName || !lastName || !department || !employeeId || !email || !phoneNumber || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }
    if (!email.includes('@')) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { employeeId }] });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email or Employee ID already exists' });
    }

    const newUser = new User({
      firstName,
      lastName,
      department,
      employeeId,
      email,
      phoneNumber,
      password,
    });

    await newUser.save();

    const token = jwt.sign({ id: newUser._id, role: newUser.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d',
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
        role: newUser.role,
      },
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { employeeId, password } = req.body;

  try {
    // ตรวจสอบ input
    if (!employeeId || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณาระบุ EmployeeID และรหัสผ่าน' 
      });
    }

    // ค้นหาผู้ใช้
    const user = await User.findOne({ employeeId });
    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: 'Employee ID หรือรหัสผ่านไม่ถูกต้อง' 
      });
    }

    // ตรวจสอบสถานะ userstatus
    if (!user.userstatus) { // เปลี่ยนจาก active เป็น userstatus
      return res.status(403).json({
        success: false,
        message: 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่'
      });
    }

    // ตรวจสอบรหัสผ่าน
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ 
        success: false, 
        message: 'Employee ID หรือรหัสผ่านไม่ถูกต้อง' 
      });
    }

    // สร้าง JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      process.env.JWT_SECRET, 
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    // ส่ง response
    res.status(200).json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      token,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        employeeId: user.employeeId,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('ข้อผิดพลาดในการเข้าสู่ระบบ:', {
      error: error.message,
      stack: error.stack,
      employeeId
    });
    res.status(500).json({ 
      success: false, 
      message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' 
    });
  }
});


// API: ส่งลิงก์รีเซ็ตรหัสผ่าน
router.post('/forgot-password', async (req, res) => {
  console.log('Forgot password route hit:', req.body);
  try {
    const { email } = req.body;

    // ตรวจสอบ input
    if (!email) {
      return res.status(400).json({ 
        success: false, 
        message: 'กรุณาระบุอีเมล' 
      });
    }

    // ค้นหาผู้ใช้
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'ไม่พบผู้ใช้ที่มีอีเมลนี้' 
      });
    }

    // ตรวจสอบสถานะ userstatus (ใช้ boolean)
    if (!user.userstatus) { // ถ้า userstatus เป็น false
      return res.status(403).json({
        success: false,
        message: 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อเจ้าหน้าที่',
        email: user.email
      });
    }

    // ดีบัก: ตรวจสอบค่า FRONTEND_URL
    console.log("FRONTEND_URL in forgot-password route:", process.env.FRONTEND_URL);

    // ตรวจสอบว่า FRONTEND_URL ถูกกำหนดหรือไม่
    if (!process.env.FRONTEND_URL) {
      return res.status(500).json({
        success: false,
        message: 'การกำหนดค่าเซิร์ฟเวอร์ไม่ถูกต้อง',
        error: 'FRONTEND_URL is not defined in environment variables',
      });
    }

    // สร้าง reset token
    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '24h',
    });

    // สร้าง reset link
    const resetLink = `http://172.18.43.165:5173/reset-password?token=${resetToken}`;
    console.log("Generated resetLink:", resetLink); // ดีบัก: ตรวจสอบ resetLink

    // ตรวจสอบ transporter
    if (!transporter) {
      return res.status(500).json({
        success: false,
        message: 'ไม่สามารถกำหนดค่า Email service ได้',
        error: 'Email credentials are missing',
      });
    }

    // ส่งอีเมล
    await transporter.sendMail({
      from: `"WSLS" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'คำขอรีเซ็ตรหัสผ่าน',
      html: `
        <h3>คำขอรีเซ็ตรหัสผ่าน</h3>
        <p>สวัสดี ${user.firstName},</p>
        <p>คุณได้ร้องขอการรีเซ็ตรหัสผ่าน คลิกที่ลิงก์ด้านล่างเพื่อรีเซ็ตรหัสผ่าน:</p>
        <p><a href="${resetLink}">รีเซ็ตรหัสผ่าน</a></p>
        <p>ลิงก์นี้จะหมดอายุใน 24 ชั่วโมง</p>
        <p>หากคุณไม่ได้ร้องขอ กรุณาเพิกเฉยต่ออีเมลนี้</p>
        <p>ด้วยความเคารพ,<br>ทีมงาน Your App</p>
      `,
    });

    return res.status(200).json({
      success: true,
      message: 'ลิงก์รีเซ็ตรหัสผ่านได้ถูกส่งไปยังอีเมลของคุณแล้ว',
    });
  } catch (error) {
    console.error('ข้อผิดพลาดในการส่งอีเมล:', {
      error: error.message,
      stack: error.stack,
      email: req.body.email,
    });
    return res.status(500).json({
      success: false,
      message: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// Reset Password Route
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and password are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = password;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message,
    });
  }
});

export default router;