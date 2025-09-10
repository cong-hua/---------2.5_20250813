#!/usr/bin/env node
// 交互式支付配置脚本

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class PaymentSetup {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.config = {};
  }

  async question(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  async setup() {
    console.log('='.repeat(60));
    console.log('🎉 小红书插件支付配置向导');
    console.log('='.repeat(60));
    console.log();

    // 检查是否已有配置文件
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const overwrite = await this.question('检测到已存在 .env 文件，是否覆盖？(y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('配置已取消');
        this.rl.close();
        return;
      }
    }

    await this.setupDatabase();
    await this.setupServer();
    await this.setupWechatPay();
    await this.setupAlipay();
    await this.setupPointsSystem();
    
    await this.saveConfig();
    await this.createDirectories();
    
    console.log();
    console.log('✅ 配置完成！');
    console.log();
    console.log('下一步：');
    console.log('1. 如果选择了微信支付，请将证书文件放到 ./certs/ 目录');
    console.log('2. 运行 npm run init-db 初始化数据库');
    console.log('3. 运行 npm start 启动服务器');
    console.log();
    
    this.rl.close();
  }

  async setupDatabase() {
    console.log('📊 数据库配置');
    console.log('-'.repeat(40));
    
    this.config.DB_HOST = await this.question('数据库主机 (默认: localhost): ') || 'localhost';
    this.config.DB_PORT = await this.question('数据库端口 (默认: 3306): ') || '3306';
    this.config.DB_NAME = await this.question('数据库名称 (默认: xiaohongshu_plugin): ') || 'xiaohongshu_plugin';
    this.config.DB_USER = await this.question('数据库用户名 (默认: root): ') || 'root';
    
    // 密码输入（隐藏显示）
    process.stdout.write('数据库密码: ');
    process.stdin.setRawMode(true);
    let password = '';
    process.stdin.on('data', (char) => {
      char = char.toString();
      if (char === '\r' || char === '\n') {
        process.stdin.setRawMode(false);
        console.log();
        this.config.DB_PASSWORD = password;
        process.stdin.removeAllListeners('data');
        return;
      }
      if (char === '\u0003') { // Ctrl+C
        process.exit();
      }
      if (char === '\u007f') { // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += char;
        process.stdout.write('*');
      }
    });
    
    // 等待密码输入完成
    await new Promise(resolve => {
      const checkPassword = () => {
        if (this.config.DB_PASSWORD !== undefined) {
          resolve();
        } else {
          setTimeout(checkPassword, 100);
        }
      };
      checkPassword();
    });
    
    console.log('✅ 数据库配置完成');
    console.log();
  }

  async setupServer() {
    console.log('🖥️  服务器配置');
    console.log('-'.repeat(40));
    
    this.config.SERVER_PORT = await this.question('服务器端口 (默认: 3000): ') || '3000';
    this.config.JWT_SECRET = await this.question('JWT密钥 (留空自动生成): ') || this.generateRandomString(32);
    this.config.API_BASE_URL = await this.question('API基础URL (如: https://your-domain.com/api): ') || 'http://localhost:3000/api';
    
    console.log('✅ 服务器配置完成');
    console.log();
  }

  async setupWechatPay() {
    console.log('💰 微信支付配置');
    console.log('-'.repeat(40));
    
    const enableWechat = await this.question('是否启用微信支付？(Y/n): ');
    if (enableWechat.toLowerCase() === 'n') {
      console.log('⏭️  跳过微信支付配置');
      console.log();
      return;
    }

    console.log();
    console.log('📋 请准备以下信息：');
    console.log('1. 微信支付商户号 (mch_id)');
    console.log('2. 应用ID (app_id) - 可以是小程序、公众号或开放平台应用');
    console.log('3. API密钥 (api_key) - 在商户平台设置的32位密钥');
    console.log('4. API证书文件 (apiclient_cert.pem 和 apiclient_key.pem)');
    console.log();

    const hasInfo = await this.question('您已准备好以上信息了吗？(Y/n): ');
    if (hasInfo.toLowerCase() === 'n') {
      console.log();
      console.log('📖 获取微信支付信息的步骤：');
      console.log('1. 访问 https://pay.weixin.qq.com/');
      console.log('2. 注册并申请商户号');
      console.log('3. 在商户平台获取商户号和设置API密钥');
      console.log('4. 下载API证书');
      console.log();
      console.log('⏭️  暂时跳过微信支付配置，您可以稍后手动配置');
      console.log();
      return;
    }

    this.config.WECHAT_APP_ID = await this.question('微信应用ID (app_id): ');
    this.config.WECHAT_MCH_ID = await this.question('微信商户号 (mch_id): ');
    this.config.WECHAT_API_KEY = await this.question('微信API密钥 (32位): ');
    
    this.config.WECHAT_CERT_PATH = './certs/apiclient_cert.pem';
    this.config.WECHAT_KEY_PATH = './certs/apiclient_key.pem';
    this.config.WECHAT_NOTIFY_URL = `${this.config.API_BASE_URL}/payment/wechat/notify`;

    console.log();
    console.log('📁 请将微信支付证书文件放置到以下位置：');
    console.log(`   ./certs/apiclient_cert.pem`);
    console.log(`   ./certs/apiclient_key.pem`);
    console.log();
    console.log('✅ 微信支付配置完成');
    console.log();
  }

  async setupAlipay() {
    console.log('💙 支付宝配置');
    console.log('-'.repeat(40));
    
    const enableAlipay = await this.question('是否启用支付宝支付？(Y/n): ');
    if (enableAlipay.toLowerCase() === 'n') {
      console.log('⏭️  跳过支付宝配置');
      console.log();
      return;
    }

    console.log();
    console.log('📋 请准备以下信息：');
    console.log('1. 支付宝应用ID (app_id)');
    console.log('2. 应用私钥 (RSA2048)');
    console.log('3. 支付宝公钥 (RSA2048)');
    console.log();

    const hasInfo = await this.question('您已准备好以上信息了吗？(Y/n): ');
    if (hasInfo.toLowerCase() === 'n') {
      console.log();
      console.log('📖 获取支付宝信息的步骤：');
      console.log('1. 访问 https://open.alipay.com/');
      console.log('2. 创建应用');
      console.log('3. 生成RSA密钥对');
      console.log('4. 上传应用公钥，获取支付宝公钥');
      console.log();
      console.log('⏭️  暂时跳过支付宝配置，您可以稍后手动配置');
      console.log();
      return;
    }

    this.config.ALIPAY_APP_ID = await this.question('支付宝应用ID: ');
    
    console.log();
    console.log('🔑 私钥输入（请粘贴完整的私钥内容）：');
    console.log('提示：以 -----BEGIN PRIVATE KEY----- 开始');
    this.config.ALIPAY_PRIVATE_KEY = await this.question('应用私钥: ');
    
    console.log();
    console.log('🔑 支付宝公钥输入（请粘贴完整的公钥内容）：');
    console.log('提示：以 -----BEGIN PUBLIC KEY----- 开始');
    this.config.ALIPAY_PUBLIC_KEY = await this.question('支付宝公钥: ');
    
    const environment = await this.question('使用环境 (1:沙箱 2:正式) [默认:1]: ') || '1';
    this.config.ALIPAY_GATEWAY_URL = environment === '2' 
      ? 'https://openapi.alipay.com/gateway.do'
      : 'https://openapi.alipaydev.com/gateway.do';
    
    this.config.ALIPAY_NOTIFY_URL = `${this.config.API_BASE_URL}/payment/alipay/notify`;
    this.config.ALIPAY_RETURN_URL = `${this.config.API_BASE_URL.replace('/api', '')}/payment/success`;

    console.log('✅ 支付宝配置完成');
    console.log();
  }

  async setupPointsSystem() {
    console.log('🎯 积分系统配置');
    console.log('-'.repeat(40));
    
    this.config.POINTS_EXCHANGE_RATE = await this.question('积分兑换比例 (1元=?积分，默认:10): ') || '10';
    this.config.PUBLISH_NOTE_COST = await this.question('发布笔记消耗积分 (默认:1): ') || '1';
    this.config.MIN_RECHARGE_AMOUNT = await this.question('最小充值金额 (默认:10): ') || '10';
    this.config.MAX_RECHARGE_AMOUNT = await this.question('最大充值金额 (默认:1000): ') || '1000';
    
    this.config.LOG_LEVEL = 'info';
    this.config.LOG_FILE_PATH = './logs/app.log';
    
    console.log('✅ 积分系统配置完成');
    console.log();
  }

  async saveConfig() {
    const envContent = Object.entries(this.config)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const envPath = path.join(__dirname, '../.env');
    fs.writeFileSync(envPath, envContent);
    
    console.log('💾 配置已保存到 .env 文件');
  }

  async createDirectories() {
    const dirs = [
      path.join(__dirname, '../certs'),
      path.join(__dirname, '../logs')
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
    
    // 创建证书目录说明文件
    const certReadme = `# 证书文件目录

## 微信支付证书
请将微信支付证书文件放置在此目录：
- apiclient_cert.pem - 商户证书
- apiclient_key.pem - 商户私钥

## 获取方式
1. 登录微信商户平台
2. 账户中心 → API安全 → 申请API证书
3. 下载证书文件并解压到此目录

## 安全提醒
⚠️ 证书文件包含敏感信息，请勿提交到版本控制系统
`;
    
    fs.writeFileSync(path.join(__dirname, '../certs/README.md'), certReadme);
    
    console.log('📁 目录结构已创建');
  }

  generateRandomString(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}

// 运行配置向导
if (require.main === module) {
  const setup = new PaymentSetup();
  setup.setup().catch(error => {
    console.error('配置失败:', error);
    process.exit(1);
  });
}

module.exports = PaymentSetup;

