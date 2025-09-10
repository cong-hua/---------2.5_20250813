const mongoose = require('mongoose');

const connectDB = async () => {
  // 如果没有配置MongoDB URI，跳过连接
  if (!process.env.MONGODB_URI || process.env.MONGODB_URI === 'mongodb://localhost:27017/xiaohongshu_plugin_test') {
    console.log('⚠️  MongoDB未配置或使用测试数据库，跳过数据库连接');
    console.log('💡 要启用数据库功能，请设置有效的MONGODB_URI环境变量');
    global.mongoConnected = false;
    return null;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log(`MongoDB 连接成功: ${conn.connection.host}`);
    global.mongoConnected = true;
    
    // 监听连接事件
    mongoose.connection.on('error', (err) => {
      console.error('MongoDB 连接错误:', err);
      global.mongoConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB 连接断开');
      global.mongoConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB 重新连接成功');
      global.mongoConnected = true;
    });

    return conn;
  } catch (error) {
    console.error('MongoDB 连接失败:', error);
    console.log('💡 继续运行，但数据库功能将不可用');
    global.mongoConnected = false;
    return null;
  }
};

const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB 连接已关闭');
  } catch (error) {
    console.error('关闭 MongoDB 连接时出错:', error);
  }
};

module.exports = { connectDB, disconnectDB };