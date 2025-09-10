# 🚀 小红书插件支付系统配置指南

## 📋 准备工作检查清单

在开始之前，请确保您有：
- [ ] Node.js (版本 >= 14.0.0)
- [ ] MySQL 数据库服务器
- [ ] 一个域名（用于支付回调，可以是内网穿透域名）

## 🎯 三种配置方式

### 方式1：🏃‍♂️ 快速体验（推荐新手）
```bash
# 一键快速配置和启动
npm run setup-all
```

### 方式2：🛠️ 交互式配置（推荐）
```bash
# 交互式配置向导
npm run setup
```

### 方式3：📝 手动配置
复制 `env.example` 为 `.env` 并手动填写

---

## 🏃‍♂️ 方式1：快速体验模式

### 第一步：运行快速配置
```bash
cd 小红书自动发布插件2.0
npm run setup-all
```

这个命令会：
1. 创建默认配置文件
2. 安装所有依赖
3. 初始化数据库和测试用户

### 第二步：启动服务
```bash
npm start
```

### 第三步：测试功能
1. 打开浏览器访问：http://localhost:3000
2. 使用测试账号登录：
   - 用户名：`testuser`
   - 密码：`123456`

### 第四步：配置真实支付（可选）
编辑 `.env` 文件，填入真实的支付参数（详见下方支付配置章节）

---

## 🛠️ 方式2：交互式配置（详细配置）

### 第一步：安装依赖
```bash
cd 小红书自动发布插件2.0
npm install
```

### 第二步：运行配置向导
```bash
npm run setup
```

配置向导会询问：
1. **数据库信息**：主机、端口、用户名、密码等
2. **服务器设置**：端口、域名等
3. **微信支付**：是否启用、商户信息等
4. **支付宝支付**：是否启用、应用信息等
5. **积分系统**：兑换比例、消费规则等

### 第三步：初始化数据库
```bash
npm run init-db -- --with-test-user
```

### 第四步：启动服务
```bash
npm start
```

---

## 💰 支付参数详细配置

### 微信支付配置

#### 1. 申请微信商户号
1. 访问：https://pay.weixin.qq.com/
2. 点击"立即接入"
3. 选择主体类型：
   - **个人**：选择"小微商户"
   - **企业**：选择"普通商户"
4. 提交资料并等待审核（1-7个工作日）

#### 2. 获取配置信息
登录微信商户平台后：

**获取基本信息：**
```
商户号 (mch_id)：在首页可以看到
应用ID (app_id)：可以使用公众号、小程序或开放平台应用的AppID
```

**设置API密钥：**
1. 进入"账户中心" → "API安全"
2. 点击"设置API密钥"
3. 设置32位随机密钥（建议使用密钥生成器）
4. ⚠️ **重要**：记录此密钥，后续无法查看

**下载API证书：**
1. 在"API安全"页面点击"申请API证书"
2. 下载证书工具并按提示操作
3. 获得文件：
   - `apiclient_cert.pem` - 商户证书
   - `apiclient_key.pem` - 商户私钥

#### 3. 配置到.env文件
```env
WECHAT_APP_ID=wx1234567890abcdef
WECHAT_MCH_ID=1234567890
WECHAT_API_KEY=your32characterapikeyhere123456
WECHAT_CERT_PATH=./certs/apiclient_cert.pem
WECHAT_KEY_PATH=./certs/apiclient_key.pem
WECHAT_NOTIFY_URL=https://your-domain.com/api/payment/wechat/notify
```

#### 4. 放置证书文件
将下载的证书文件放到：
```
./certs/apiclient_cert.pem
./certs/apiclient_key.pem
```

### 支付宝配置

#### 1. 创建支付宝应用
1. 访问：https://open.alipay.com/
2. 登录后进入"控制台"
3. 点击"创建应用" → "网页&移动应用"
4. 填写应用信息：
   - 应用名称：小红书发布插件
   - 应用简介：自动发布工具积分充值

#### 2. 添加支付功能
在应用管理中添加功能：
- ✅ 手机网站支付
- ✅ 电脑网站支付  
- ✅ 当面付（扫码支付）

