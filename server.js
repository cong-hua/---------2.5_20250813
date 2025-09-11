// 小红书发布插件后端API服务器
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const PaymentFactory = require('./payment');
const { connectDB } = require('./config/database');
const UserService = require('./services/UserService');
const PointsService = require('./services/PointsService');
const PointsOrderService = require('./services/PointsOrderService');
require('dotenv').config();

const app = express();
const PORT = process.env.SERVER_PORT || 8080;

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https:", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// 限流中间件
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 5, // 限制每个IP 15分钟内最多5次登录/注册尝试
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

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
  credentials: false // 方案B不需要credentials
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
app.post('/api/auth/register', authLimiter, async (req, res) => {
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
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    console.log('=== 登录请求开始 ===');
    console.log('时间:', new Date().toISOString());
    console.log('用户名:', username);
    console.log('密码长度:', password?.length);
    console.log('数据库连接状态:', global.mongoConnected);

    // 验证用户
    const user = await UserService.validateUser(username, password);
    console.log('用户验证结果:', { 
      userId: user?._id, 
      username: user?.username,
      email: user?.email,
      points: user?.points 
    });
    
    // 获取用户积分统计（延迟到dashboard页面再获取以减少登录延迟）
    const pointsStats = { totalEarned: 0, totalConsumed: 0, recordCount: 0 };
    console.log('登录成功，积分统计将延迟加载');

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    console.log('登录成功，生成token完成');
    console.log('=== 登录请求结束 ===');

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
    console.error('=== 登录失败 ===');
    console.error('时间:', new Date().toISOString());
    console.error('用户名:', username);
    console.error('错误类型:', error.constructor.name);
    console.error('错误信息:', error.message);
    console.error('错误堆栈:', error.stack);
    console.error('数据库连接状态:', global.mongoConnected);
    console.error('===============');
    
    if (error.message === '用户不存在' || error.message === '密码错误') {
      res.status(400).json({ error: error.message });
    } else {
      res.status(500).json({ error: '服务器内部错误' });
    }
  }
});

