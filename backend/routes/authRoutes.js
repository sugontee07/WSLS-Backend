import express from 'express';
import { User } from '../model/User.js';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Log email credentials for debugging
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
      pass: process.env.EMAIL_PASSWORD
    }
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
      password
    });

    await newUser.save();

    const token = jwt.sign({ id: newUser._id, role: newUser.role }, process.env.JWT_SECRET, {
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
        employeeId,
        role: newUser.role
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Login Route
router.post('/login', async (req, res) => {
  const { employeeId, password } = req.body;

  try {
    if (!employeeId || !password) {
      return res.status(400).json({ success: false, message: 'EmployeeID and password are required' });
    }

    const user = await User.findOne({ employeeId });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid employee ID or password' });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '30d'
    });

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
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Forgot Password Route with Nodemailer
router.post('/forgot-password', async (req, res) => {
  console.log('Forgot password route hit:', req.body);
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '24h'
    });

    const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;

    // Check if transporter is available
    if (!transporter) {
      return res.status(500).json({
        success: false,
        message: 'Email service is not configured',
        error: 'Email credentials are missing'
      });
    }

    await transporter.sendMail({
      from: `"Your App Name" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Password Reset Request',
      html: `
        <h3>Password Reset Request</h3>
        <p>Hello ${user.firstName},</p>
        <p>You requested a password reset. Click the link below to reset your password:</p>
        <p><a href="${resetLink}">Reset Password</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <p>Best regards,<br>Your App Team</p>
      `
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Reset link sent to your email' 
    });
  } catch (error) {
    console.error('Email sending error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
});

export default router;