# 🚀 开始使用 - 小红书插件积分系统

欢迎使用小红书自动发布插件的积分充值系统！

## 🎯 选择您的配置方式

### 🏃‍♂️ 方式1：快速体验（推荐新手，5分钟搞定）

如果您想快速体验功能，使用默认配置：

```bash
# 进入项目目录
cd 小红书自动发布插件2.0

# 一键配置和启动（包含安装依赖、初始化数据库）
npm run setup-all

# 启动服务器
npm start
```

**测试账号：**
- 用户名：`testuser`
- 密码：`123456`
- 初始积分：`100`

### 🛠️ 方式2：完整配置（推荐生产环境）

如果您需要真实的支付功能：

```bash
# 1. 安装依赖
npm install

# 2. 运行交互式配置向导
npm run setup

# 3. 初始化数据库
npm run init-db -- --with-test-user

# 4. 测试配置
npm run test-config

# 5. 启动服务器
npm start
```

---

## 📋 配置前准备

### 必需项目：
- ✅ Node.js (版本 >= 14.0.0)
- ✅ MySQL 数据库

### 可选项目（如需真实支付）：
- 📱 微信商户号 + API证书
- 💙 支付宝应用 + RSA密钥对
- 🌐 外网可访问的域名（用于支付回调）

---

## 🔍 验证配置

运行配置检查脚本：
```bash
npm run test-config
```

这会检查：
- ✅ 数据库连接
- ✅ 环境变量配置  
- ✅ 文件结构
- ✅ 依赖包安装
- ✅ 端口可用性

---

## 🎮 使用功能

### 1. 启动服务器
```bash
npm start
```

### 2. 加载Chrome插件
1. 打开Chrome浏览器
2. 进入扩展程序管理页面
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目目录

### 3. 使用积分功能
1. 点击插件图标打开界面
2. 点击顶部的"积分"按钮
3. 在弹窗中进行充值操作
4. 发布笔记时会自动扣除积分

---

## 📚 详细文档

- 📖 **完整配置指南**：[STEP_BY_STEP_SETUP.md](STEP_BY_STEP_SETUP.md)
- 💰 **支付配置详解**：[PAYMENT_SETUP_GUIDE.md](PAYMENT_SETUP_GUIDE.md)  
- 🔧 **积分系统说明**：[README_POINTS_SYSTEM.md](README_POINTS_SYSTEM.md)

---

## 🆘 遇到问题？

### 常见问题：

**数据库连接失败？**
```bash
# 检查MySQL服务是否启动
# Windows: net start mysql
# Mac/Linux: sudo systemctl start mysql
```

**端口被占用？**
```bash
# 修改.env文件中的SERVER_PORT
SERVER_PORT=3001
```

**依赖安装失败？**
```bash
# 清除缓存重新安装
npm cache clean --force
npm install
```

### 获取帮助：

1. 查看日志文件：`./logs/app.log`
2. 运行配置测试：`npm run test-config`
3. 检查详细文档中的故障排除章节

---

## 🎉 成功启动后

当您看到以下信息表示配置成功：

```
服务器运行在端口 3000
API文档: http://localhost:3000/api
微信支付SDK初始化成功  （如果配置了微信支付）
支付宝SDK初始化成功    （如果配置了支付宝）
```

现在您可以：
- ✅ 使用积分充值功能
- ✅ 自动发布笔记并扣除积分
- ✅ 查看完整的积分记录
- ✅ 支持微信和支付宝支付

---

**🚀 开始您的小红书自动发布之旅吧！**

