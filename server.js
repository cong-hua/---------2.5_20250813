// 小红书发布插件后端API服务器
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const PaymentFactory = require('./payment');
const { connectDB } = require('./config/database');
const UserService = require('./services/UserService');
const PointsService = require('./services/PointsService');
require('dotenv').config();

const app = express();
const PORT = process.env.SERVER_PORT || 8080;

// 中间件
app.use(cors({
  origin: function (origin, callback) {
    // 允许的来源列表
    const allowedOrigins = [
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      // 生产环境域名（部署时需要替换）
      'https://xhspay.zeabur.app',
      // 允许所有Chrome扩展（开发时）
      'chrome-extension://*'
    ];
    
    // 允许没有 origin 的请求（比如移动端App）
    if (!origin) return callback(null, true);
    
    // 开发环境允许所有来源
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }
    
    // 检查是否在允许列表中
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 数据库连接将在应用启动时建立

// 初始化支付工厂
const paymentFactory = new PaymentFactory();

// 启动服务器函数
const startServer = async () => {
  try {
    // 连接数据库
    await connectDB();
    
    // 启动服务器
    global.server = app.listen(PORT, () => {
      console.log(`服务器运行在端口 ${PORT}`);
      console.log(`API文档: http://localhost:${PORT}/api`);
      console.log(`健康检查: http://localhost:${PORT}/health`);
    }).on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`端口 ${PORT} 已被占用`);
      } else {
        console.error('服务器启动失败:', err);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('启动服务器失败:', error);
    process.exit(1);
  }
};

// JWT中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '缺少访问令牌' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default_secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: '无效的访问令牌' });
    }
    req.user = user;
    next();
  });
};

// ==================== 用户相关API ====================

// 用户注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (!email) {
      return res.status(400).json({ error: '邮箱不能为空' });
    }

    // 创建用户（Service层会自动处理密码加密和注册奖励）
    const user = await UserService.createUser({
      username,
      email,
      phone,
      password
    });

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      success: true,
      message: '用户注册成功',
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        points: user.points,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('用户注册失败:', error);
    if (error.message === '用户名或邮箱已存在') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 用户登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    console.log('登录请求:', { username, passwordLength: password?.length });

    // 验证用户
    const user = await UserService.validateUser(username, password);
    console.log('用户验证结果:', { userId: user?._id, username: user?.username });
    
    // 获取用户积分统计
    const pointsStats = await UserService.getUserPointsStats(user._id);
    console.log('积分统计获取成功');

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    console.log('登录成功，生成token');

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        points: user.points,
        pointsStats,
        lastLoginAt: user.lastLoginAt
      }
    });
  } catch (error) {
    console.error('用户登录失败:', error);
    console.error('错误堆栈:', error.stack);
    if (error.message === '用户不存在' || error.message === '密码错误') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
});

