const mongoose = require('mongoose');
const PointsRecord = require('../models/PointsRecord');
const User = require('../models/User');
const UserService = require('./UserService');

class PointsService {
  // 获取积分记录详情
  async getRecordById(recordId) {
    return await PointsRecord.findById(recordId).populate('userId', 'username email');
  }

  // 获取用户积分汇总统计
  async getUserPointsSummary(userId) {
    const summary = await PointsRecord.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalEarned: { $sum: { $cond: [{ $eq: ['$type', 'earn'] }, '$points', 0] } },
          totalConsumed: { $sum: { $cond: [{ $eq: ['$type', 'consume'] }, '$points', 0] } },
          lastEarn: { $max: { $cond: [{ $eq: ['$type', 'earn'] }, '$createdAt', null] } },
          lastConsume: { $max: { $cond: [{ $eq: ['$type', 'consume'] }, '$createdAt', null] } },
          recordCount: { $sum: 1 }
        }
      }
    ]);

    const user = await UserService.findById(userId);
    const currentBalance = user ? user.points : 0;

    return {
      currentBalance,
      totalEarned: summary[0]?.totalEarned || 0,
      totalConsumed: summary[0]?.totalConsumed || 0,
      lastEarn: summary[0]?.lastEarn || null,
      lastConsume: summary[0]?.lastConsume || null,
      recordCount: summary[0]?.recordCount || 0
    };
  }

  // 获取用户积分记录
  async getUserRecords(userId, type = 'all', page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    
    // 构建查询条件
    const matchQuery = { userId: new mongoose.Types.ObjectId(userId) };
    if (type !== 'all') {
      matchQuery.type = type;
    }
    
    const records = await PointsRecord.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await PointsRecord.countDocuments(matchQuery);

    return {
      records,
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        totalItems: total
      }
    };
  }

  // 获取积分排行榜
  async getLeaderboard(limit = 10) {
    const leaderboard = await PointsRecord.aggregate([
      {
        $group: {
          _id: '$userId',
          totalPoints: { $sum: '$points' }
        }
      },
      { $sort: { totalPoints: -1 } },
      { $limit: limit }
    ]);

    const userIds = leaderboard.map(item => item._id);
    const users = await User.find({ _id: { $in: userIds } }).select('username email');

    return leaderboard.map((item, index) => {
      const user = users.find(u => u._id.toString() === item._id.toString());
      return {
        rank: index + 1,
        user: user ? { username: user.username, email: user.email } : null,
        totalPoints: item.totalPoints
      };
    });
  }

  // 获取系统积分统计
  async getSystemStats() {
    const stats = await PointsRecord.aggregate([
      {
        $group: {
          _id: null,
          totalEarned: { $sum: { $cond: [{ $eq: ['$type', 'earn'] }, '$points', 0] } },
          totalConsumed: { $sum: { $cond: [{ $eq: ['$type', 'consume'] }, '$points', 0] } },
          uniqueUsers: { $addToSet: '$userId' },
          totalTransactions: { $sum: 1 }
        }
      }
    ]);

    const userCount = await User.countDocuments();
    const totalPointsInSystem = await User.aggregate([
      { $group: { _id: null, totalPoints: { $sum: '$points' } } }
    ]);

    return {
      totalEarned: stats[0]?.totalEarned || 0,
      totalConsumed: stats[0]?.totalConsumed || 0,
      uniqueUsers: stats[0]?.uniqueUsers?.length || 0,
      totalTransactions: stats[0]?.totalTransactions || 0,
      totalUsers: userCount,
      totalPointsInSystem: totalPointsInSystem[0]?.totalPoints || 0
    };
  }

  // 获取最近的积分活动
  async getRecentActivities(limit = 20) {
    return await PointsRecord.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'username email')
      .select('points type actionType description createdAt');
  }

  // 按类型获取积分统计
  async getStatsByActionType(startDate, endDate) {
    const matchStage = {};
    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) matchStage.createdAt.$gte = new Date(startDate);
      if (endDate) matchStage.createdAt.$lte = new Date(endDate);
    }

    const stats = await PointsRecord.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$actionType',
          totalPoints: { $sum: '$points' },
          count: { $sum: 1 },
          avgPoints: { $avg: '$points' }
        }
      },
      { $sort: { totalPoints: -1 } }
    ]);

    return stats;
  }

  // 创建积分记录（内部方法）
  async createRecord(recordData) {
    const record = new PointsRecord(recordData);
    await record.save();
    return record;
  }

  // 批量创建积分记录
  async bulkCreateRecords(recordsData) {
    const records = await PointsRecord.insertMany(recordsData);
    return records;
  }

  // 删除积分记录
  async deleteRecord(recordId) {
    const record = await PointsRecord.findByIdAndDelete(recordId);
    if (!record) {
      throw new Error('积分记录不存在');
    }
    return record;
  }

  // 更新积分记录
  async updateRecord(recordId, updateData) {
    const record = await PointsRecord.findByIdAndUpdate(
      recordId,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!record) {
      throw new Error('积分记录不存在');
    }

    return record;
  }
}

module.exports = new PointsService();