const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  points: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLoginAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 索引
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });
userSchema.index({ points: -1 });

// 密码加密中间件
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// 更新时间中间件
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// 实例方法：验证密码
userSchema.methods.validatePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// 实例方法：添加积分
userSchema.methods.addPoints = async function(points) {
  this.points += points;
  return this.save();
};

// 实例方法：扣除积分
userSchema.methods.deductPoints = async function(points) {
  if (this.points < points) {
    throw new Error('积分不足');
  }
  this.points -= points;
  return this.save();
};

// 静态方法：查找活跃用户
userSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

module.exports = mongoose.model('User', userSchema);