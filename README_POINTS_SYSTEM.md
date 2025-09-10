# 小红书自动发布插件 - 积分充值系统

## 功能概述

本系统为小红书自动发布插件添加了完整的用户积分管理和充值功能，包括：

- ✅ 用户积分管理（当前积分、累计充值、累计消费）
- ✅ 积分充值界面（预设金额 + 自定义金额）
- ✅ 微信支付 & 支付宝支付集成
- ✅ 发布笔记自动扣费（1篇笔记 = 1积分）
- ✅ 完整的积分记录和日志系统
- ✅ 后端API服务

## 系统架构

### 前端组件
- `popup.html` - 主界面，包含积分显示按钮
- `points_manager.js` - 积分管理模块
- `popup.js` - 主要逻辑，包含消息监听

### 后端服务
- `server.js` - Express API服务器
- `payment/` - 支付模块
  - `wechat.js` - 微信支付SDK
  - `alipay.js` - 支付宝SDK
  - `index.js` - 支付工厂类

### 数据库
- `database.sql` - 数据库表结构
- `scripts/init-database.js` - 数据库初始化脚本

## 安装和配置

### 1. 环境准备

```bash
# 安装Node.js依赖
npm install

# 复制环境配置文件
cp env.example .env
```

### 2. 配置环境变量

编辑 `.env` 文件，填入以下配置：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_NAME=xiaohongshu_plugin
DB_USER=root
DB_PASSWORD=your_password

# 微信支付配置
WECHAT_APP_ID=your_wechat_app_id
WECHAT_MCH_ID=your_merchant_id
WECHAT_API_KEY=your_wechat_api_key
WECHAT_CERT_PATH=./certs/wechat_cert.pem
WECHAT_KEY_PATH=./certs/wechat_key.pem
WECHAT_NOTIFY_URL=https://your-domain.com/api/payment/wechat/notify

# 支付宝支付配置
ALIPAY_APP_ID=your_alipay_app_id
ALIPAY_PRIVATE_KEY=your_alipay_private_key
ALIPAY_PUBLIC_KEY=your_alipay_public_key
ALIPAY_NOTIFY_URL=https://your-domain.com/api/payment/alipay/notify
ALIPAY_RETURN_URL=https://your-domain.com/payment/success
ALIPAY_GATEWAY_URL=https://openapi.alipay.com/gateway.do

# 服务器配置
SERVER_PORT=3000
JWT_SECRET=your_jwt_secret_key
API_BASE_URL=https://your-domain.com/api

# 积分系统配置
POINTS_EXCHANGE_RATE=10
PUBLISH_NOTE_COST=1
MIN_RECHARGE_AMOUNT=10
MAX_RECHARGE_AMOUNT=1000
```

### 3. 初始化数据库

```bash
# 初始化数据库表结构
npm run init-db

# 或者包含测试用户
npm run init-db -- --with-test-user
```

### 4. 启动服务

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

## 使用说明

### 1. 积分充值

1. 点击插件界面顶部的"积分"按钮
2. 在弹窗中查看当前积分信息
3. 选择预设金额（10元、20元、50元、100元）或输入自定义金额
4. 选择支付方式（微信支付或支付宝）
5. 点击"立即充值"创建支付订单
6. 完成支付后积分自动到账

### 2. 积分消费

- 每发布一篇笔记自动扣除1积分
- 积分不足时会提示充值
- 所有消费记录都会保存在数据库中

### 3. 积分记录

- 充值记录：包含订单号、金额、积分数量、支付状态等
- 扣费记录：包含消费积分、操作类型、相关笔记等
- 积分日志：记录所有积分变动的详细信息

## API接口

### 用户认证
- `POST /api/auth/register` - 用户注册
- `POST /api/auth/login` - 用户登录

### 积分管理
- `GET /api/points/info` - 获取积分信息
- `POST /api/points/recharge` - 创建充值订单
- `POST /api/points/deduct` - 扣除积分
- `GET /api/points/records` - 获取积分记录

### 支付回调
- `POST /api/payment/wechat/notify` - 微信支付回调
- `POST /api/payment/alipay/notify` - 支付宝支付回调

### 系统配置
- `GET /api/config` - 获取系统配置

## 数据库表结构

### users - 用户表
- `current_points` - 当前积分
- `total_consumed_points` - 累计消费积分
- `total_recharged_points` - 累计充值积分

### recharge_records - 充值记录表
- `order_id` - 订单号
- `amount` - 充值金额
- `points` - 获得积分
- `payment_method` - 支付方式
- `payment_status` - 支付状态

### points_deduction_records - 积分扣费记录表
- `points_deducted` - 扣除积分数量
- `action_type` - 操作类型
- `note_id` - 关联笔记ID

### points_logs - 积分变动日志表
- `change_type` - 变动类型（充值/扣费）
- `points_change` - 积分变动数量
- `before_points` - 变动前积分
- `after_points` - 变动后积分

## 支付配置

### 微信支付
1. 申请微信商户号
2. 配置API密钥
3. 下载商户证书文件
4. 配置回调地址

### 支付宝
1. 创建支付宝应用
2. 配置RSA密钥
3. 配置回调地址
4. 上线应用

## 安全注意事项

1. **密钥安全**：妥善保管支付密钥，不要提交到版本控制
2. **签名验证**：所有支付回调都会验证签名
3. **HTTPS**：生产环境必须使用HTTPS
4. **数据库安全**：使用强密码，限制数据库访问权限

## 测试

### 测试用户
如果使用 `--with-test-user` 参数初始化数据库，会创建测试用户：
- 用户名：`testuser`
- 密码：`123456`
- 初始积分：`100`

### 支付测试
- 微信支付：使用微信支付沙箱环境
- 支付宝：使用支付宝沙箱环境

## 故障排除

### 常见问题

1. **数据库连接失败**
   - 检查数据库服务是否启动
   - 验证连接参数是否正确

2. **支付失败**
   - 检查支付配置是否正确
   - 查看支付日志排查问题

3. **积分扣费失败**
   - 检查用户积分是否足够
   - 查看后端日志

### 日志查看
```bash
# 查看服务器日志
tail -f logs/app.log

# 查看数据库日志
# 根据具体数据库配置查看
```

## 开发者信息

- 开发者：七肆
- 版本：v2.5
- 联系方式：[在此添加联系方式]

## 许可证

MIT License - 详见 LICENSE 文件

