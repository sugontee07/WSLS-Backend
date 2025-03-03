// model/User.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  department: { type: String, required: true },
  employeeId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { 
    type: String, 
    required: true,
    match: [/^\d{10}$/, "Phone number must be 10 digits"] // ตรวจสอบเบอร์โทรศัพท์ 10 หลัก
  },
  password: { type: String, required: true },
  profilePicture: { type: String, default: '' }, // ฟิลด์สำหรับเก็บ path รูปโปรไฟล์
  role: { 
    type: String, 
    enum: ['user', 'admin'],
    default: 'user'
  },
  updated_at: { type: Date, default: Date.now } // เก็บเวลาที่อัปเดต
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  this.updated_at = Date.now();
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model('User', userSchema);