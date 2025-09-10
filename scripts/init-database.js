// 数据库初始化脚本
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function initDatabase() {
  let connection = null;
  
  try {
    console.log('开始初始化数据库...');
    
    // 连接MySQL服务器（不指定数据库）
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || ''
    });

    const dbName = process.env.DB_NAME || 'xiaohongshu_plugin';
    
    // 创建数据库（如果不存在）
    console.log(`创建数据库: ${dbName}`);
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    
    // 选择数据库
    await connection.execute(`USE \`${dbName}\``);
    console.log(`已切换到数据库: ${dbName}`);
    
    // 读取SQL文件
    const sqlFilePath = path.join(__dirname, '../database.sql');
    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    
    // 分割SQL语句
    const sqlStatements = sqlContent
      .split(';')
      .map(statement => statement.trim())
      .filter(statement => statement.length > 0);
    
    console.log(`执行 ${sqlStatements.length} 条SQL语句...`);
    
    // 执行SQL语句
    for (let i = 0; i < sqlStatements.length; i++) {
      const statement = sqlStatements[i];
      if (statement) {
        try {
          await connection.execute(statement);
          console.log(`✓ 执行完成 (${i + 1}/${sqlStatements.length})`);
        } catch (error) {
          if (!error.message.includes('already exists') && !error.message.includes('Duplicate entry')) {
            console.error(`✗ 执行失败 (${i + 1}/${sqlStatements.length}):`, error.message);
            console.error('SQL:', statement);
          } else {
            console.log(`- 跳过已存在的项目 (${i + 1}/${sqlStatements.length})`);
          }
        }
      }
    }
    
    // 验证表是否创建成功
    console.log('\n验证表结构...');
    const [tables] = await connection.execute('SHOW TABLES');
    
    const expectedTables = [
      'users',
      'recharge_records', 
      'points_deduction_records',
      'points_logs',
      'system_config'
    ];
    
    const existingTables = tables.map(row => Object.values(row)[0]);
    
    for (const tableName of expectedTables) {
      if (existingTables.includes(tableName)) {
        console.log(`✓ 表 ${tableName} 创建成功`);
      } else {
        console.error(`✗ 表 ${tableName} 创建失败`);
      }
    }
    
    // 检查系统配置
    const [configs] = await connection.execute('SELECT COUNT(*) as count FROM system_config');
    console.log(`\n系统配置记录数: ${configs[0].count}`);
    
    console.log('\n数据库初始化完成！');
    
  } catch (error) {
    console.error('数据库初始化失败:', error);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 创建测试用户
async function createTestUser() {
  let connection = null;
  
  try {
    console.log('\n创建测试用户...');
    
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'xiaohongshu_plugin'
    });

    const bcrypt = require('bcrypt');
    const testPassword = await bcrypt.hash('123456', 10);
    
    // 插入测试用户
    await connection.execute(
      'INSERT IGNORE INTO users (username, email, password_hash, current_points) VALUES (?, ?, ?, ?)',
      ['testuser', 'test@example.com', testPassword, 100]
    );
    
    console.log('✓ 测试用户创建成功');
    console.log('  用户名: testuser');
    console.log('  密码: 123456');
    console.log('  初始积分: 100');
    
  } catch (error) {
    console.error('创建测试用户失败:', error);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 检查环境变量
function checkEnvVars() {
  const requiredVars = [
    'DB_HOST',
    'DB_USER', 
    'DB_NAME'
  ];
  
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('缺少必要的环境变量:');
    missingVars.forEach(varName => {
      console.error(`  - ${varName}`);
    });
    console.error('\n请创建 .env 文件并配置这些变量');
    process.exit(1);
  }
  
  console.log('环境变量检查通过');
  if (!process.env.DB_PASSWORD) {
    console.log('注意：数据库密码为空，使用默认配置');
  }
}

// 主函数
async function main() {
  console.log('=== 小红书插件数据库初始化 ===\n');
  
  // 检查环境变量
  checkEnvVars();
  
  // 初始化数据库
  await initDatabase();
  
  // 创建测试用户
  if (process.argv.includes('--with-test-user')) {
    await createTestUser();
  }
  
  console.log('\n初始化完成！');
  console.log('现在可以启动服务器: npm start');
}

// 运行脚本
if (require.main === module) {
  main().catch(error => {
    console.error('初始化失败:', error);
    process.exit(1);
  });
}

module.exports = { initDatabase, createTestUser };
