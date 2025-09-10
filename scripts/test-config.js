#!/usr/bin/env node
// 配置测试脚本

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

class ConfigTester {
  constructor() {
    this.results = [];
  }

  log(status, message, details = '') {
    const statusIcon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
    console.log(`${statusIcon} ${message}`);
    if (details) {
      console.log(`   ${details}`);
    }
    this.results.push({ status, message, details });
  }

  async testDatabase() {
    console.log('\n📊 测试数据库连接...');
    
    try {
      const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME
      });

      await connection.execute('SELECT 1');
      this.log('pass', '数据库连接成功');

      // 检查表是否存在
      const tables = ['users', 'recharge_records', 'points_deduction_records', 'points_logs', 'system_config'];
      for (const table of tables) {
        try {
          await connection.execute(`SELECT 1 FROM ${table} LIMIT 1`);
          this.log('pass', `表 ${table} 存在`);
        } catch (error) {
          this.log('fail', `表 ${table} 不存在`, '请运行: npm run init-db');
        }
      }

      await connection.end();
    } catch (error) {
      this.log('fail', '数据库连接失败', error.message);
    }
  }

  async testEnvironmentVariables() {
    console.log('\n🔧 检查环境变量...');

    const required = [
      'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER',
      'SERVER_PORT', 'JWT_SECRET', 'API_BASE_URL'
    ];

    const optional = [
      'WECHAT_APP_ID', 'WECHAT_MCH_ID', 'WECHAT_API_KEY',
      'ALIPAY_APP_ID', 'ALIPAY_PRIVATE_KEY', 'ALIPAY_PUBLIC_KEY'
    ];

    // 检查必需变量
    for (const key of required) {
      if (process.env[key]) {
        this.log('pass', `${key} 已配置`);
      } else {
        this.log('fail', `${key} 未配置`, '这是必需的环境变量');
      }
    }

    // 检查可选变量
    let wechatConfigured = 0;
    let alipayConfigured = 0;

    for (const key of optional) {
      if (process.env[key] && process.env[key] !== 'test_' + key.toLowerCase() && !process.env[key].includes('_here')) {
        if (key.startsWith('WECHAT_')) wechatConfigured++;
        if (key.startsWith('ALIPAY_')) alipayConfigured++;
        this.log('pass', `${key} 已配置`);
      } else {
        this.log('warn', `${key} 使用默认值`, '如需真实支付功能请配置此项');
      }
    }

    if (wechatConfigured >= 3) {
      this.log('pass', '微信支付基本配置完成');
    } else {
      this.log('warn', '微信支付未完全配置', '需要配置 APP_ID, MCH_ID, API_KEY');
    }

    if (alipayConfigured >= 3) {
      this.log('pass', '支付宝基本配置完成');
    } else {
      this.log('warn', '支付宝未完全配置', '需要配置 APP_ID, PRIVATE_KEY, PUBLIC_KEY');
    }
  }

  async testFiles() {
    console.log('\n📁 检查文件结构...');

    const requiredFiles = [
      '.env',
      'server.js',
      'package.json',
      'database.sql'
    ];

    const requiredDirs = [
      'payment',
      'scripts',
      'certs',
      'logs'
    ];

    // 检查文件
    for (const file of requiredFiles) {
      const filePath = path.join(__dirname, '..', file);
      if (fs.existsSync(filePath)) {
        this.log('pass', `文件 ${file} 存在`);
      } else {
        this.log('fail', `文件 ${file} 不存在`);
      }
    }

    // 检查目录
    for (const dir of requiredDirs) {
      const dirPath = path.join(__dirname, '..', dir);
      if (fs.existsSync(dirPath)) {
        this.log('pass', `目录 ${dir} 存在`);
      } else {
        this.log('fail', `目录 ${dir} 不存在`);
      }
    }

    // 检查微信证书文件
    if (process.env.WECHAT_CERT_PATH && process.env.WECHAT_KEY_PATH) {
      const certPath = path.join(__dirname, '..', process.env.WECHAT_CERT_PATH);
      const keyPath = path.join(__dirname, '..', process.env.WECHAT_KEY_PATH);
      
      if (fs.existsSync(certPath)) {
        this.log('pass', '微信证书文件存在');
      } else {
        this.log('warn', '微信证书文件不存在', '如需微信支付请上传证书');
      }

      if (fs.existsSync(keyPath)) {
        this.log('pass', '微信私钥文件存在');
      } else {
        this.log('warn', '微信私钥文件不存在', '如需微信支付请上传私钥');
      }
    }
  }

  async testDependencies() {
    console.log('\n📦 检查依赖包...');

    try {
      const packagePath = path.join(__dirname, '..', 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      const dependencies = Object.keys(packageJson.dependencies || {});
      this.log('pass', `发现 ${dependencies.length} 个依赖包`);

      // 检查关键依赖
      const keyDeps = ['express', 'mysql2', 'bcrypt', 'jsonwebtoken', 'cors'];
      for (const dep of keyDeps) {
        try {
          require.resolve(dep);
          this.log('pass', `依赖 ${dep} 已安装`);
        } catch (error) {
          this.log('fail', `依赖 ${dep} 未安装`, '请运行: npm install');
        }
      }
    } catch (error) {
      this.log('fail', '无法读取 package.json', error.message);
    }
  }

  async testServer() {
    console.log('\n🖥️  测试服务器配置...');

    const port = process.env.SERVER_PORT || 3000;
    
    // 检查端口是否可用
    const net = require('net');
    const server = net.createServer();

    try {
      await new Promise((resolve, reject) => {
        server.listen(port, () => {
          server.close();
          resolve();
        });
        server.on('error', reject);
      });
      this.log('pass', `端口 ${port} 可用`);
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        this.log('warn', `端口 ${port} 已被占用`, '服务器可能正在运行');
      } else {
        this.log('fail', `端口 ${port} 测试失败`, error.message);
      }
    }
  }

  generateReport() {
    console.log('\n' + '='.repeat(60));
    console.log('📋 配置检查报告');
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.status === 'pass').length;
    const failed = this.results.filter(r => r.status === 'fail').length;
    const warned = this.results.filter(r => r.status === 'warn').length;

    console.log(`✅ 通过: ${passed}`);
    console.log(`❌ 失败: ${failed}`);
    console.log(`⚠️  警告: ${warned}`);

    if (failed > 0) {
      console.log('\n❌ 发现问题，请解决后重试：');
      this.results.filter(r => r.status === 'fail').forEach(r => {
        console.log(`   • ${r.message}`);
        if (r.details) console.log(`     ${r.details}`);
      });
    }

    if (warned > 0) {
      console.log('\n⚠️  注意事项：');
      this.results.filter(r => r.status === 'warn').forEach(r => {
        console.log(`   • ${r.message}`);
        if (r.details) console.log(`     ${r.details}`);
      });
    }

    if (failed === 0) {
      console.log('\n🎉 配置检查通过！可以启动服务器：npm start');
    } else {
      console.log('\n🔧 请解决上述问题后重新运行测试：npm run test-config');
    }
  }

  async run() {
    console.log('🔍 开始配置检查...');
    
    await this.testEnvironmentVariables();
    await this.testFiles();
    await this.testDependencies();
    await this.testDatabase();
    await this.testServer();
    
    this.generateReport();
  }
}

// 运行测试
if (require.main === module) {
  const tester = new ConfigTester();
  tester.run().catch(error => {
    console.error('测试失败:', error);
    process.exit(1);
  });
}

module.exports = ConfigTester;

