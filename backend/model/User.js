import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  department: { type: String, required: true },
  employeeId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  phoneNumber: { type: String, required: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['user', 'admin'], // จำกัดค่าให้เป็น user หรือ admin เท่านั้น
    default: 'user' // ค่าเริ่มต้นเป็น user
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 4); // แนะนำให้เปลี่ยนเป็น 10 ใน production
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

export const User = mongoose.model('User', userSchema);