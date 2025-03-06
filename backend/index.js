import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import roleRoutes from "./routes/roleRoutes.js";
import path from "path";
import fs from "fs";

dotenv.config();

import { EventEmitter } from "events";
EventEmitter.defaultMaxListeners = 15;

const port = process.env.PORT || 3000;
const app = express();

const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("Created uploads directory");
}

app.use("/uploads", express.static(path.join(path.resolve(), "uploads")));

app.use(express.json());
app.use(cors());

mongoose
  .connect(process.env.MONGO_URI, {
    user: process.env.MONGO_USER,
    pass: process.env.MONGO_PASSWORD,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/role", roleRoutes);

app.get("/api", (req, res) => {
  res.json({ message: "Hello, API Connected!" });
});

app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});