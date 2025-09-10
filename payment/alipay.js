// 支付宝支付集成模块
const crypto = require('crypto');
const axios = require('axios');
const moment = require('moment');

class AlipaySDK {
  constructor(config) {
    this.appId = config.appId;
    this.privateKey = config.privateKey;
    this.alipayPublicKey = config.alipayPublicKey;
    this.gatewayUrl = config.gatewayUrl || 'https://openapi.alipay.com/gateway.do';
    this.notifyUrl = config.notifyUrl;
    this.returnUrl = config.returnUrl;
    this.charset = 'utf-8';
    this.signType = 'RSA2';
    this.version = '1.0';
    this.format = 'JSON';
  }

  // 生成签名
  generateSign(params, privateKey) {
    // 按字典序排序参数
    const sortedKeys = Object.keys(params).sort();
    const stringA = sortedKeys
      .filter(key => params[key] !== '' && key !== 'sign')
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(stringA, 'utf8');
    return sign.sign(privateKey, 'base64');
  }

  // 验证签名
  verifySign(params, publicKey) {
    try {
      const sign = params.sign;
      delete params.sign;
      delete params.sign_type;
      
      const sortedKeys = Object.keys(params).sort();
      const stringA = sortedKeys
        .filter(key => params[key] !== '')
        .map(key => `${key}=${params[key]}`)
        .join('&');
      
      const verify = crypto.createVerify('RSA-SHA256');
      verify.update(stringA, 'utf8');
      return verify.verify(publicKey, sign, 'base64');
    } catch (error) {
      console.error('验证支付宝签名失败:', error);
      return false;
    }
  }

  // 构建请求参数
  buildRequestParams(method, bizContent) {
    const params = {
      app_id: this.appId,
      method,
      charset: this.charset,
      sign_type: this.signType,
      timestamp: moment().format('YYYY-MM-DD HH:mm:ss'),
      version: this.version,
      format: this.format,
      biz_content: JSON.stringify(bizContent)
    };

    if (this.notifyUrl && method.includes('pay')) {
      params.notify_url = this.notifyUrl;
    }

    if (this.returnUrl && method.includes('page')) {
      params.return_url = this.returnUrl;
    }

    // 生成签名
    params.sign = this.generateSign(params, this.privateKey);
    
    return params;
  }

