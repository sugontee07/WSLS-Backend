import jwt from 'jsonwebtoken';
import { User } from '../model/User.js';

// Middleware ตรวจสอบผู้ใช้
const protect = async (req, res, next) => {
  let token;

  // ตรวจสอบว่ามี header Authorization และเริ่มต้นด้วย "Bearer" หรือไม่
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // ดึง token ออกมาจาก header
      token = req.headers.authorization.split(' ')[1];
      console.log('Token received:', token); // Debug token

      // ตรวจสอบ token ด้วย JWT_SECRET
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Decoded token:', decoded); // Debug decoded token

      // ดึงข้อมูลผู้ใช้จากฐานข้อมูล (ไม่รวม password)
      req.user = await User.findById(decoded.id).select('-password');
      if (!req.user) {
        console.log('User not found for ID:', decoded.id);
        return res.status(401).json({ status: 'error', message: 'ไม่พบผู้ใช้' });
      }
      console.log('User found:', req.user); // Debug user

      next();
    } catch (error) {
      console.error('ไม่สามารถตรวจสอบ token ได้:', error.message);
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ status: 'error', message: 'Token หมดอายุ' });
      }
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({ status: 'error', message: 'Token ไม่ถูกต้อง' });
      }
      return res.status(401).json({ status: 'error', message: 'ไม่ได้รับอนุญาต' });
    }
  } else {
    console.log('No token provided in headers');
    return res.status(401).json({ status: 'error', message: 'ไม่ได้รับอนุญาต ไม่มี token' });
  }
};

// Middleware ตรวจสอบว่าเป็น Admin
const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ status: 'error', message: 'ไม่พบข้อมูลผู้ใช้' });
  }

  if (req.user.role !== 'admin') {
    console.log('User role is not admin:', req.user.role);
    return res.status(403).json({ status: 'error', message: 'ต้องมีสิทธิ์ Admin เท่านั้น' });
  }

  console.log('Admin access granted for user:', req.user);
  next();
};

export { protect, isAdmin };