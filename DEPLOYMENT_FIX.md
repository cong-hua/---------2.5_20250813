# 部署修复说明

## 问题分析
Zeabur部署失败的原因是bcrypt库在Node.js v24环境下的兼容性问题。错误信息显示：
```
Error: /src/node_modules/bcrypt/lib/binding/napi-v3/bcrypt_lib.node: invalid ELF header
```

## 修复方案

### 1. 替换bcrypt为bcryptjs
- 将`package.json`中的`bcrypt`替换为`bcryptjs`
- 更新`server.js`中的引用
- 添加`postinstall`脚本确保正确构建

### 2. 更新域名配置
已将所有文件中的域名更新为实际域名：
- `server.js`: https://xhspay.zeabur.app
- `manifest.json`: https://xhspay.zeabur.app  
- `popup.js`: https://xhspay.zeabur.app

### 3. 环境变量设置
在Zeabur中设置以下环境变量：
```bash
JWT_SECRET=your-super-secret-key-change-this
DB_HOST=your-mysql-host
DB_USER=your-mysql-user
DB_PASSWORD=your-mysql-password
DB_NAME=xiaohongshu_plugin
NODE_ENV=production
```

## 部署步骤

1. **提交代码并推送到仓库**
2. **Zeabur自动重新部署**
3. **设置环境变量**
4. **测试网站访问**
5. **更新插件并测试**

## 测试清单

- [ ] 网站首页可访问
- [ ] 登录/注册功能正常
- [ ] API接口响应正常
- [ ] 插件能连接到网站
- [ ] 积分功能正常工作

## 常见问题

### Q: bcryptjs和bcrypt有什么区别？
A: bcryptjs是纯JavaScript实现，不需要编译，兼容性更好；bcrypt是原生模块，需要编译。

### Q: 如果还有部署问题怎么办？
A: 检查Zeabur的构建日志，确保所有依赖正确安装。

### Q: 如何验证修复成功？
A: 查看Zeabur的Runtime Logs，应该看到"服务器运行在端口 3000"的日志。