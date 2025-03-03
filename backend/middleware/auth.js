// middleware/auth.js
import jwt from 'jsonwebtoken';

// Middleware ตรวจสอบผู้ใช้
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



export { protect, isAdmin };