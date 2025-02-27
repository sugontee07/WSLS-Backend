import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';

dotenv.config();

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(cors());

mongoose.connect(process.env.MONGO_URI, {
  user: process.env.MONGO_USER,
  pass: process.env.MONGO_PASSWORD,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

app.get('/api', (req, res) => {
  res.json({ message: "Hello, API Connected!" });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});