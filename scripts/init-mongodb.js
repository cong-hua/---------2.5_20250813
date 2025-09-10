const mongoose = require('mongoose');
const { connectDB } = require('../config/database');
const User = require('../models/User');
const PointsRecord = require('../models/PointsRecord');
require('dotenv').config();

class DatabaseInit {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    try {
      await connectDB();
      this.isConnected = true;
      console.log('数据库连接成功');
    } catch (error) {
      console.error('数据库连接失败:', error);
      throw error;
    }
  }

  async createIndexes() {
    try {
      console.log('创建数据库索引...');
      
      // 用户集合索引
      await User.collection.createIndex({ username: 1 }, { unique: true });
      await User.collection.createIndex({ email: 1 }, { unique: true });
      await User.collection.createIndex({ points: -1 });
      await User.collection.createIndex({ createdAt: -1 });
      
      // 积分记录集合索引
      await PointsRecord.collection.createIndex({ userId: 1, createdAt: -1 });
      await PointsRecord.collection.createIndex({ type: 1, createdAt: -1 });
      await PointsRecord.collection.createIndex({ actionType: 1, createdAt: -1 });
      
      console.log('索引创建完成');
    } catch (error) {
      console.error('创建索引失败:', error);
      throw error;
    }
  }

  async createTestData() {
    try {
      console.log('创建测试数据...');
      
      // 检查是否已存在测试用户
      const existingUser = await User.findOne({ username: 'testuser' });
      if (existingUser) {
        console.log('测试用户已存在，跳过创建');
        return;
      }

      // 创建测试用户
      const testUser = new User({
        username: 'testuser',
        email: 'test@example.com',
        password: '123456',
        points: 100
      });
      
      await testUser.save();
      console.log('测试用户创建成功:', testUser.username);
      
      // 创建测试积分记录
      const testRecords = [
        {
          userId: testUser._id,
          points: 100,
          type: 'earn',
          actionType: 'recharge',
          description: '初始充值',
          balance: 100
        },
        {
          userId: testUser._id,
          points: -10,
          type: 'consume',
          actionType: 'publish_note',
          description: '发布笔记',
          balance: 90
        },
        {
          userId: testUser._id,
          points: 20,
          type: 'earn',
          actionType: 'daily_bonus',
          description: '每日签到奖励',
          balance: 110
        }
      ];
      
      await PointsRecord.insertMany(testRecords);
      console.log('测试积分记录创建完成');
      
    } catch (error) {
      console.error('创建测试数据失败:', error);
      throw error;
    }
  }

  async validateSchema() {
    try {
      console.log('验证数据结构...');
      
      // 验证用户模型
      const userCount = await User.countDocuments();
      console.log(`用户集合文档数量: ${userCount}`);
      
      // 验证积分记录模型
      const recordCount = await PointsRecord.countDocuments();
      console.log(`积分记录集合文档数量: ${recordCount}`);
      
      // 验证索引
      const userIndexes = await User.listIndexes();
      console.log('用户集合索引:', userIndexes.map(idx => idx.key));
      
      const recordIndexes = await PointsRecord.listIndexes();
      console.log('积分记录集合索引:', recordIndexes.map(idx => idx.key));
      
      console.log('数据结构验证完成');
    } catch (error) {
      console.error('验证数据结构失败:', error);
      throw error;
    }
  }

  async cleanup() {
    try {
      console.log('清理数据库...');
      
      // 清理所有数据（如果需要完全重置）
      if (process.env.CLEANUP_ALL_DATA === 'true') {
        await User.deleteMany({});
        await PointsRecord.deleteMany({});
        console.log('所有数据清理完成');
      }
      
      // 清理测试数据（可选）
      if (process.env.CLEANUP_TEST_DATA === 'true') {
        await User.deleteMany({ username: 'testuser' });
        await PointsRecord.deleteMany({ description: { $in: ['初始充值', '发布笔记', '每日签到奖励'] } });
        console.log('测试数据清理完成');
      }
    } catch (error) {
      console.error('清理数据库失败:', error);
    }
  }

  async init(options = {}) {
    const { createTestData = false, cleanup = false } = options;
    
    try {
      console.log('开始初始化数据库...');
      
      // 连接数据库
      await this.connect();
      
      // 清理数据（如果需要）
      if (cleanup) {
        await this.cleanup();
      }
      
      // 创建索引
      await this.createIndexes();
      
      // 验证数据结构
      await this.validateSchema();
      
      // 创建测试数据（如果需要）
      if (createTestData) {
        await this.createTestData();
      }
      
      console.log('数据库初始化完成！');
      
    } catch (error) {
      console.error('数据库初始化失败:', error);
      throw error;
    }
  }
}

// 命令行执行
if (require.main === module) {
  const init = new DatabaseInit();
  
  const options = {
    createTestData: process.argv.includes('--with-test-data'),
    cleanup: process.argv.includes('--cleanup'),
    cleanupAllData: process.argv.includes('--cleanup-all')
  };
  
  if (options.cleanupAllData) {
    process.env.CLEANUP_ALL_DATA = 'true';
  }
  
  init.init(options)
    .then(() => {
      console.log('初始化成功完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('初始化失败:', error);
      process.exit(1);
    });
}

module.exports = DatabaseInit;