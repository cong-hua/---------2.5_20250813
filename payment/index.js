// 支付工厂类
const WechatPay = require('./wechat');
const AlipaySDK = require('./alipay');

class PaymentFactory {
  constructor() {
    this.wechatPay = null;
    this.alipaySDK = null;
    this.init();
  }

  // 初始化支付SDK
  init() {
    try {
      // 初始化微信支付
      if (process.env.WECHAT_APP_ID && process.env.WECHAT_MCH_ID && process.env.WECHAT_API_KEY) {
        this.wechatPay = new WechatPay({
          appId: process.env.WECHAT_APP_ID,
          mchId: process.env.WECHAT_MCH_ID,
          apiKey: process.env.WECHAT_API_KEY,
          certPath: process.env.WECHAT_CERT_PATH,
          keyPath: process.env.WECHAT_KEY_PATH,
          notifyUrl: process.env.WECHAT_NOTIFY_URL
        });
        console.log('微信支付SDK初始化成功');
      } else {
        console.warn('微信支付配置不完整，跳过初始化');
      }

      // 初始化支付宝SDK
      if (process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY && process.env.ALIPAY_PUBLIC_KEY) {
        this.alipaySDK = new AlipaySDK({
          appId: process.env.ALIPAY_APP_ID,
          privateKey: process.env.ALIPAY_PRIVATE_KEY,
          alipayPublicKey: process.env.ALIPAY_PUBLIC_KEY,
          gatewayUrl: process.env.ALIPAY_GATEWAY_URL,
          notifyUrl: process.env.ALIPAY_NOTIFY_URL,
          returnUrl: process.env.ALIPAY_RETURN_URL
        });
        console.log('支付宝SDK初始化成功');
      } else {
        console.warn('支付宝配置不完整，跳过初始化');
      }
    } catch (error) {
      console.error('支付SDK初始化失败:', error);
    }
  }

  // 创建支付订单
  async createPayment(paymentMethod, orderData) {
    try {
      switch (paymentMethod) {
        case 'wechat':
          return await this.createWechatPayment(orderData);
        case 'alipay':
          return await this.createAlipayPayment(orderData);
        default:
          throw new Error('不支持的支付方式');
      }
    } catch (error) {
      console.error('创建支付订单失败:', error);
      throw error;
    }
  }

  // 创建微信支付订单
  async createWechatPayment(orderData) {
    if (!this.wechatPay) {
      throw new Error('微信支付未初始化');
    }

    try {
      // 判断支付类型
      if (orderData.paymentType === 'h5') {
        const result = await this.wechatPay.createH5Pay(orderData);
        return {
          success: true,
          paymentMethod: 'wechat',
          paymentType: 'h5',
          paymentUrl: result.mwebUrl,
          prepayId: result.prepayId,
          orderId: result.orderId
        };
      } else {
        // 默认扫码支付
        const result = await this.wechatPay.createUnifiedOrder(orderData);
        return {
          success: true,
          paymentMethod: 'wechat',
          paymentType: 'qr',
          qrCode: result.codeUrl,
          prepayId: result.prepayId,
          orderId: result.orderId
        };
      }
    } catch (error) {
      throw new Error('创建微信支付订单失败: ' + error.message);
    }
  }

  // 创建支付宝支付订单
  async createAlipayPayment(orderData) {
    if (!this.alipaySDK) {
      throw new Error('支付宝SDK未初始化');
    }

    try {
      // 判断支付类型
      if (orderData.paymentType === 'wap') {
        const result = await this.alipaySDK.createWapPay(orderData);
        return {
          success: true,
          paymentMethod: 'alipay',
          paymentType: 'wap',
          paymentUrl: result.payUrl,
          orderId: result.orderId
        };
      } else if (orderData.paymentType === 'page') {
        const result = await this.alipaySDK.createPagePay(orderData);
        return {
          success: true,
          paymentMethod: 'alipay',
          paymentType: 'page',
          paymentUrl: result.payUrl,
          orderId: result.orderId
        };
      } else {
        // 默认扫码支付
        const result = await this.alipaySDK.createQRPay(orderData);
        return {
          success: true,
          paymentMethod: 'alipay',
          paymentType: 'qr',
          qrCode: result.qrCode,
          orderId: result.orderId
        };
      }
    } catch (error) {
      throw new Error('创建支付宝支付订单失败: ' + error.message);
    }
  }

