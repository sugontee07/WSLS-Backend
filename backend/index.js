import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import cellRoutes from "./routes/cellRoutes.js";
import billRoutes from "./routes/billRoutes.js"; // นำเข้า billRoutes
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
  console.log("Created uploads directory");
}

// ให้บริการไฟล์ static จากโฟลเดอร์ uploads
app.use("/uploads", express.static(path.join(path.resolve(), "uploads")));

app.use(express.json());
app.use(cors());

// ฟังก์ชันเชื่อมต่อ MongoDB ด้วยการจัดการ retry
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      user: process.env.MONGO_USER,
      pass: process.env.MONGO_PASSWORD,
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10,
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
app.use("/api/cell", cellRoutes);
app.use("/api/bill", billRoutes); // เพิ่มเส้นทางสำหรับบิล

app.get("/api", (req, res) => {
  res.json({ message: "Hello, API Connected!" });
});

// Handler สำหรับข้อผิดพลาดทั่วไป
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

// เริ่มเซิร์ฟเวอร์
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use, trying next port...`);
    const newPort = port + 1;
    server.listen(newPort, () => {
      console.log(`Server running on port ${newPort}`);
    });
  } else {
    console.error("Server error:", error);
  }
});

// จัดการปิดเซิร์ฟเวอร์อย่างปลอดภัย
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