// 获取当前用户信息接口 (支持GET和POST)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await UserService.findById(req.user.userId);
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
    console.error('获取用户信息失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 兼容旧的POST接口
app.post('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await UserService.findById(req.user.userId);
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
    console.error('获取用户信息失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 兼容旧的verify接口 (重定向到me)
app.post('/api/auth/verify', authenticateToken, async (req, res) => {
  try {
    const user = await UserService.findById(req.user.userId);
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
    const result = await PointsService.getUserRecords(userId, type, page, limit);

    res.json({
      success: true,
      records: result.records,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('获取积分记录失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取用户积分统计
app.get('/api/points/stats', authenticateToken, async (req, res) => {
  try {
    const summary = await PointsService.getUserPointsSummary(req.user.userId);
    
    res.json({
      success: true,
      points: {
        current: summary.currentBalance,
        totalEarned: summary.totalEarned,
        totalConsumed: summary.totalConsumed,
        lastEarn: summary.lastEarn,
        lastConsume: summary.lastConsume,
        recordCount: summary.recordCount
      }
    });
  } catch (error) {
    console.error('获取积分统计失败:', error);
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
  // TODO: 实现MongoDB版本的支付成功处理逻辑
  // 这里需要创建充值记录模型和处理逻辑
  console.log(`支付成功处理完成: 订单 ${orderId}, 交易号 ${transactionId}, 支付方式 ${paymentMethod}`);
  console.log('注意: 当前使用的是占位符实现，需要完善MongoDB的充值记录处理逻辑');
  
  // 占位符实现 - 实际使用时需要：
  // 1. 创建RechargeRecord模型
  // 2. 查找并更新充值记录状态
  // 3. 给用户添加积分
  // 4. 创建积分记录
  
  return true;
}

// ==================== 系统配置API ====================

// 获取系统配置
app.get('/api/config', async (req, res) => {
  try {
    // 返回基本系统配置（从环境变量获取）
    const configObj = {
      POINTS_EXCHANGE_RATE: process.env.POINTS_EXCHANGE_RATE || 10,
      PUBLISH_NOTE_COST: process.env.PUBLISH_NOTE_COST || 1,
      MIN_RECHARGE_AMOUNT: process.env.MIN_RECHARGE_AMOUNT || 10,
      MAX_RECHARGE_AMOUNT: process.env.MAX_RECHARGE_AMOUNT || 1000,
      SERVER_NAME: '小红书插件',
      VERSION: '2.5'
    };

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

// 创建积分订单
app.post('/api/pay/checkout', authenticateToken, async (req, res) => {
  try {
    const { amount, points, description } = req.body;
    
    if (!amount || !points) {
      return res.status(400).json({ error: '充值金额和积分不能为空' });
    }
    
    if (amount <= 0 || points <= 0) {
      return res.status(400).json({ error: '充值金额和积分必须大于0' });
    }
    
    // 验证积分比例（1元=10积分）
    const expectedPoints = amount * 10;
    if (points !== expectedPoints) {
      return res.status(400).json({ error: '积分数量不正确' });
    }

    // 创建订单
    const order = await PointsOrderService.createOrder(
      req.user.userId,
      amount,
      points,
      description || `充值${points}积分`
    );

    // 模拟支付（实际应用中应该调用第三方支付接口）
    try {
      await PointsOrderService.payOrder(order._id);
      
      res.json({
        success: true,
        message: '充值成功',
        order: order.getDetails(),
        points: points
      });
    } catch (paymentError) {
      console.error('支付失败:', paymentError);
      
      res.json({
        success: false,
        message: '支付失败',
        order: order.getDetails(),
        error: paymentError.message
      });
    }
  } catch (error) {
    console.error('创建订单失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取用户订单列表
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status || null;

    const result = await PointsOrderService.getUserOrders(
      req.user.userId,
      page,
      limit,
      status
    );

    res.json({
      success: true,
      orders: result.orders.map(order => order.getDetails()),
      pagination: result.pagination
    });
  } catch (error) {
    console.error('获取订单列表失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取订单详情
app.get('/api/orders/:orderId', authenticateToken, async (req, res) => {
  try {
    const order = await PointsOrderService.getOrderById(req.params.orderId);
    
    if (!order) {
      return res.status(404).json({ error: '订单不存在' });
    }
    
    // 验证订单归属
    if (order.userId._id.toString() !== req.user.userId) {
      return res.status(403).json({ error: '无权访问此订单' });
    }

    res.json({
      success: true,
      order: order.getDetails()
    });
  } catch (error) {
    console.error('获取订单详情失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取订单统计
app.get('/api/orders/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await PointsOrderService.getOrderStats(req.user.userId);
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('获取订单统计失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
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
            const token = new URLSearchParams(window.location.search).get('token');
            if (token) {
                // 保存token到localStorage
                localStorage.setItem('token', token);
                
                // 尝试发送token到插件
                try {
                    console.log('尝试与插件通信...');
                    if (window.chrome && window.chrome.runtime) {
                        // 方法1：直接保存到Chrome存储（popup会检查这里）
                        chrome.storage.local.set({ 
                            authToken: token,
                            authTimestamp: Date.now()
                        }, () => {
                            console.log('Token已保存到Chrome存储');
                            document.getElementById('status').textContent = '登录状态已同步到插件！';
                        });
                        
                        // 方法2：尝试向background script发送消息
                        setTimeout(() => {
                            try {
                                chrome.runtime.sendMessage('', {
                                    type: 'SET_AUTH_TOKEN',
                                    token: token,
                                    timestamp: Date.now()
                                }, response => {
                                    if (chrome.runtime.lastError) {
                                        console.log('无法直接连接到background script，使用storage方法');
                                    } else if (response && response.success) {
                                        console.log('插件响应成功');
                                        document.getElementById('status').textContent = '插件连接成功！';
                                    }
                                });
                            } catch (e) {
                                console.log('直接消息发送失败，使用storage方法');
                            }
                        }, 100);
                        
                        // 方法3：设置全局变量作为备用
                        window.xhsAuthToken = token;
                        window.xhsAuthTimestamp = Date.now();
                        
                        // 方法4：触发自定义事件
                        window.dispatchEvent(new CustomEvent('xhsAuthUpdate', {
                            detail: { token, timestamp: Date.now() }
                        }));
                        
                        // 方法5：使用postMessage与其他窗口通信
                        window.postMessage({
                            type: 'XHS_AUTH_UPDATE',
                            token: token,
                            timestamp: Date.now()
                        }, '*');
                        
                        console.log('所有插件通信方法已执行');
                    } else {
                        console.log('Chrome runtime API不可用');
                        document.getElementById('status').textContent = '请确保在Chrome浏览器中运行';
                    }
                } catch (error) {
                    console.error('插件通信失败:', error);
                    document.getElementById('status').textContent = '通信失败，但token已保存';
                }
                
                // 更新状态
                document.getElementById('status').textContent = '登录状态已同步，可以关闭此页面';
                
                // 清空URL中的token
                if (window.history.replaceState) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
                
                // 通知插件登录状态改变
                try {
                    if (window.chrome && window.chrome.runtime) {
                        // 广播消息到所有可能的插件
                        chrome.runtime.sendMessage('', {
                            type: 'LOGIN_STATUS_CHANGED',
                            data: { isLoggedIn: true }
                        });
                    }
                } catch (error) {
                    console.log('状态同步失败，但不影响使用');
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

// 积分充值页面
app.get('/recharge', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>积分充值 - 小红书插件</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                color: #333;
            }
            
            .header {
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                box-shadow: 0 2px 20px rgba(0,0,0,0.1);
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
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
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
            
            .container {
                max-width: 800px;
                margin: 40px auto;
                padding: 0 20px;
            }
            
            .card {
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(10px);
                border-radius: 20px;
                padding: 40px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.1);
                margin-bottom: 30px;
            }
            
            .card h2 {
                color: #333;
                margin-bottom: 30px;
                text-align: center;
                font-size: 28px;
            }
            
            .current-points {
                text-align: center;
                margin-bottom: 40px;
            }
            
            .points-display {
                font-size: 48px;
                font-weight: 700;
                color: #ff6b6b;
                margin-bottom: 10px;
            }
            
            .points-label {
                color: #666;
                font-size: 16px;
            }
            
            .packages {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 20px;
                margin-bottom: 40px;
            }
            
            .package {
                border: 2px solid #e0e0e0;
                border-radius: 15px;
                padding: 30px 20px;
                text-align: center;
                cursor: pointer;
                transition: all 0.3s ease;
                position: relative;
            }
            
            .package:hover {
                border-color: #ff6b6b;
                transform: translateY(-5px);
                box-shadow: 0 10px 25px rgba(255, 107, 107, 0.2);
            }
            
            .package.selected {
                border-color: #ff6b6b;
                background: linear-gradient(135deg, #ff6b6b10, #ff6b6b20);
            }
            
            .package.popular {
                border-color: #ff6b6b;
            }
            
            .package.popular::before {
                content: '热门';
                position: absolute;
                top: -10px;
                left: 50%;
                transform: translateX(-50%);
                background: #ff6b6b;
                color: white;
                padding: 5px 15px;
                border-radius: 15px;
                font-size: 12px;
            }
            
            .price {
                font-size: 32px;
                font-weight: 700;
                color: #333;
                margin-bottom: 10px;
            }
            
            .price .currency {
                font-size: 16px;
                color: #666;
            }
            
            .points {
                color: #ff6b6b;
                font-size: 18px;
                font-weight: 600;
                margin-bottom: 10px;
            }
            
            .description {
                color: #666;
                font-size: 14px;
            }
            
            .custom-amount {
                border: 2px solid #e0e0e0;
                border-radius: 15px;
                padding: 30px;
                margin-bottom: 30px;
            }
            
            .custom-amount h3 {
                margin-bottom: 20px;
                color: #333;
            }
            
            .amount-input {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-bottom: 15px;
            }
            
            .amount-input input {
                flex: 1;
                padding: 15px;
                border: 2px solid #e0e0e0;
                border-radius: 10px;
                font-size: 16px;
            }
            
            .amount-input input:focus {
                outline: none;
                border-color: #ff6b6b;
            }
            
            .points-preview {
                color: #ff6b6b;
                font-weight: 600;
            }
            
            .payment-method {
                margin-top: 40px;
            }
            
            .payment-method h3 {
                margin-bottom: 20px;
                color: #333;
                font-size: 18px;
            }
            
            .payment-options {
                display: flex;
                gap: 20px;
                justify-content: center;
            }
            
            .payment-option {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 15px 25px;
                border: 2px solid #e0e0e0;
                border-radius: 15px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .payment-option:hover {
                border-color: #ff6b6b;
                background: rgba(255, 107, 107, 0.05);
            }
            
            .payment-option input[type="radio"] {
                margin: 0;
            }
            
            .payment-option:has(input:checked) {
                border-color: #ff6b6b;
                background: rgba(255, 107, 107, 0.1);
            }
            
            .payment-icon {
                font-size: 24px;
            }
            
            .payment-name {
                font-weight: 500;
                color: #333;
            }
            
            .checkout-btn {
                width: 100%;
                padding: 18px;
                background: linear-gradient(135deg, #ff6b6b, #ff5252);
                color: white;
                border: none;
                border-radius: 15px;
                font-size: 18px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .checkout-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 10px 25px rgba(255, 107, 107, 0.3);
            }
            
            .checkout-btn:disabled {
                background: #ccc;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
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
            
            .back-btn {
                background: rgba(255, 255, 255, 0.2);
                color: white;
                border: 1px solid rgba(255, 255, 255, 0.3);
                padding: 10px 20px;
                border-radius: 25px;
                cursor: pointer;
                font-size: 14px;
                text-decoration: none;
                display: inline-block;
                margin-bottom: 20px;
                transition: all 0.3s ease;
            }
            
            .back-btn:hover {
                background: rgba(255, 255, 255, 0.3);
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
            <a href="/dashboard" class="back-btn">← 返回仪表板</a>
            
            <div class="card">
                <h2>积分充值</h2>
                
                <div class="current-points">
                    <div class="points-display" id="current-points">0</div>
                    <div class="points-label">当前积分余额</div>
                </div>
                
                <div class="packages">
                    <div class="package" data-amount="10" data-points="100">
                        <div class="price"><span class="currency">¥</span>10</div>
                        <div class="points">100 积分</div>
                        <div class="description">适合试用用户</div>
                    </div>
                    
                    <div class="package popular" data-amount="50" data-points="500">
                        <div class="price"><span class="currency">¥</span>50</div>
                        <div class="points">500 积分</div>
                        <div class="description">最受欢迎</div>
                    </div>
                    
                    <div class="package" data-amount="100" data-points="1000">
                        <div class="price"><span class="currency">¥</span>100</div>
                        <div class="points">1000 积分</div>
                        <div class="description">性价比最高</div>
                    </div>
                </div>
                
                <div class="custom-amount">
                    <h3>自定义金额</h3>
                    <div class="amount-input">
                        <input type="number" id="custom-amount" placeholder="输入充值金额" min="1" max="1000">
                        <span>元 = <span class="points-preview" id="custom-points">0</span> 积分</span>
                    </div>
                </div>
                
                <div class="payment-method">
                    <h3>支付方式</h3>
                    <div class="payment-options">
                        <label class="payment-option">
                            <input type="radio" name="paymentMethod" value="alipay" checked>
                            <span class="payment-icon">💰</span>
                            <span class="payment-name">支付宝</span>
                        </label>
                        <label class="payment-option">
                            <input type="radio" name="paymentMethod" value="wechat">
                            <span class="payment-icon">💚</span>
                            <span class="payment-name">微信支付</span>
                        </label>
                    </div>
                </div>
                
                <button class="checkout-btn" id="checkout-btn" onclick="checkout()">
                    立即充值
                </button>
            </div>
        </div>
        
        <script>
            const API_BASE = '/api';
            let selectedPackage = null;
            
            // 检查登录状态
            async function checkAuth() {
                const token = localStorage.getItem('token');
                const user = localStorage.getItem('user');
                
                if (!token || !user) {
                    window.location.href = '/';
                    return;
                }
                
                try {
                    const data = await apiRequest(API_BASE + '/auth/me');
                    
                    if (data && data.success) {
                        const userData = data.user;
                        localStorage.setItem('user', JSON.stringify(userData));
                        
                        document.getElementById('username').textContent = userData.username;
                        document.getElementById('avatar').textContent = userData.username.charAt(0).toUpperCase();
                        
                        // 获取用户积分
                        await loadUserPoints();
                    } else {
                        window.location.href = '/';
                    }
                } catch (error) {
                    console.error('认证检查失败:', error);
                    window.location.href = '/';
                }
            }
            
            // 加载用户积分
            async function loadUserPoints() {
                try {
                    const data = await apiRequest(API_BASE + '/points/stats');
                    if (data && data.success) {
                        document.getElementById('current-points').textContent = data.points.current;
                    }
                } catch (error) {
                    console.error('获取积分失败:', error);
                }
            }
            
            // API请求封装
            async function apiRequest(url, options = {}) {
                const token = localStorage.getItem('token');
                
                const defaultOptions = {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? 'Bearer ' + token : ''
                    }
                };
                
                const mergedOptions = {
                    ...defaultOptions,
                    ...options,
                    headers: {
                        ...defaultOptions.headers,
                        ...options.headers
                    }
                };
                
                try {
                    const response = await fetch(url, mergedOptions);
                    
                    if (response.status === 401) {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        window.location.href = '/';
                        return null;
                    }
                    
                    return await response.json();
                } catch (error) {
                    console.error('API请求失败:', error);
                    throw error;
                }
            }
            
            // 选择套餐
            document.querySelectorAll('.package').forEach(pkg => {
                pkg.addEventListener('click', () => {
                    document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
                    pkg.classList.add('selected');
                    selectedPackage = {
                        amount: parseInt(pkg.dataset.amount),
                        points: parseInt(pkg.dataset.points)
                    };
                    document.getElementById('custom-amount').value = '';
                    updateCustomPoints();
                });
            });
            
            // 自定义金额输入
            document.getElementById('custom-amount').addEventListener('input', (e) => {
                const amount = parseInt(e.target.value) || 0;
                document.getElementById('custom-points').textContent = amount * 10;
                
                if (amount > 0) {
                    document.querySelectorAll('.package').forEach(p => p.classList.remove('selected'));
                    selectedPackage = {
                        amount: amount,
                        points: amount * 10
                    };
                } else {
                    selectedPackage = null;
                }
            });
            
            // 更新自定义积分显示
            function updateCustomPoints() {
                const amount = parseInt(document.getElementById('custom-amount').value) || 0;
                document.getElementById('custom-points').textContent = amount * 10;
            }
            
            // 结账
            async function checkout() {
                if (!selectedPackage) {
                    alert('请选择充值套餐或输入自定义金额');
                    return;
                }
                
                const btn = document.getElementById('checkout-btn');
                btn.disabled = true;
                btn.innerHTML = '<span class="loading"></span> 处理中...';
                
                try {
                    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
                    const response = await apiRequest(API_BASE + '/points/recharge', {
                        method: 'POST',
                        body: JSON.stringify({
                            amount: selectedPackage.amount,
                            paymentMethod: paymentMethod
                        })
                    });
                    
                    if (response && response.success) {
                        // 如果返回了支付URL，跳转到支付页面
                        if (response.paymentUrl) {
                            window.location.href = response.paymentUrl;
                        } else if (response.qrCode) {
                            // 显示二维码支付
                            alert('请扫描二维码完成支付');
                        } else {
                            alert('充值订单创建成功！');
                        }
                        setTimeout(() => {
                            window.location.href = '/dashboard';
                        }, 1500);
                    } else {
                        alert(response?.error || '充值失败，请稍后重试');
                    }
                } catch (error) {
                    console.error('充值失败:', error);
                    alert('网络错误，请稍后重试');
                } finally {
                    btn.disabled = false;
                    btn.textContent = '立即充值';
                }
            }
            
            // 退出登录
            function logout() {
                console.log('Logout function called');
                console.log('开始退出登录...');
                try {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    console.log('已清除本地存储，跳转到登录页...');
                    window.location.href = '/';
                } catch (error) {
                    console.error('退出登录失败:', error);
                    alert('退出登录失败，请重试');
                }
            }
            
            // 页面加载时检查登录状态
            window.addEventListener('DOMContentLoaded', checkAuth);
        </script>
    </body>
    </html>
  `);
});

// 仪表板页面
app.get('/dashboard', async (req, res) => {
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
                    <a href="#" class="btn btn-secondary" onclick="connectPlugin()">连接插件</a>
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
            
            // API请求封装
            async function apiRequest(url, options = {}) {
                const token = localStorage.getItem('token');
                
                const defaultOptions = {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': token ? 'Bearer ' + token : ''
                    }
                };
                
                const mergedOptions = {
                    ...defaultOptions,
                    ...options,
                    headers: {
                        ...defaultOptions.headers,
                        ...options.headers
                    }
                };
                
                try {
                    const response = await fetch(url, mergedOptions);
                    
                    // 处理401错误，自动跳转到登录页
                    if (response.status === 401) {
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        window.location.href = '/';
                        return null;
                    }
                    
                    return await response.json();
                } catch (error) {
                    console.error('API请求失败:', error);
                    throw error;
                }
            }
            
            // 检查登录状态
            async function checkAuth() {
                const token = localStorage.getItem('token');
                const user = localStorage.getItem('user');
                
                if (!token || !user) {
                    console.log('未找到token或用户信息，跳转到登录页');
                    window.location.href = '/';
                    return;
                }
                
                // 验证token有效性
                try {
                    const data = await apiRequest(API_BASE + '/auth/me');
                    
                    if (data && data.success) {
                        const userData = data.user;
                        localStorage.setItem('user', JSON.stringify(userData));
                        
                        document.getElementById('username').textContent = userData.username;
                        document.getElementById('avatar').textContent = userData.username.charAt(0).toUpperCase();
                        
                        // 获取用户积分
                        fetchUserPoints();
                    } else {
                        console.log('Token验证失败，跳转到登录页');
                        localStorage.removeItem('token');
                        localStorage.removeItem('user');
                        window.location.href = '/';
                    }
                } catch (error) {
                    console.error('Token验证失败:', error);
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    window.location.href = '/';
                }
            }
            
            // 获取用户积分
            async function fetchUserPoints() {
                try {
                    const data = await apiRequest(API_BASE + '/points/info');
                    
                    if (data && data.success) {
                        document.getElementById('points').textContent = data.points.current;
                    } else {
                        console.error('获取积分失败:', data);
                        document.getElementById('points').textContent = '0';
                    }
                } catch (error) {
                    console.error('获取积分失败:', error);
                    document.getElementById('points').textContent = '0';
                }
            }
            
            // 充值积分
            function recharge() {
                window.location.href = '/recharge';
            }
            
            // 查看记录
            function viewRecords() {
                alert('记录查看功能开发中，敬请期待！');
            }
            
            // 连接插件
            function connectPlugin() {
                const token = localStorage.getItem('token');
                if (token) {
                    const bridgeUrl = '/ext/bridge?token=' + encodeURIComponent(token);
                    window.open(bridgeUrl, '_blank');
                } else {
                    alert('请先登录');
                }
            }
            
            // 退出登录
            function logout() {
                console.log('Logout function called');
                console.log('开始退出登录...');
                try {
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    console.log('已清除本地存储，跳转到登录页...');
                    window.location.href = '/';
                } catch (error) {
                    console.error('退出登录失败:', error);
                    alert('退出登录失败，请重试');
                }
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
                    <button class="tab active" id="login-tab">登录</button>
                    <button class="tab" id="register-tab">注册</button>
                </div>
                
                <div class="alert" id="alert"></div>
                
                <!-- 登录表单 -->
                <form class="form active" id="login-form">
                    <div class="form-group">
                        <label>用户名</label>
                        <input type="text" id="login-username" required minlength="3">
                    </div>
                    <div class="form-group">
                        <label>密码</label>
                        <input type="password" id="login-password" required minlength="6">
                    </div>
                    <button type="submit" class="btn" id="login-btn">登录</button>
                </form>
                
                <!-- 注册表单 -->
                <form class="form" id="register-form">
                    <div class="form-group">
                        <label>用户名</label>
                        <input type="text" id="register-username" required minlength="3">
                    </div>
                    <div class="form-group">
                        <label>邮箱</label>
                        <input type="email" id="register-email" required>
                    </div>
                    <div class="form-group">
                        <label>密码</label>
                        <input type="password" id="register-password" required minlength="6">
                    </div>
                    <button type="submit" class="btn" id="register-btn">注册</button>
                </form>
            </div>
        </div>

        <script>
            const API_BASE = '/api';
            
            // 等待DOM加载完成
            document.addEventListener('DOMContentLoaded', function() {
                console.log('DOM loaded');
                // Tab切换事件
                document.getElementById('login-tab').addEventListener('click', () => switchTab('login'));
                document.getElementById('register-tab').addEventListener('click', () => switchTab('register'));
                
                // 表单提交事件
                document.getElementById('login-form').addEventListener('submit', function(event) {
                    event.preventDefault();
                    handleLogin(event);
                });
                document.getElementById('register-form').addEventListener('submit', function(event) {
                    console.log('Register form submitted');
                    event.preventDefault();
                    handleRegister(event);
                });
                
                // 检查是否已登录
                checkLoginStatus();
            });
            
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
                alert.className = 'alert ' + type;
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
                
                // 基本验证
                if (!username || username.length < 3) {
                    showAlert('用户名至少需要3个字符', 'error');
                    return false;
                }
                
                if (!password || password.length < 6) {
                    showAlert('密码至少需要6个字符', 'error');
                    return false;
                }
                
                btn.disabled = true;
                btn.innerHTML = '<span class="loading"></span> 登录中...';
                
                try {
                    const response = await fetch(API_BASE + '/auth/login', {
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
                    console.error('登录请求失败:', error);
                    showAlert('网络错误，请稍后重试', 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = '登录';
                }
                
                return false;
            }
            
            async function handleRegister(event) {
                console.log('handleRegister called');
                event.preventDefault();
                
                const username = document.getElementById('register-username').value;
                const email = document.getElementById('register-email').value;
                const password = document.getElementById('register-password').value;
                const btn = document.getElementById('register-btn');
                
                // 基本验证
                if (!username || username.length < 3) {
                    showAlert('用户名至少需要3个字符', 'error');
                    return false;
                }
                
                if (!email || !email.includes('@')) {
                    showAlert('请输入有效的邮箱地址', 'error');
                    return false;
                }
                
                if (!password || password.length < 6) {
                    showAlert('密码至少需要6个字符', 'error');
                    return false;
                }
                
                btn.disabled = true;
                btn.innerHTML = '<span class="loading"></span> 注册中...';
                
                try {
                    const response = await fetch(API_BASE + '/auth/register', {
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
                    console.error('注册请求失败:', error);
                    showAlert('网络错误，请稍后重试', 'error');
                } finally {
                    btn.disabled = false;
                    btn.textContent = '注册';
                }
                
                return false;
            }
            
            // 检查是否已登录
            function checkLoginStatus() {
                const token = localStorage.getItem('token');
                const user = localStorage.getItem('user');
                
                if (token && user) {
                    // 验证token是否有效
                    fetch(API_BASE + '/auth/me', {
                        headers: {
                            'Authorization': 'Bearer ' + token
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
            }
        </script>
    </body>
    </html>
  `);
});

// 静态文件服务
app.use(express.static('public'));

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('=== 服务器错误 ===');
  console.error('时间:', new Date().toISOString());
  console.error('请求路径:', req.path);
  console.error('请求方法:', req.method);
  console.error('错误信息:', error.message);
  console.error('错误堆栈:', error.stack);
  console.error('=================');
  
  // 生产环境不返回详细错误信息
  const isProduction = process.env.NODE_ENV === 'production';
  const errorMessage = isProduction ? '服务器内部错误' : error.message;
  
  res.status(500).json({ 
    error: errorMessage,
    requestId: req.headers['x-request-id'] || 'unknown'
  });
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
  console.warn('=== 404请求 ===');
  console.warn('时间:', new Date().toISOString());
  console.warn('请求路径:', req.path);
  console.warn('请求方法:', req.method);
  console.warn('用户代理:', req.get('User-Agent'));
  console.warn('===============');
  
  res.status(404).json({ 
    error: '接口不存在',
    path: req.path,
    method: req.method
  });
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