#### 3. 生成RSA密钥对
**方法1：使用支付宝工具**
1. 下载支付宝密钥生成工具
2. 选择"PKCS1(非JAVA适用)"
3. 密钥长度选择"2048"
4. 生成密钥对

**方法2：使用OpenSSL**
```bash
# 生成私钥
openssl genpkey -algorithm RSA -out private_key.pem -pkcs8 -pkcs8_cipher none -pkcs8_key_size 2048

# 提取公钥
openssl rsa -pubout -in private_key.pem -out public_key.pem
```

#### 4. 上传公钥获取支付宝公钥
1. 在应用详情页 → "开发设置" → "接口加签方式"
2. 选择"公钥"模式
3. 上传您的应用公钥
4. 保存后获得支付宝公钥

#### 5. 配置到.env文件
```env
ALIPAY_APP_ID=2021001234567890
ALIPAY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
-----END PRIVATE KEY-----
ALIPAY_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----
ALIPAY_NOTIFY_URL=https://your-domain.com/api/payment/alipay/notify
ALIPAY_RETURN_URL=https://your-domain.com/payment/success
ALIPAY_GATEWAY_URL=https://openapi.alipaydev.com/gateway.do
```

**注意：**
- 沙箱环境：`https://openapi.alipaydev.com/gateway.do`
- 正式环境：`https://openapi.alipay.com/gateway.do`

---

## 🌐 域名和回调配置

### 内网穿透（测试用）
如果您在本地测试，需要使用内网穿透工具：

**推荐工具：**
- ngrok：https://ngrok.com/
- 花生壳：https://www.oray.com/
- frp：https://github.com/fatedier/frp

**使用ngrok示例：**
```bash
# 安装ngrok
npm install -g ngrok

# 启动内网穿透
ngrok http 3000

# 获得类似这样的URL：https://abc123.ngrok.io
# 将此URL配置到支付回调地址中
```

### 正式域名配置
如果您有正式域名：
```env
API_BASE_URL=https://your-domain.com/api
WECHAT_NOTIFY_URL=https://your-domain.com/api/payment/wechat/notify
ALIPAY_NOTIFY_URL=https://your-domain.com/api/payment/alipay/notify
```

---

## 🔧 常见问题解决

### 数据库连接失败
```bash
# 检查MySQL服务状态
# Windows:
net start mysql

# macOS/Linux:
sudo systemctl start mysql
```

### 端口占用
```bash
# 查看端口占用
netstat -ano | findstr :3000

# 修改端口
# 编辑.env文件中的SERVER_PORT
```

### 支付回调失败
1. 确保回调URL可以从外网访问
2. 检查防火墙设置
3. 验证签名配置是否正确

### 证书文件路径错误
确保证书文件位于正确位置：
```
小红书自动发布插件2.0/
├── certs/
│   ├── apiclient_cert.pem
│   └── apiclient_key.pem
└── .env
```

---

## ✅ 验证配置

### 1. 检查服务启动
```bash
npm start
```
看到以下信息表示启动成功：
```
服务器运行在端口 3000
API文档: http://localhost:3000/api
微信支付SDK初始化成功
支付宝SDK初始化成功
```

### 2. 测试API接口
```bash
# 测试系统配置接口
curl http://localhost:3000/api/config

# 测试用户登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"123456"}'
```

### 3. 测试前端界面
1. 加载Chrome插件
2. 点击积分按钮
3. 查看充值界面是否正常显示

---

## 🎉 完成！

配置完成后，您的小红书插件就具备了完整的积分充值功能：

- ✅ 用户可以充值积分（1元=10积分）
- ✅ 发布笔记自动扣除积分（1篇=1积分）
- ✅ 支持微信支付和支付宝支付
- ✅ 完整的积分记录和日志

如果遇到问题，请检查：
1. 数据库连接是否正常
2. 支付配置是否正确
3. 域名回调是否可达
4. 证书文件是否存在

需要帮助？请查看日志文件：`./logs/app.log`

