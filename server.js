// 小红书发布插件后端API服务器
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const PaymentFactory = require('./payment');
require('dotenv').config();

const app = express();
const PORT = process.env.SERVER_PORT || 3000;

// 中间件
app.use(cors({
  origin: function (origin, callback) {
    // 允许的来源列表
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      // 生产环境域名（部署时需要替换）
      'https://your-domain.zeabur.app',
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

// 数据库连接配置
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'xiaohongshu_plugin',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// 初始化支付工厂
const paymentFactory = new PaymentFactory();

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

    // 检查用户是否已存在
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(400).json({ error: '用户名或邮箱已存在' });
    }

    // 加密密码
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 创建用户
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, phone, password_hash) VALUES (?, ?, ?, ?)',
      [username, email, phone, passwordHash]
    );

    res.status(201).json({
      success: true,
      message: '用户注册成功',
      userId: result.insertId
    });
  } catch (error) {
    console.error('用户注册失败:', error);
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

    // 查找用户
    const [users] = await pool.execute(
      'SELECT id, username, email, password_hash, current_points, total_consumed_points, total_recharged_points FROM users WHERE username = ? AND status = "active"',
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = users[0];

    // 验证密码
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 生成JWT令牌
    const token = jwt.sign(
      { userId: user.id, username: user.username },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        points: {
          current: user.current_points,
          totalConsumed: user.total_consumed_points,
          totalRecharged: user.total_recharged_points
        }
      }
    });
  } catch (error) {
    console.error('用户登录失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ==================== 积分相关API ====================

// 获取用户积分信息
app.get('/api/points/info', authenticateToken, async (req, res) => {
  try {
    const [users] = await pool.execute(
      'SELECT current_points, total_consumed_points, total_recharged_points FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = users[0];
    res.json({
      success: true,
      points: {
        current: user.current_points,
        totalConsumed: user.total_consumed_points,
        totalRecharged: user.total_recharged_points
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

    // 创建充值记录
    const [result] = await pool.execute(
      'INSERT INTO recharge_records (user_id, order_id, amount, points, exchange_rate, payment_method) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, orderId, amount, points, exchangeRate, paymentMethod]
    );

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

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 获取当前积分
      const [users] = await connection.execute(
        'SELECT current_points, total_consumed_points FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );

      if (users.length === 0) {
        throw new Error('用户不存在');
      }

      const user = users[0];
      if (user.current_points < points) {
        throw new Error('积分不足');
      }

      const beforePoints = user.current_points;
      const afterPoints = beforePoints - points;

      // 更新用户积分
      await connection.execute(
        'UPDATE users SET current_points = ?, total_consumed_points = ? WHERE id = ?',
        [afterPoints, user.total_consumed_points + points, userId]
      );

      // 创建扣费记录
      const [deductionResult] = await connection.execute(
        'INSERT INTO points_deduction_records (user_id, points_deducted, action_type, action_description, note_id, before_points, after_points) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, points, actionType, description, noteId, beforePoints, afterPoints]
      );

      // 创建积分变动日志
      await connection.execute(
        'INSERT INTO points_logs (user_id, change_type, points_change, before_points, after_points, reference_id, reference_type, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, 'deduction', -points, beforePoints, afterPoints, deductionResult.insertId, 'deduction', description]
      );

      await connection.commit();

      res.json({
        success: true,
        message: '积分扣费成功',
        beforePoints,
        afterPoints,
        deductedPoints: points
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('积分扣费失败:', error);
    if (error.message === '积分不足') {
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
    const offset = (page - 1) * limit;

    let query = '';
    let params = [userId];

    if (type === 'recharge') {
      query = `
        SELECT 'recharge' as type, order_id as id, amount as amount, points, payment_method, payment_status, created_at
        FROM recharge_records 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;
      params.push(parseInt(limit), parseInt(offset));
    } else if (type === 'deduction') {
      query = `
        SELECT 'deduction' as type, id, points_deducted as amount, action_type, action_description, note_id, created_at
        FROM points_deduction_records 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;
      params.push(parseInt(limit), parseInt(offset));
    } else {
      // 获取所有记录
      query = `
        (SELECT 'recharge' as type, order_id as id, amount, points, payment_method as extra_info, payment_status as status, created_at
         FROM recharge_records WHERE user_id = ?)
        UNION ALL
        (SELECT 'deduction' as type, id, points_deducted as amount, points_deducted as points, action_type as extra_info, 'completed' as status, created_at
         FROM points_deduction_records WHERE user_id = ?)
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;
      params = [userId, userId, parseInt(limit), parseInt(offset)];
    }

    const [records] = await pool.execute(query, params);

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
    const [users] = await pool.execute(
      'SELECT current_points, total_consumed_points, total_recharged_points FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const user = users[0];
    res.json({
      success: true,
      points: {
        current: user.current_points,
        totalConsumed: user.total_consumed_points,
        totalRecharged: user.total_recharged_points
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

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 检查用户积分
      const [users] = await connection.execute(
        'SELECT current_points FROM users WHERE id = ? FOR UPDATE',
        [userId]
      );

      if (users.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: '用户不存在' });
      }

      const user = users[0];
      if (user.current_points < points) {
        await connection.rollback();
        return res.status(400).json({ error: '积分不足' });
      }

      // 扣减积分
      const [result] = await connection.execute(
        'UPDATE users SET current_points = current_points - ?, total_consumed_points = total_consumed_points + ? WHERE id = ?',
        [points, points, userId]
      );

      // 记录积分消费
      await connection.execute(
        'INSERT INTO points_deduction_records (user_id, points, action_type, description, note_id) VALUES (?, ?, ?, ?, ?)',
        [userId, points, actionType, description, null]
      );

      // 记录积分日志
      await connection.execute(
        'INSERT INTO points_logs (user_id, points_change, change_type, description) VALUES (?, ?, ?, ?)',
        [userId, -points, 'deduct', description]
      );

      await connection.commit();

      // 返回扣减后的积分信息
      const [updatedUser] = await pool.execute(
        'SELECT current_points FROM users WHERE id = ?',
        [userId]
      );

      res.json({
        success: true,
        beforePoints: user.current_points,
        afterPoints: updatedUser[0].current_points,
        deductedPoints: points
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('积分消费失败:', error);
    res.status(500).json({ error: '服务器内部错误' });
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

// 静态文件服务
app.use(express.static('public'));

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error('服务器错误:', error);
  res.status(500).json({ error: '服务器内部错误' });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`API文档: http://localhost:${PORT}/api`);
});

module.exports = app;
