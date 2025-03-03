import express from 'express';
import { User } from '../model/User.js';
import { protect, isAdmin } from '../middleware/auth.js';

const router = express.Router();

router.put('/change/:employeeId', protect, isAdmin, async (req, res) => {
  const { employeeId } = req.params;
  const { role } = req.body;

  try {
    if (!role) {
      return res.status(400).json({ status: 'error', message: 'Role is required' });
    }
    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ status: 'error', message: "Invalid role. Must be 'user' or 'admin'" });
    }

    const user = await User.findOne({ employeeId });
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      status: 'success',
      message: 'User role updated successfully',
      data: { employeeId: user.employeeId, role: user.role },
    });
  } catch (error) {
    console.error('Update role error:', error.stack);
    res.status(500).json({ status: 'error', message: 'Server error' });
  }
});

export default router;