const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
  console.log('正在测试MongoDB连接...');
  console.log('MONGODB_URI:', process.env.MONGODB_URI);
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    
    console.log('✅ MongoDB连接成功!');
    
    // 测试创建集合
    const testSchema = new mongoose.Schema({
      name: String,
      createdAt: { type: Date, default: Date.now }
    });
    
    const TestModel = mongoose.model('Test', testSchema);
    
    // 测试插入文档
    const testDoc = new TestModel({ name: 'test' });
    await testDoc.save();
    console.log('✅ 测试文档创建成功');
    
    // 测试查询
    const foundDoc = await TestModel.findOne({ name: 'test' });
    console.log('✅ 测试文档查询成功:', foundDoc._id);
    
    // 清理测试数据
    await TestModel.deleteMany({ name: 'test' });
    console.log('✅ 测试数据清理成功');
    
    await mongoose.connection.close();
    console.log('✅ 连接已关闭');
    
    return true;
  } catch (error) {
    console.error('❌ MongoDB连接失败:', error.message);
    return false;
  }
}

testConnection()
  .then(success => {
    if (success) {
      console.log('🎉 所有测试通过!');
    } else {
      console.log('💡 请检查MongoDB服务是否启动，或者更新.env文件中的连接字符串');
      console.log('💡 你可以使用Docker启动MongoDB: docker run -d -p 27017:27017 mongo:7.0');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试过程中发生错误:', error);
    process.exit(1);
  });