import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import cellRoutes from "./routes/cellRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import billRoutes from "./routes/billRoutes.js";
import manageRoutes from "./routes/manageRoutes.js";
import withdrawRoutes from "./routes/withdrawRoutes.js"; 

import path from "path";
import fs from "fs";

// เพิ่มจำนวน listeners สูงสุดเพื่อป้องกัน memory leak (ถ้าจำเป็น)
import { EventEmitter } from "events";
EventEmitter.defaultMaxListeners = 15;

// โหลด environment variables
dotenv.config();

// ตรวจสอบ environment variables ที่จำเป็น
const requiredEnvVars = ["MONGO_URI", "MONGO_USER", "MONGO_PASSWORD", "JWT_SECRET", "BASE_URL"];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Error: Environment variable ${envVar} is not set.`);
    process.exit(1);
  }
}

// ใช้ค่าเริ่มต้น 3000 หาก PORT ไม่ได้กำหนด
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

// Middleware
app.use(express.json());
app.use(cors());

// ลงทะเบียนเส้นทาง (Routes)
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/role", roleRoutes);
app.use("/api/cell", cellRoutes);
app.use("/api/product", productRoutes);
app.use("/api/bill", billRoutes);
app.use("/api/manage", manageRoutes);
app.use("/api/withdraw", withdrawRoutes); // เปลี่ยนจาก pdfRoutes เป็น withdrawRoutes

app.get("/api", (req, res) => {
  res.json({ message: "Hello, API Connected!" });
});

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
    setTimeout(connectDB, 5000);
  }
}

connectDB();

// เพิ่ม event listener สำหรับการจัดการสถานะการเชื่อมต่อ MongoDB
mongoose.connection.on("connected", () => {
  console.log("MongoDB connected successfully");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB disconnected, attempting to reconnect...");
  connectDB();
});

// Middleware สำหรับจัดการข้อผิดพลาดทั่วไป
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  const statusCode = err.status || 500;
  const errorResponse = {
    status: "error",
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  };
  res.status(statusCode).json(errorResponse);
});

// เริ่มเซิร์ฟเวอร์
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use, trying next port...`);
    const newPort = parseInt(port) + 1;
    server.listen(newPort, () => {
      console.log(`Server running on port ${newPort}`);
    });
  } else {
    console.error("Server error:", error);
    process.exit(1);
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