// Token验证接口
app.post('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    const user = await UserService.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        points: user.points
      }
    });
  } catch (error) {
    console.error('Token验证失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 积分相关API ====================

// 获取用户积分信息
app.get('/api/points/info', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // 获取用户积分
    const currentPoints = await UserService.getUserPoints(userId);
    
    // 获取积分统计
    const pointsStats = await UserService.getUserPointsStats(userId);

    res.json({
      success: true,
      points: {
        current: currentPoints,
        totalEarned: pointsStats.totalEarned,
        totalConsumed: pointsStats.totalConsumed,
        recordCount: pointsStats.recordCount
      }
    });
  } catch (error) {
    console.error('获取积分信息失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 创建充值订单
app.post('/api/points/recharge', authenticateToken, async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    const userId = req.user.userId;

    // 验证参数
    if (!amount || amount < 10 || amount > 1000) {
      return res.status(400).json({ error: '充值金额必须在10-1000元之间' });
    }

    if (!['wechat', 'alipay'].includes(paymentMethod)) {
      return res.status(400).json({ error: '不支持的支付方式' });
    }

    // 获取兑换比例
    const exchangeRate = parseFloat(process.env.POINTS_EXCHANGE_RATE) || 10;
    const points = Math.floor(amount * exchangeRate);

    // 生成订单ID
    const orderId = `XHS_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    // 创建支付订单
    const orderData = paymentFactory.formatOrderData({
      orderId,
      amount,
      subject: '小红书插件积分充值',
      description: `充值 ${amount} 元获得 ${points} 积分`
    });

    const paymentResult = await paymentFactory.createPayment(paymentMethod, orderData);

    res.json({
      success: true,
      orderId,
      amount,
      points,
      paymentUrl: paymentResult.paymentUrl,
      qrCode: paymentResult.qrCode,
      paymentType: paymentResult.paymentType,
      message: '订单创建成功'
    });
  } catch (error) {
    console.error('创建充值订单失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 积分扣费API
app.post('/api/points/deduct', authenticateToken, async (req, res) => {
  try {
    const { points, actionType = 'other', description = '消费积分', noteId = '' } = req.body;
    const userId = req.user.userId;

    if (!points || points <= 0) {
      return res.status(400).json({ error: '扣费积分必须大于0' });
    }

    // 获取当前积分
    const beforePoints = await UserService.getUserPoints(userId);

    // 扣除积分
    const metadata = { noteId };
    const afterPoints = await UserService.deductPoints(userId, points, actionType, description, metadata);

    res.json({
      success: true,
      message: '积分扣费成功',
      beforePoints,
      afterPoints,
      deductedPoints: points
    });
  } catch (error) {
    console.error('积分扣费失败:', error);
    if (error.message === '积分不足' || error.message === '用户不存在') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
});

// 获取积分记录
app.get('/api/points/records', authenticateToken, async (req, res) => {
  try {
    const { type = 'all', page = 1, limit = 20 } = req.query;
    const userId = req.user.userId;
    
    // 使用PointsService获取积分记录
    const PointsService = require('./services/PointsService');
    const pointsService = new PointsService();
    
    const records = await pointsService.getUserRecords(userId, type, page, limit);

    res.json({
      success: true,
      records,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: records.length
      }
    });
  } catch (error) {
    console.error('获取积分记录失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 支付相关函数 ====================

// ==================== 支付回调 ====================

// 微信支付回调
app.post('/api/payment/wechat/notify', async (req, res) => {
  try {
    // 验证签名
    if (!paymentFactory.verifyNotify('wechat', req.body)) {
      console.error('微信支付回调签名验证失败');
      return res.json({ return_code: 'FAIL', return_msg: '签名验证失败' });
    }

    // 处理微信支付回调
    const { out_trade_no, transaction_id, total_fee, trade_state } = req.body;

    if (trade_state === 'SUCCESS') {
      await handlePaymentSuccess(out_trade_no, transaction_id, 'wechat');
      res.json({ return_code: 'SUCCESS', return_msg: 'OK' });
    } else {
      res.json({ return_code: 'FAIL', return_msg: '支付失败' });
    }
  } catch (error) {
    console.error('微信支付回调处理失败:', error);
    res.json({ return_code: 'FAIL', return_msg: '处理失败' });
  }
});

// 支付宝支付回调
app.post('/api/payment/alipay/notify', async (req, res) => {
  try {
    // 验证签名
    if (!paymentFactory.verifyNotify('alipay', req.body)) {
      console.error('支付宝回调签名验证失败');
      return res.send('fail');
    }

    // 处理支付宝回调
    const { out_trade_no, trade_no, trade_status } = req.body;

    if (trade_status === 'TRADE_SUCCESS') {
      await handlePaymentSuccess(out_trade_no, trade_no, 'alipay');
      res.send('success');
    } else {
      res.send('fail');
    }
  } catch (error) {
    console.error('支付宝回调处理失败:', error);
    res.send('fail');
  }
});

// 处理支付成功
async function handlePaymentSuccess(orderId, transactionId, paymentMethod) {
  const connection = await pool.getConnection();
  await connection.beginTransaction();

  try {
    // 查找充值记录
    const [rechargeRecords] = await connection.execute(
      'SELECT * FROM recharge_records WHERE order_id = ? AND payment_status = "pending"',
      [orderId]
    );

    if (rechargeRecords.length === 0) {
      throw new Error('充值记录不存在或已处理');
    }

    const record = rechargeRecords[0];

    // 更新充值记录状态
    await connection.execute(
      'UPDATE recharge_records SET payment_status = "success", transaction_id = ? WHERE id = ?',
      [transactionId, record.id]
    );

    // 获取用户当前积分
    const [users] = await connection.execute(
      'SELECT current_points, total_recharged_points FROM users WHERE id = ?',
      [record.user_id]
    );

    if (users.length === 0) {
      throw new Error('用户不存在');
    }

    const user = users[0];
    const beforePoints = user.current_points;
    const afterPoints = beforePoints + record.points;

    // 更新用户积分
    await connection.execute(
      'UPDATE users SET current_points = ?, total_recharged_points = ? WHERE id = ?',
      [afterPoints, user.total_recharged_points + record.points, record.user_id]
    );

    // 创建积分变动日志
    await connection.execute(
      'INSERT INTO points_logs (user_id, change_type, points_change, before_points, after_points, reference_id, reference_type, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [record.user_id, 'recharge', record.points, beforePoints, afterPoints, record.id, 'recharge', `充值 ${record.amount} 元`]
    );

    await connection.commit();
    console.log(`支付成功处理完成: 订单 ${orderId}, 用户 ${record.user_id} 获得 ${record.points} 积分`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ==================== 系统配置API ====================

// 获取系统配置
app.get('/api/config', async (req, res) => {
  try {
    const [configs] = await pool.execute(
      'SELECT config_key, config_value FROM system_config'
    );

    const configObj = {};
    configs.forEach(config => {
      configObj[config.config_key] = config.config_value;
    });

    res.json({
      success: true,
      config: configObj
    });
  } catch (error) {
    console.error('获取系统配置失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== MVP路由别名 ====================

// 积分查询别名 - 复用现有的 /api/points/info
app.get('/api/points', authenticateToken, async (req, res) => {
  try {
    // 使用UserService获取用户积分
    const currentPoints = await UserService.getUserPoints(req.user.userId);
    const pointsStats = await UserService.getUserPointsStats(req.user.userId);
    
    res.json({
      success: true,
      points: {
        current: currentPoints,
        totalConsumed: pointsStats.totalConsumed || 0,
        totalRecharged: pointsStats.totalEarned || 0
      }
    });
  } catch (error) {
    console.error('获取积分信息失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 积分消费别名 - 复用现有的 /api/points/deduct
app.post('/api/points/use', authenticateToken, async (req, res) => {
  try {
    const { points, actionType = 'other', description = '消费积分' } = req.body;
    const userId = req.user.userId;

    if (!points || points <= 0) {
      return res.status(400).json({ error: '扣费积分必须大于0' });
    }

    // 获取当前积分
    const beforePoints = await UserService.getUserPoints(userId);

    // 扣除积分
    const afterPoints = await UserService.deductPoints(userId, points, actionType, description);

    res.json({
      success: true,
      beforePoints,
      afterPoints,
      deductedPoints: points
    });
  } catch (error) {
    console.error('积分消费失败:', error);
    if (error.message === '积分不足' || error.message === '用户不存在') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
});

// 支付占位接口
app.post('/api/pay/checkout', authenticateToken, async (req, res) => {
  res.json({ success: true, message: '支付开发中' });
});

// 插件桥接页面
app.get('/ext/bridge', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>插件连接</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin: 0;
                padding: 0;
                min-height: 100vh;
                display: flex;
                justify-content: center;
                align-items: center;
                color: white;
            }
            .container {
                text-align: center;
                background: rgba(255, 255, 255, 0.1);
                padding: 40px;
                border-radius: 20px;
                backdrop-filter: blur(10px);
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
            }
            h1 {
                margin: 0 0 20px 0;
                font-size: 28px;
                font-weight: 300;
            }
            .icon {
                font-size: 64px;
                margin-bottom: 20px;
            }
            .status {
                font-size: 18px;
                margin-bottom: 30px;
                opacity: 0.9;
            }
            .close-btn {
                background: rgba(255, 255, 255, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.3);
                color: white;
                padding: 12px 30px;
                border-radius: 25px;
                cursor: pointer;
                font-size: 16px;
                transition: all 0.3s ease;
            }
            .close-btn:hover {
                background: rgba(255, 255, 255, 0.3);
                transform: translateY(-2px);
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="icon">✓</div>
            <h1>插件已连接</h1>
            <div class="status" id="status">正在同步登录状态...</div>
            <button class="close-btn" onclick="window.close()">关闭页面</button>
        </div>
        
        <script>
            const token = new URLSearchParams(window.location.hash.slice(1)).get('t');
            if (token) {
                // 保存token到localStorage
                localStorage.setItem('token', token);
                
                // 尝试发送token到插件
                try {
                    if (window.chrome && window.chrome.runtime) {
                        // 获取插件ID（需要根据实际情况调整）
                        const extensionId = 'YOUR_EXTENSION_ID'; // 需要替换为实际插件ID
                        chrome.runtime.sendMessage(extensionId, {
                            type: 'SET_AUTH_TOKEN',
                            token: token
                        });
                    }
                } catch (error) {
                    console.log('插件通信失败，但不影响使用');
                }
                
                // 更新状态
                document.getElementById('status').textContent = '登录状态已同步，可以关闭此页面';
                
                // 清空URL中的token
                if (window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            } else {
                document.getElementById('status').textContent = '未检测到登录信息，请重新操作';
            }
            
            // 3秒后自动尝试关闭页面
            setTimeout(() => {
                window.close();
            }, 3000);
        </script>
    </body>
    </html>
  `);
});

// 仪表板页面
app.get('/dashboard', authenticateToken, async (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>用户中心 - 小红书插件</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: #f5f5f5;
                min-height: 100vh;
            }
            
            .header {
                background: white;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                padding: 0 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                height: 70px;
            }
            
            .logo {
                font-size: 24px;
                font-weight: 600;
                color: #ff6b6b;
            }
            
            .user-info {
                display: flex;
                align-items: center;
                gap: 15px;
            }
            
            .user-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: #ff6b6b;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: 600;
            }
            
            .container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 40px 20px;
            }
            
            .hero {
                background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%);
                color: white;
                padding: 60px 40px;
                border-radius: 20px;
                margin-bottom: 40px;
                text-align: center;
            }
            
            .hero h1 {
                font-size: 36px;
                margin-bottom: 20px;
            }
            
            .hero p {
                font-size: 18px;
                opacity: 0.9;
                max-width: 600px;
                margin: 0 auto;
                line-height: 1.6;
            }
            
            .card {
                background: white;
                border-radius: 15px;
                padding: 30px;
                box-shadow: 0 5px 20px rgba(0,0,0,0.1);
                margin-bottom: 30px;
            }
            
            .card h2 {
                color: #333;
                margin-bottom: 20px;
                font-size: 24px;
            }
            
            .points-display {
                font-size: 48px;
                font-weight: 700;
                color: #ff6b6b;
                text-align: center;
                margin: 30px 0;
            }
            
            .action-buttons {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-top: 30px;
            }
            
            .btn {
                padding: 15px 25px;
                border: none;
                border-radius: 10px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
                text-decoration: none;
                display: inline-block;
                text-align: center;
            }
            
            .btn-primary {
                background: #ff6b6b;
                color: white;
            }
            
            .btn-primary:hover {
                background: #ff5252;
                transform: translateY(-2px);
            }
            
            .btn-secondary {
                background: #f8f9fa;
                color: #333;
                border: 2px solid #e9ecef;
            }
            
            .btn-secondary:hover {
                background: #e9ecef;
            }
            
            .features {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 30px;
                margin-top: 40px;
            }
            
            .feature {
                text-align: center;
                padding: 30px;
                border-radius: 15px;
                background: white;
                box-shadow: 0 5px 20px rgba(0,0,0,0.1);
            }
            
            .feature-icon {
                font-size: 48px;
                margin-bottom: 20px;
            }
            
            .feature h3 {
                color: #333;
                margin-bottom: 15px;
                font-size: 20px;
            }
            
            .feature p {
                color: #666;
                line-height: 1.6;
            }
            
            .logout-btn {
                background: #dc3545;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
            }
            
            .logout-btn:hover {
                background: #c82333;
            }
        </style>
    </head>
    <body>
        <header class="header">
            <div class="logo">小红书插件</div>
            <div class="user-info">
                <span id="username">用户名</span>
                <div class="user-avatar" id="avatar">U</div>
                <button class="logout-btn" onclick="logout()">退出登录</button>
            </div>
        </header>
        
        <div class="container">
            <div class="hero">
                <h1>欢迎使用小红书插件</h1>
                <p>专业的自动化发布工具，让您的内容管理更加高效。支持定时发布、批量操作、数据分析等功能。</p>
            </div>
            
            <div class="card">
                <h2>我的积分</h2>
                <div class="points-display" id="points">0</div>
                <div class="action-buttons">
                    <a href="#" class="btn btn-primary" onclick="recharge()">充值积分</a>
                    <a href="#" class="btn btn-secondary" onclick="viewRecords()">查看记录</a>
                </div>
            </div>
            
            <div class="features">
                <div class="feature">
                    <div class="feature-icon">📝</div>
                    <h3>智能发布</h3>
                    <p>支持定时发布、批量发布，让内容管理更加高效智能。</p>
                </div>
                <div class="feature">
                    <div class="feature-icon">📊</div>
                    <h3>数据分析</h3>
                    <p>详细的数据统计和分析，帮助您了解内容表现。</p>
                </div>
                <div class="feature">
                    <div class="feature-icon">🔧</div>
                    <h3>插件配置</h3>
                    <p>灵活的配置选项，满足不同用户的需求。</p>
                </div>
            </div>
        </div>

        <script>
            const API_BASE = '/api';
            
            // 检查登录状态
            function checkAuth() {
                const token = localStorage.getItem('token');
                const user = localStorage.getItem('user');
                
                if (!token || !user) {
                    window.location.href = '/';
                    return;
                }
                
                const userData = JSON.parse(user);
                document.getElementById('username').textContent = userData.username;
                document.getElementById('avatar').textContent = userData.username.charAt(0).toUpperCase();
                
                // 获取用户积分
                fetchUserPoints(token);
            }
            
            // 获取用户积分
            async function fetchUserPoints(token) {
                try {
                    const response = await fetch(\`\${API_BASE}/points/info\`, {
                        headers: {
                            'Authorization': \`Bearer \${token}\`
                        }
                    });
                    
                    const data = await response.json();
                    if (response.ok && data.success) {
                        document.getElementById('points').textContent = data.points.current;
                    }
                } catch (error) {
                    console.error('获取积分失败:', error);
                }
            }
            
            // 充值积分
            function recharge() {
                alert('充值功能开发中，敬请期待！');
            }
            
            // 查看记录
            function viewRecords() {
                alert('记录查看功能开发中，敬请期待！');
            }
            
            // 退出登录
            function logout() {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/';
            }
            
            // 页面加载时检查登录状态
            window.addEventListener('DOMContentLoaded', checkAuth);
        </script>
    </body>
    </html>
  `);
});

