// 积分管理模块
class PointsManager {
  constructor() {
    this.currentUser = null;
    this.pointsData = {
      current: 0,
      totalRecharged: 0,
      totalConsumed: 0
    };
    this.exchangeRate = 10; // 1元 = 10积分
    this.init();
  }

  init() {
    this.loadUserData();
    this.bindEvents();
  }

  // 加载用户数据
  async loadUserData() {
    try {
      // 从本地存储加载用户数据
      const userData = await chrome.storage.local.get(['currentUser', 'pointsData']);
      if (userData.currentUser) {
        this.currentUser = userData.currentUser;
      }
      if (userData.pointsData) {
        this.pointsData = userData.pointsData;
      }
      this.updatePointsDisplay();
    } catch (error) {
      console.error('加载用户数据失败:', error);
    }
  }

  // 绑定事件
  bindEvents() {
    // 积分按钮点击事件
    const pointsBtn = document.querySelector('.points-btn');
    if (pointsBtn) {
      pointsBtn.addEventListener('click', () => this.openPointsModal());
    }

    // 关闭弹窗事件
    const closeBtn = document.querySelector('.close-points-modal');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closePointsModal());
    }

    // 取消按钮
    const cancelBtn = document.getElementById('cancelRecharge');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closePointsModal());
    }

    // 预设金额按钮
    const amountBtns = document.querySelectorAll('.amount-btn');
    amountBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // 移除其他按钮的选中状态
        amountBtns.forEach(b => b.classList.remove('selected'));
        // 选中当前按钮
        btn.classList.add('selected');
        
        const amount = parseInt(btn.dataset.amount);
        document.getElementById('customAmount').value = amount;
        this.updatePointsPreview(amount);
      });
    });

    // 自定义金额输入
    const customAmountInput = document.getElementById('customAmount');
    if (customAmountInput) {
      customAmountInput.addEventListener('input', (e) => {
        // 清除预设按钮选中状态
        amountBtns.forEach(b => b.classList.remove('selected'));
        
        const amount = parseFloat(e.target.value) || 0;
        this.updatePointsPreview(amount);
      });
    }

    // 确认充值按钮
    const confirmBtn = document.getElementById('confirmRecharge');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.handleRecharge());
    }

    // 点击弹窗外部关闭
    const modal = document.getElementById('pointsModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closePointsModal();
        }
      });
    }
  }

  // 更新积分显示
  updatePointsDisplay() {
    const currentPointsElement = document.getElementById('currentPoints');
    if (currentPointsElement) {
      currentPointsElement.textContent = this.pointsData.current;
    }

    // 更新弹窗中的积分信息
    const modalCurrentPoints = document.getElementById('modalCurrentPoints');
    const modalTotalRecharged = document.getElementById('modalTotalRecharged');
    const modalTotalConsumed = document.getElementById('modalTotalConsumed');

    if (modalCurrentPoints) modalCurrentPoints.textContent = this.pointsData.current;
    if (modalTotalRecharged) modalTotalRecharged.textContent = this.pointsData.totalRecharged;
    if (modalTotalConsumed) modalTotalConsumed.textContent = this.pointsData.totalConsumed;
  }

  // 更新积分预览
  updatePointsPreview(amount) {
    const points = Math.floor(amount * this.exchangeRate);
    const previewElement = document.getElementById('previewPoints');
    if (previewElement) {
      previewElement.textContent = points;
    }
  }

  // 打开积分弹窗
  openPointsModal() {
    const modal = document.getElementById('pointsModal');
    if (modal) {
      modal.style.display = 'flex';
      this.updatePointsDisplay();
      
      // 重置表单
      document.getElementById('customAmount').value = '';
      document.getElementById('previewPoints').textContent = '0';
      document.querySelectorAll('.amount-btn').forEach(btn => btn.classList.remove('selected'));
      
      // 隐藏状态信息
      const statusElement = document.getElementById('rechargeStatus');
      if (statusElement) {
        statusElement.style.display = 'none';
        statusElement.className = 'recharge-status';
      }
    }
  }

  // 关闭积分弹窗
  closePointsModal() {
    const modal = document.getElementById('pointsModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // 处理充值
  async handleRecharge() {
    const amount = parseFloat(document.getElementById('customAmount').value);
    const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked')?.value;
    
    if (!amount || amount < 10 || amount > 1000) {
      this.showStatus('error', '请输入有效的充值金额（10-1000元）');
      return;
    }

    if (!paymentMethod) {
      this.showStatus('error', '请选择支付方式');
      return;
    }

    try {
      this.showStatus('loading', '正在创建支付订单...');
      
      // 生成订单ID
      const orderId = this.generateOrderId();
      const points = Math.floor(amount * this.exchangeRate);

      // 创建充值记录
      const rechargeRecord = {
        orderId,
        amount,
        points,
        paymentMethod,
        status: 'pending',
        timestamp: Date.now()
      };

      // 调用支付接口
      const paymentResult = await this.createPaymentOrder(rechargeRecord);
      
      if (paymentResult.success) {
        // 保存充值记录
        await this.saveRechargeRecord(rechargeRecord);
        
        // 模拟支付成功（实际项目中这里会跳转到支付页面或显示支付二维码）
        setTimeout(() => {
          this.handlePaymentSuccess(rechargeRecord);
        }, 2000);
        
        this.showStatus('loading', '支付处理中，请稍候...');
      } else {
        throw new Error(paymentResult.message || '创建支付订单失败');
      }

    } catch (error) {
      console.error('充值失败:', error);
      this.showStatus('error', `充值失败: ${error.message}`);
    }
  }

  // 生成订单ID
  generateOrderId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `XHS_${timestamp}_${random}`;
  }

  // 创建支付订单
  async createPaymentOrder(rechargeRecord) {
    // 这里应该调用后端API创建支付订单
    // 目前返回模拟数据
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          orderId: rechargeRecord.orderId,
          paymentUrl: '#', // 实际支付URL
          qrCode: '#' // 支付二维码
        });
      }, 1000);
    });
  }

  // 处理支付成功
  async handlePaymentSuccess(rechargeRecord) {
    try {
      // 更新积分
      this.pointsData.current += rechargeRecord.points;
      this.pointsData.totalRecharged += rechargeRecord.points;

      // 保存到本地存储
      await chrome.storage.local.set({
        pointsData: this.pointsData
      });

      // 更新显示
      this.updatePointsDisplay();

      // 显示成功信息
      this.showStatus('success', `充值成功！获得 ${rechargeRecord.points} 积分`);

      // 记录积分变动日志
      this.logPointsChange('recharge', rechargeRecord.points, `充值 ${rechargeRecord.amount} 元`);

      // 3秒后关闭弹窗
      setTimeout(() => {
        this.closePointsModal();
      }, 3000);

    } catch (error) {
      console.error('处理支付成功失败:', error);
      this.showStatus('error', '充值处理失败，请联系客服');
    }
  }

  // 保存充值记录
  async saveRechargeRecord(record) {
    try {
      const { rechargeRecords = [] } = await chrome.storage.local.get(['rechargeRecords']);
      rechargeRecords.push(record);
      await chrome.storage.local.set({ rechargeRecords });
    } catch (error) {
      console.error('保存充值记录失败:', error);
    }
  }

  // 扣除积分
  async deductPoints(amount, description = '消费积分') {
    if (this.pointsData.current < amount) {
      throw new Error('积分不足');
    }

    const beforePoints = this.pointsData.current;
    this.pointsData.current -= amount;
    this.pointsData.totalConsumed += amount;

    // 保存到本地存储
    await chrome.storage.local.set({
      pointsData: this.pointsData
    });

    // 更新显示
    this.updatePointsDisplay();

    // 记录扣费日志
    this.logPointsChange('deduction', -amount, description);

    // 保存扣费记录
    await this.saveDeductionRecord({
      amount,
      description,
      beforePoints,
      afterPoints: this.pointsData.current,
      timestamp: Date.now()
    });

    return true;
  }

  // 保存扣费记录
  async saveDeductionRecord(record) {
    try {
      const { deductionRecords = [] } = await chrome.storage.local.get(['deductionRecords']);
      deductionRecords.push(record);
      await chrome.storage.local.set({ deductionRecords });
    } catch (error) {
      console.error('保存扣费记录失败:', error);
    }
  }

  // 记录积分变动日志
  logPointsChange(type, change, description) {
    const logMessage = `[${new Date().toLocaleString()}] ${type === 'recharge' ? '充值' : '消费'} ${Math.abs(change)} 积分 - ${description}`;
    console.log(logMessage);
    
    // 可以添加到日志面板
    if (window.addLog) {
      window.addLog(logMessage, type === 'recharge' ? 'success' : 'info');
    }
  }

  // 显示状态信息
  showStatus(type, message) {
    const statusElement = document.getElementById('rechargeStatus');
    if (statusElement) {
      statusElement.className = `recharge-status ${type}`;
      statusElement.textContent = message;
      statusElement.style.display = type === 'loading' ? 'flex' : 'block';

      if (type === 'loading') {
        statusElement.innerHTML = `
          <div class="loading-spinner"></div>
          ${message}
        `;
      }
    }
  }

  // 检查积分是否足够
  hasEnoughPoints(amount) {
    return this.pointsData.current >= amount;
  }

  // 获取当前积分
  getCurrentPoints() {
    return this.pointsData.current;
  }

  // 获取积分数据
  getPointsData() {
    return { ...this.pointsData };
  }
}

// 导出积分管理器实例
window.pointsManager = new PointsManager();