  // 查询订单状态
  async queryOrder(paymentMethod, orderId) {
    try {
      switch (paymentMethod) {
        case 'wechat':
          if (!this.wechatPay) throw new Error('微信支付未初始化');
          return await this.wechatPay.queryOrder(orderId);
        case 'alipay':
          if (!this.alipaySDK) throw new Error('支付宝SDK未初始化');
          return await this.alipaySDK.queryOrder(orderId);
        default:
          throw new Error('不支持的支付方式');
      }
    } catch (error) {
      console.error('查询订单状态失败:', error);
      throw error;
    }
  }

  // 关闭订单
  async closeOrder(paymentMethod, orderId) {
    try {
      switch (paymentMethod) {
        case 'wechat':
          if (!this.wechatPay) throw new Error('微信支付未初始化');
          return await this.wechatPay.closeOrder(orderId);
        case 'alipay':
          if (!this.alipaySDK) throw new Error('支付宝SDK未初始化');
          return await this.alipaySDK.closeOrder(orderId);
        default:
          throw new Error('不支持的支付方式');
      }
    } catch (error) {
      console.error('关闭订单失败:', error);
      throw error;
    }
  }

  // 申请退款
  async refund(paymentMethod, refundData) {
    try {
      switch (paymentMethod) {
        case 'wechat':
          if (!this.wechatPay) throw new Error('微信支付未初始化');
          return await this.wechatPay.refund(refundData);
        case 'alipay':
          if (!this.alipaySDK) throw new Error('支付宝SDK未初始化');
          return await this.alipaySDK.refund(refundData);
        default:
          throw new Error('不支持的支付方式');
      }
    } catch (error) {
      console.error('申请退款失败:', error);
      throw error;
    }
  }

  // 验证回调通知
  verifyNotify(paymentMethod, data) {
    try {
      switch (paymentMethod) {
        case 'wechat':
          if (!this.wechatPay) return false;
          return this.wechatPay.verifyNotify(data);
        case 'alipay':
          if (!this.alipaySDK) return false;
          return this.alipaySDK.verifyNotify(data);
        default:
          return false;
      }
    } catch (error) {
      console.error('验证回调通知失败:', error);
      return false;
    }
  }

  // 获取支付方式状态
  getPaymentStatus() {
    return {
      wechat: {
        available: !!this.wechatPay,
        name: '微信支付'
      },
      alipay: {
        available: !!this.alipaySDK,
        name: '支付宝'
      }
    };
  }

  // 格式化订单数据
  formatOrderData(orderData) {
    return {
      orderId: orderData.orderId,
      amount: parseFloat(orderData.amount),
      subject: orderData.subject || '小红书插件积分充值',
      description: orderData.description || `充值 ${orderData.amount} 元`,
      clientIp: orderData.clientIp || '127.0.0.1',
      timeout: orderData.timeout || '30m',
      paymentType: orderData.paymentType || 'qr',
      returnUrl: orderData.returnUrl
    };
  }

  // 生成订单号
  static generateOrderId(prefix = 'XHS') {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 10000);
    return `${prefix}_${timestamp}_${random}`;
  }

  // 计算积分
  static calculatePoints(amount, exchangeRate = 10) {
    return Math.floor(amount * exchangeRate);
  }

  // 验证金额
  static validateAmount(amount, minAmount = 10, maxAmount = 1000) {
    const numAmount = parseFloat(amount);
    return numAmount >= minAmount && numAmount <= maxAmount;
  }

  // 支付状态映射
  static mapPaymentStatus(paymentMethod, originalStatus) {
    const statusMap = {
      wechat: {
        'SUCCESS': 'paid',
        'REFUND': 'refunded',
        'NOTPAY': 'pending',
        'CLOSED': 'closed',
        'REVOKED': 'cancelled',
        'USERPAYING': 'paying',
        'PAYERROR': 'failed'
      },
      alipay: {
        'TRADE_SUCCESS': 'paid',
        'TRADE_FINISHED': 'paid',
        'TRADE_CLOSED': 'closed',
        'WAIT_BUYER_PAY': 'pending'
      }
    };

    return statusMap[paymentMethod]?.[originalStatus] || 'unknown';
  }
}

module.exports = PaymentFactory;

