#!/usr/bin/env node
// 快速配置脚本 - 使用默认值和测试环境

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function generateRandomString(length) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function createQuickConfig() {
  console.log('🚀 快速配置模式');
  console.log('使用默认配置和测试环境，适合快速体验功能');
  console.log('=' * 50);

  const config = {
    // 数据库配置 - 使用本地默认设置
    DB_HOST: 'localhost',
    DB_PORT: '3306',
    DB_NAME: 'xiaohongshu_plugin',
    DB_USER: 'root',
    DB_PASSWORD: '',

    // 服务器配置
    SERVER_PORT: '3000',
    JWT_SECRET: generateRandomString(32),
    API_BASE_URL: 'http://localhost:3000/api',

    // 微信支付配置 - 测试环境（需要您后续填写真实值）
    WECHAT_APP_ID: 'wx_test_app_id_here',
    WECHAT_MCH_ID: 'test_mch_id_here',
    WECHAT_API_KEY: 'test_api_key_32_characters_here',
    WECHAT_CERT_PATH: './certs/apiclient_cert.pem',
    WECHAT_KEY_PATH: './certs/apiclient_key.pem',
    WECHAT_NOTIFY_URL: 'http://localhost:3000/api/payment/wechat/notify',

    // 支付宝配置 - 沙箱环境（需要您后续填写真实值）
    ALIPAY_APP_ID: 'test_alipay_app_id',
    ALIPAY_PRIVATE_KEY: 'your_alipay_private_key_here',
    ALIPAY_PUBLIC_KEY: 'your_alipay_public_key_here',
    ALIPAY_NOTIFY_URL: 'http://localhost:3000/api/payment/alipay/notify',
    ALIPAY_RETURN_URL: 'http://localhost:3000/payment/success',
    ALIPAY_GATEWAY_URL: 'https://openapi.alipaydev.com/gateway.do',

    // 积分系统配置
    POINTS_EXCHANGE_RATE: '10',
    PUBLISH_NOTE_COST: '1',
    MIN_RECHARGE_AMOUNT: '10',
    MAX_RECHARGE_AMOUNT: '1000',

    // 日志配置
    LOG_LEVEL: 'info',
    LOG_FILE_PATH: './logs/app.log'
  };

  // 创建 .env 文件
  const envContent = Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const envPath = path.join(__dirname, '../.env');
  fs.writeFileSync(envPath, envContent);

  // 创建必要的目录
  const dirs = [
    path.join(__dirname, '../certs'),
    path.join(__dirname, '../logs')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // 创建说明文件
  const setupInstructions = `# 快速配置完成！

## ✅ 已完成的配置
- 数据库：MySQL localhost:3306
- 服务器：http://localhost:3000
- 积分系统：1元=10积分，发布笔记消耗1积分
- JWT密钥：已自动生成

## ⚠️ 需要您手动配置的部分

### 1. 数据库密码
如果您的MySQL设置了密码，请编辑 .env 文件中的 DB_PASSWORD

### 2. 微信支付（可选）
如果需要微信支付功能，请：
1. 申请微信商户号
2. 在 .env 文件中填写真实的：
   - WECHAT_APP_ID
   - WECHAT_MCH_ID  
   - WECHAT_API_KEY
3. 将证书文件放到 ./certs/ 目录

### 3. 支付宝支付（可选）
如果需要支付宝功能，请：
1. 在支付宝开放平台创建应用
2. 在 .env 文件中填写真实的：
   - ALIPAY_APP_ID
   - ALIPAY_PRIVATE_KEY
   - ALIPAY_PUBLIC_KEY

## 🚀 下一步操作

1. 安装依赖：
   npm install

2. 初始化数据库：
   npm run init-db -- --with-test-user

3. 启动服务：
   npm start

4. 测试登录：
   用户名: testuser
   密码: 123456

## 📝 配置文件位置
- 环境配置: .env
- 数据库脚本: database.sql
- 服务器代码: server.js
`;

  fs.writeFileSync(path.join(__dirname, '../QUICK_SETUP_INSTRUCTIONS.md'), setupInstructions);

  console.log('✅ 快速配置完成！');
  console.log('📄 详细说明请查看: QUICK_SETUP_INSTRUCTIONS.md');
  console.log();
  console.log('🏃‍♂️ 快速启动步骤：');
  console.log('1. npm install');
  console.log('2. npm run init-db -- --with-test-user');
  console.log('3. npm start');
  console.log();
  console.log('💡 提示：如果需要真实支付功能，请按说明文件配置支付参数');
}

if (require.main === module) {
  createQuickConfig();
}

module.exports = { createQuickConfig };