// 根路径重定向到登录页面
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>小红书插件 - 用户中心</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }
            
            .container {
                background: white;
                border-radius: 20px;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
                overflow: hidden;
                width: 100%;
                max-width: 800px;
                min-height: 500px;
                display: flex;
            }
            
            .hero {
                flex: 1;
                background: linear-gradient(135deg, #ff6b6b 0%, #ff8e8e 100%);
                color: white;
                padding: 40px;
                display: flex;
                flex-direction: column;
                justify-content: center;
                position: relative;
                overflow: hidden;
            }
            
            .hero::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"/></svg>');
                opacity: 0.1;
            }
            
            .hero h1 {
                font-size: 32px;
                margin-bottom: 20px;
                position: relative;
                z-index: 1;
            }
            
            .hero p {
                font-size: 16px;
                line-height: 1.6;
                opacity: 0.9;
                position: relative;
                z-index: 1;
            }
            
            .form-container {
                flex: 1;
                padding: 40px;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
            
            .tabs {
                display: flex;
                margin-bottom: 30px;
                border-bottom: 2px solid #f0f0f0;
            }
            
            .tab {
                flex: 1;
                padding: 15px;
                text-align: center;
                cursor: pointer;
                border: none;
                background: none;
                font-size: 16px;
                color: #666;
                transition: all 0.3s ease;
            }
            
            .tab.active {
                color: #ff6b6b;
                border-bottom: 2px solid #ff6b6b;
                margin-bottom: -2px;
            }
            
            .form {
                display: none;
            }
            
            .form.active {
                display: block;
            }
            
            .form-group {
                margin-bottom: 20px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 8px;
                color: #333;
                font-weight: 500;
            }
            
            .form-group input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                font-size: 16px;
                transition: border-color 0.3s ease;
            }
            
            .form-group input:focus {
                outline: none;
                border-color: #ff6b6b;
            }
            
            .btn {
                width: 100%;
                padding: 14px;
                background: #ff6b6b;
                color: white;
                border: none;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: background 0.3s ease;
            }
            
            .btn:hover {
                background: #ff5252;
            }
            
            .btn:disabled {
                background: #ccc;
                cursor: not-allowed;
            }
            
            .alert {
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 20px;
                font-size: 14px;
                display: none;
            }
            
            .alert.success {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            
            .alert.error {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
            
            .loading {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 2px solid #ffffff;
                border-radius: 50%;
                border-top-color: transparent;
                animation: spin 1s ease-in-out infinite;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="hero">
                <h1>小红书插件</h1>
                <p>专业的自动化发布工具，让您的内容管理更加高效。支持定时发布、批量操作、数据分析等功能。</p>
            </div>
            <div class="form-container">
                <div class="tabs">
                    <button class="tab active" onclick="switchTab('login')">登录</button>
                    <button class="tab" onclick="switchTab('register')">注册</button>
                </div>
                
                <div class="alert" id="alert"></div>
                
                <!-- 登录表单 -->
                <form class="form active" id="login-form" onsubmit="handleLogin(event)">
                    <div class="form-group">
                        <label>用户名</label>
                        <input type="text" id="login-username" required>
                    </div>
                    <div class="form-group">
                        <label>密码</label>
                        <input type="password" id="login-password" required>
                    </div>
                    <button type="submit" class="btn" id="login-btn">登录</button>
                </form>
                
                <!-- 注册表单 -->
                <form class="form" id="register-form" onsubmit="handleRegister(event)">
                    <div class="form-group">
                        <label>用户名</label>
                        <input type="text" id="register-username" required>
                    </div>
                    <div class="form-group">
                        <label>邮箱</label>
                        <input type="email" id="register-email" required>
                    </div>
                    <div class="form-group">
                        <label>密码</label>
                        <input type="password" id="register-password" required>
                    </div>
                    <button type="submit" class="btn" id="register-btn">注册</button>
                </form>
            </div>
        </div>

        <script>
            const API_BASE = '/api';
            
            function switchTab(tab) {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.form').forEach(f => f.classList.remove('active'));
                
                if (tab === 'login') {
                    document.querySelectorAll('.tab')[0].classList.add('active');
                    document.getElementById('login-form').classList.add('active');
                } else {
                    document.querySelectorAll('.tab')[1].classList.add('active');
                    document.getElementById('register-form').classList.add('active');
                }
                
                hideAlert();
            }
            
            function showAlert(message, type) {
                const alert = document.getElementById('alert');
                alert.textContent = message;
                alert.className = \`alert \${type}\`;
                alert.style.display = 'block';
            }
            
            function hideAlert() {
                document.getElementById('alert').style.display = 'none';
            }
            
            async function handleLogin(event) {
                event.preventDefault();
                
                const username = document.getElementById('login-username').value;
                const password = document.getElementById('login-password').value;
                const btn = document.getElementById('login-btn');
                
                btn.disabled = true;
                btn.innerHTML = '<span class="loading"></span> 登录中...';
                
                try {
                    const response = await fetch(\`\${API_BASE}/auth/login\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ username, password })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok && data.success) {
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('user', JSON.stringify(data.user));
                        showAlert('登录成功！正在跳转...', 'success');
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 1500);
                    } else {
                        showAlert(data.error || '登录失败', 'error');
                    }
                } catch (error) {
                    showAlert('网络错误，请稍后重试', 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = '登录';
                }
            }
            
            async function handleRegister(event) {
                event.preventDefault();
                
                const username = document.getElementById('register-username').value;
                const email = document.getElementById('register-email').value;
                const password = document.getElementById('register-password').value;
                const btn = document.getElementById('register-btn');
                
                btn.disabled = true;
                btn.innerHTML = '<span class="loading"></span> 注册中...';
                
                try {
                    const response = await fetch(\`\${API_BASE}/auth/register\`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ username, email, password })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok && data.success) {
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('user', JSON.stringify(data.user));
                        showAlert('注册成功！正在跳转...', 'success');
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 1500);
                    } else {
                        showAlert(data.error || '注册失败', 'error');
                    }
                } catch (error) {
                    showAlert('网络错误，请稍后重试', 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = '注册';
                }
            }
            
            // 检查是否已登录
            window.addEventListener('DOMContentLoaded', () => {
                const token = localStorage.getItem('token');
                const user = localStorage.getItem('user');
                
                if (token && user) {
                    // 验证token是否有效
                    fetch(\`\${API_BASE}/auth/verify\`, {
                        headers: {
                            'Authorization': \`Bearer \${token}\`
                        }
                    })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            window.location.href = '/dashboard';
                        } else {
                            localStorage.removeItem('token');
                            localStorage.removeItem('user');
                        }
                    })
                    .catch(() => {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                    });
                }
            });
        </script>
    </body>
    </html>
  `);
});

// 静态文件服务
app.use(express.static('public'));

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({ error: '服务器内部错误' });
});

// 健康检查 endpoint
app.get('/health', (req, res) => {
  const dbStatus = global.mongoConnected ? 'connected' : 'disconnected';
  res.json({ 
    status: 'ok', 
    mongodb: dbStatus,
    message: '服务器正常运行',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 启动服务器
startServer();

// 优雅关闭
const gracefulShutdown = async (signal) => {
  console.log(`收到 ${signal} 信号，正在关闭服务器...`);
  
  try {
    // 关闭数据库连接
    const { disconnectDB } = require('./config/database');
    await disconnectDB();
    
    // 关闭服务器
    if (global.server) {
      global.server.close(() => {
        console.log('服务器已关闭');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error('关闭服务器时出错:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
