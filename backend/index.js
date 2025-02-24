import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { User } from './model/User.js';
import authRoutes from './routes/authRoutes.js';

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(cors());

// เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGO_URI, {
  user: process.env.MONGO_USER,
  pass: process.env.MONGO_PASSWORD,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ใช้ auth routes
app.use('/api', authRoutes);

// Route: ทดสอบ API
app.get('/api', (req, res) => {
  res.json({ message: "Hello, API Connected!" });
});

// Route: Register (ไม่เปลี่ยนแปลง)
app.post('/api/register', async (req, res) => {
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
      password
    });

    await newUser.save();

    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
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
        employeeId
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Route: Login (เปลี่ยนจาก email เป็น employeeId)
app.post('/api/login', async (req, res) => {
  const { employeeId, password } = req.body;

  try {
    // ตรวจสอบข้อมูลพื้นฐาน
    if (!employeeId || !password) {
      return res.status(400).json({ success: false, message: 'Employee ID and password are required' });
    }

    // ค้นหาผู้ใช้จาก employeeId
    const user = await User.findOne({ employeeId });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid employee ID or password' });
    }

    // ตรวจสอบรหัสผ่าน
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid employee ID or password' });
    }

    // สร้าง JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN
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
        employeeId: user.employeeId,
        department: user.department
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// เริ่มเซิร์ฟเวอร์
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});