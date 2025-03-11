import express from "express"; 
import mongoose from "mongoose"; 
import cors from "cors"; 
import dotenv from "dotenv"; 
import authRoutes from "./routes/authRoutes.js"; 
import userRoutes from "./routes/userRoutes.js"; 
import roleRoutes from "./routes/roleRoutes.js"; 
import cellRoutes from "./routes/cellRoutes.js"; 
import path from "path"; 
import fs from "fs"; 

dotenv.config(); 

// เพิ่มจำนวน listeners สูงสุดเพื่อป้องกัน memory leak (ถ้าจำเป็น)
import { EventEmitter } from "events";
EventEmitter.defaultMaxListeners = 15;

const port = process.env.PORT || 3000; 
const app = express(); 

// สร้างโฟลเดอร์ uploads หากยังไม่มี
const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("Created uploads directory"); // แสดงข้อความเมื่อสร้างโฟลเดอร์สำเร็จ
}

// ให้บริการไฟล์ static จากโฟลเดอร์ uploads
app.use("/uploads", express.static(path.join(path.resolve(), "uploads")));

app.use(express.json()); // ใช้ middleware เพื่อแปลง body เป็น JSON
app.use(cors()); // เปิดใช้งาน CORS

// ฟังก์ชันเชื่อมต่อ MongoDB ด้วยการจัดการ retry
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      user: process.env.MONGO_USER,
      pass: process.env.MONGO_PASSWORD,
      serverSelectionTimeoutMS: 5000, // กำหนดเวลาหมดอายุในการเลือกเซิร์ฟเวอร์
      maxPoolSize: 10, // จำกัดจำนวนการเชื่อมต่อสูงสุด
    });
    console.log("Connected to MongoDB successfully"); 
  } catch (err) {
    console.error("MongoDB connection error:", err.message); 
    // รีทรีการเชื่อมต่อหลังจาก 5 วินาทีหากล้มเหลว
    setTimeout(connectDB, 5000);
  }
}

connectDB(); // เรียกฟังก์ชันเชื่อมต่อ MongoDB

// ลงทะเบียนเส้นทาง (Routes)
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/role", roleRoutes);
app.use("/api", cellRoutes); // ลงทะเบียนเส้นทางสำหรับจัดการเซลล์

app.get("/api", (req, res) => {
  res.json({ message: "Hello, API Connected!" }); 
});

// Handler สำหรับข้อผิดพลาดทั่วไป
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack); // บันทึกข้อผิดพลาดลงในคอนโซล
  res.status(500).json({ status: "error", message: "Internal server error" }); 
});

// เริ่มเซิร์ฟเวอร์พร้อมจัดการข้อผิดพลาดพอร์ต
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`); // แสดงข้อความเมื่อเซิร์ฟเวอร์เริ่มทำงาน
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use, trying next port...`); // แจ้งเมื่อพอร์ตถูกใช้งานและกำลังลองพอร์ตถัดไป
    const newPort = port + 1;
    server.listen(newPort, () => {
      console.log(`Server running on port ${newPort}`); // แสดงพอร์ตใหม่ที่ใช้
    });
  } else {
    console.error("Server error:", error); // แจ้งข้อผิดพลาดอื่นๆ
  }
});

// จัดการปิดเซิร์ฟเวอร์อย่างปลอดภัยเมื่อรับ SIGTERM (เช่น จาก Docker หรือ systemd)
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully..."); 
  server.close(() => {
    console.log("Server shut down successfully"); 
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed successfully"); 
      process.exit(0);
    });
  });
});

// จัดการปิดเซิร์ฟเวอร์อย่างปลอดภัยเมื่อรับ SIGINT (เช่น กด Ctrl+C)
process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully..."); 
  server.close(() => {
    console.log("Server shut down successfully"); 
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed successfully"); 
      process.exit(0);
    });
  });
});