const mongoose = require('mongoose');
const User = require('../models/User');
const PointsRecord = require('../models/PointsRecord');

class UserService {
  // 检查数据库连接
  checkDBConnection() {
    if (!mongoose.connection.readyState || mongoose.connection.readyState === 0) {
      throw new Error('数据库未连接，请检查MongoDB配置');
    }
  }

  // 创建用户
  async createUser(userData) {
    try {
      this.checkDBConnection();
      
      const user = new User(userData);
      await user.save();
      
      // 创建注册奖励积分记录
      await PointsRecord.create({
        userId: user._id,
        points: 10, // 注册奖励10积分
        type: 'earn',
        actionType: 'registration_bonus',
        description: '注册奖励',
        balance: user.points
      });

      return user;
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('用户名或邮箱已存在');
      }
      if (error.message === '数据库未连接，请检查MongoDB配置') {
        throw error;
      }
      throw error;
    }
  }

  // 根据用户名查找用户
  async findByUsername(username) {
    return await User.findOne({ username });
  }

  // 根据邮箱查找用户
  async findByEmail(email) {
    return await User.findOne({ email });
  }

  // 根据ID查找用户
  async findById(userId) {
    return await User.findById(userId);
  }

  // 验证用户登录
  async validateUser(username, password) {
    console.log('UserService.validateUser 开始验证用户:', username);
    console.log('数据库连接状态:', mongoose.connection.readyState);
    
    const user = await this.findByUsername(username);
    if (!user) {
      console.log('用户不存在:', username);
      throw new Error('用户不存在');
    }

    console.log('找到用户，开始验证密码');
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      console.log('密码验证失败');
      throw new Error('密码错误');
    }

    console.log('密码验证成功，更新登录时间');
    // 更新最后登录时间
    user.lastLoginAt = new Date();
    await user.save();

    console.log('用户验证成功:', user.username);
    return user;
  }

  // 获取用户积分
  async getUserPoints(userId) {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }
    return user.points;
  }

  // 获取用户积分统计
  async getUserPointsStats(userId) {
    try {
      const stats = await PointsRecord.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            totalEarned: { $sum: { $cond: [{ $eq: ['$type', 'earn'] }, '$points', 0] } },
            totalConsumed: { $sum: { $cond: [{ $eq: ['$type', 'consume'] }, '$points', 0] } },
            recordCount: { $sum: 1 }
          }
        }
      ]);

      return stats[0] || { totalEarned: 0, totalConsumed: 0, recordCount: 0 };
    } catch (error) {
      console.error('获取用户积分统计失败:', error);
      return { totalEarned: 0, totalConsumed: 0, recordCount: 0 };
    }
  }

  // 获取用户积分记录
  async getUserPointsRecords(userId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const records = await PointsRecord.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await PointsRecord.countDocuments({ userId });

    return {
      records,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        totalItems: total
      }
    };
  }

  // 添加积分
  async addPoints(userId, points, actionType, description, metadata = {}) {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    const oldBalance = user.points;
    await user.addPoints(points);

    // 创建积分记录
    await PointsRecord.create({
      userId,
      points,
      type: 'earn',
      actionType,
      description,
      balance: user.points,
      metadata
    });

    return user.points;
  }

  // 扣除积分
  async deductPoints(userId, points, actionType, description, metadata = {}) {
    const user = await this.findById(userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    if (user.points < points) {
      throw new Error('积分不足');
    }

    const oldBalance = user.points;
    await user.deductPoints(points);

    // 创建积分记录
    await PointsRecord.create({
      userId,
      points: -points,
      type: 'consume',
      actionType,
      description,
      balance: user.points,
      metadata
    });

    return user.points;
  }

  // 更新用户信息
  async updateUser(userId, updateData) {
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!user) {
      throw new Error('用户不存在');
    }

    return user;
  }

  // 删除用户
  async deleteUser(userId) {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      throw new Error('用户不存在');
    }

    // 删除相关的积分记录
    await PointsRecord.deleteMany({ userId });

    return user;
  }

  // 获取所有用户（管理员功能）
  async getAllUsers(page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments();

    return {
      users,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        totalItems: total
      }
    };
  }
}

module.exports = new UserService();