  // 创建扫码支付
  async createQRPay(orderData) {
    try {
      const bizContent = {
        out_trade_no: orderData.orderId,
        total_amount: orderData.amount.toFixed(2),
        subject: orderData.subject || '小红书插件积分充值',
        body: orderData.description || '积分充值',
        timeout_express: orderData.timeout || '30m',
        product_code: 'FACE_TO_FACE_PAYMENT'
      };

      const params = this.buildRequestParams('alipay.trade.precreate', bizContent);
      
      const response = await axios.post(this.gatewayUrl, null, {
        params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const result = response.data.alipay_trade_precreate_response;
      
      if (result.code === '10000') {
        return {
          success: true,
          qrCode: result.qr_code,
          orderId: orderData.orderId,
          outTradeNo: result.out_trade_no
        };
      } else {
        throw new Error(result.sub_msg || result.msg || '创建支付宝扫码支付失败');
      }
    } catch (error) {
      console.error('支付宝扫码支付创建失败:', error);
      throw new Error('创建支付宝扫码支付失败: ' + error.message);
    }
  }

  // 创建手机网站支付
  async createWapPay(orderData) {
    try {
      const bizContent = {
        out_trade_no: orderData.orderId,
        total_amount: orderData.amount.toFixed(2),
        subject: orderData.subject || '小红书插件积分充值',
        body: orderData.description || '积分充值',
        timeout_express: orderData.timeout || '30m',
        product_code: 'QUICK_WAP_WAY'
      };

      const params = this.buildRequestParams('alipay.trade.wap.pay', bizContent);
      
      // 构建支付URL
      const payUrl = `${this.gatewayUrl}?${new URLSearchParams(params).toString()}`;
      
      return {
        success: true,
        payUrl,
        orderId: orderData.orderId
      };
    } catch (error) {
      console.error('支付宝手机网站支付创建失败:', error);
      throw new Error('创建支付宝手机网站支付失败: ' + error.message);
    }
  }

  // 创建电脑网站支付
  async createPagePay(orderData) {
    try {
      const bizContent = {
        out_trade_no: orderData.orderId,
        total_amount: orderData.amount.toFixed(2),
        subject: orderData.subject || '小红书插件积分充值',
        body: orderData.description || '积分充值',
        timeout_express: orderData.timeout || '30m',
        product_code: 'FAST_INSTANT_TRADE_PAY'
      };

      const params = this.buildRequestParams('alipay.trade.page.pay', bizContent);
      
      // 构建支付URL
      const payUrl = `${this.gatewayUrl}?${new URLSearchParams(params).toString()}`;
      
      return {
        success: true,
        payUrl,
        orderId: orderData.orderId
      };
    } catch (error) {
      console.error('支付宝电脑网站支付创建失败:', error);
      throw new Error('创建支付宝电脑网站支付失败: ' + error.message);
    }
  }

  // 查询订单状态
  async queryOrder(orderId) {
    try {
      const bizContent = {
        out_trade_no: orderId
      };

      const params = this.buildRequestParams('alipay.trade.query', bizContent);
      
      const response = await axios.post(this.gatewayUrl, null, {
        params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const result = response.data.alipay_trade_query_response;
      
      if (result.code === '10000') {
        return {
          success: true,
          tradeStatus: result.trade_status,
          tradeNo: result.trade_no,
          totalAmount: result.total_amount,
          gmtPayment: result.gmt_payment
        };
      } else {
        throw new Error(result.sub_msg || result.msg || '查询订单失败');
      }
    } catch (error) {
      console.error('支付宝查询订单失败:', error);
      throw new Error('查询支付宝订单失败: ' + error.message);
    }
  }

  // 关闭订单
  async closeOrder(orderId) {
    try {
      const bizContent = {
        out_trade_no: orderId
      };

      const params = this.buildRequestParams('alipay.trade.close', bizContent);
      
      const response = await axios.post(this.gatewayUrl, null, {
        params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const result = response.data.alipay_trade_close_response;
      
      return {
        success: result.code === '10000',
        message: result.sub_msg || result.msg || '关闭订单成功'
      };
    } catch (error) {
      console.error('支付宝关闭订单失败:', error);
      throw new Error('关闭支付宝订单失败: ' + error.message);
    }
  }

  // 申请退款
  async refund(refundData) {
    try {
      const bizContent = {
        out_trade_no: refundData.orderId,
        refund_amount: refundData.refundAmount.toFixed(2),
        refund_reason: refundData.reason || '用户申请退款',
        out_request_no: refundData.refundId
      };

      const params = this.buildRequestParams('alipay.trade.refund', bizContent);
      
      const response = await axios.post(this.gatewayUrl, null, {
        params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const result = response.data.alipay_trade_refund_response;
      
      if (result.code === '10000') {
        return {
          success: true,
          refundFee: result.refund_fee,
          gmtRefundPay: result.gmt_refund_pay,
          orderId: refundData.orderId
        };
      } else {
        throw new Error(result.sub_msg || result.msg || '申请退款失败');
      }
    } catch (error) {
      console.error('支付宝退款失败:', error);
      throw new Error('支付宝退款失败: ' + error.message);
    }
  }

  // 查询退款状态
  async queryRefund(orderId, refundId) {
    try {
      const bizContent = {
        out_trade_no: orderId,
        out_request_no: refundId
      };

      const params = this.buildRequestParams('alipay.trade.fastpay.refund.query', bizContent);
      
      const response = await axios.post(this.gatewayUrl, null, {
        params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const result = response.data.alipay_trade_fastpay_refund_query_response;
      
      if (result.code === '10000') {
        return {
          success: true,
          refundAmount: result.refund_amount,
          refundStatus: result.refund_status,
          gmtRefundPay: result.gmt_refund_pay
        };
      } else {
        throw new Error(result.sub_msg || result.msg || '查询退款失败');
      }
    } catch (error) {
      console.error('支付宝查询退款失败:', error);
      throw new Error('查询支付宝退款失败: ' + error.message);
    }
  }

  // 验证回调通知
  verifyNotify(params) {
    try {
      return this.verifySign(params, this.alipayPublicKey);
    } catch (error) {
      console.error('验证支付宝回调失败:', error);
      return false;
    }
  }

  // 转账到支付宝账户
  async transfer(transferData) {
    try {
      const bizContent = {
        out_biz_no: transferData.transferId,
        payee_type: 'ALIPAY_LOGONID',
        payee_account: transferData.payeeAccount,
        amount: transferData.amount.toFixed(2),
        payer_show_name: transferData.payerName || '小红书插件',
        payee_real_name: transferData.payeeName,
        remark: transferData.remark || '积分提现'
      };

      const params = this.buildRequestParams('alipay.fund.trans.toaccount.transfer', bizContent);
      
      const response = await axios.post(this.gatewayUrl, null, {
        params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const result = response.data.alipay_fund_trans_toaccount_transfer_response;
      
      if (result.code === '10000') {
        return {
          success: true,
          orderId: result.order_id,
          payDate: result.pay_date,
          transferId: transferData.transferId
        };
      } else {
        throw new Error(result.sub_msg || result.msg || '转账失败');
      }
    } catch (error) {
      console.error('支付宝转账失败:', error);
      throw new Error('支付宝转账失败: ' + error.message);
    }
  }

  // 查询转账状态
  async queryTransfer(transferId) {
    try {
      const bizContent = {
        out_biz_no: transferId
      };

      const params = this.buildRequestParams('alipay.fund.trans.order.query', bizContent);
      
      const response = await axios.post(this.gatewayUrl, null, {
        params,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      const result = response.data.alipay_fund_trans_order_query_response;
      
      if (result.code === '10000') {
        return {
          success: true,
          status: result.status,
          payDate: result.pay_date,
          arrivalTimeEnd: result.arrival_time_end,
          orderId: result.order_id
        };
      } else {
        throw new Error(result.sub_msg || result.msg || '查询转账失败');
      }
    } catch (error) {
      console.error('支付宝查询转账失败:', error);
      throw new Error('查询支付宝转账失败: ' + error.message);
    }
  }
}

module.exports = AlipaySDK;

