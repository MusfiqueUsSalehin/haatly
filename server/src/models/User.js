import mongoose from 'mongoose';
import { ROLES, STATUSES } from '../constants/roles.js';

const BD_MOBILE = /^\+8801[3-9]\d{8}$/;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: {
      type: String,
      required: true,
      trim: true,
      match: [BD_MOBILE, 'phone must be a Bangladesh mobile number like +8801712345678'],
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    status: { type: String, enum: STATUSES, required: true },
    // Set when an admin approves or suspends the account.
    statusReason: { type: String, trim: true, maxlength: 300 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, status: 1 });

userSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
