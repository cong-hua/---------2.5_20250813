// 微信支付集成模块
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class WechatPay {
  constructor(config) {
    this.appId = config.appId;
    this.mchId = config.mchId;
    this.apiKey = config.apiKey;
    this.certPath = config.certPath;
    this.keyPath = config.keyPath;
    this.notifyUrl = config.notifyUrl;
    this.baseUrl = 'https://api.mch.weixin.qq.com';
  }

  // 生成签名
  generateSign(params) {
    // 按字典序排序参数
    const sortedKeys = Object.keys(params).sort();
    const stringA = sortedKeys
      .filter(key => params[key] !== '' && key !== 'sign')
      .map(key => `${key}=${params[key]}`)
      .join('&');
    
    const stringSignTemp = `${stringA}&key=${this.apiKey}`;
    return crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toUpperCase();
  }

  // 生成随机字符串
  generateNonceStr() {
    return crypto.randomBytes(16).toString('hex');
  }

  // 创建统一下单
  async createUnifiedOrder(orderData) {
    try {
      const params = {
        appid: this.appId,
        mch_id: this.mchId,
        nonce_str: this.generateNonceStr(),
        body: orderData.description || '小红书插件积分充值',
        out_trade_no: orderData.orderId,
        total_fee: Math.round(orderData.amount * 100), // 转换为分
        spbill_create_ip: orderData.clientIp || '127.0.0.1',
        notify_url: this.notifyUrl,
        trade_type: orderData.tradeType || 'NATIVE', // 扫码支付
        product_id: orderData.orderId
      };

      // 生成签名
      params.sign = this.generateSign(params);

      // 构建XML请求体
      const xmlData = this.buildXmlRequest(params);

      // 发送请求
      const response = await axios.post(`${this.baseUrl}/pay/unifiedorder`, xmlData, {
        headers: {
          'Content-Type': 'application/xml'
        }
      });

      // 解析响应
      const result = this.parseXmlResponse(response.data);
      
      if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
        return {
          success: true,
          prepayId: result.prepay_id,
          codeUrl: result.code_url, // 二维码链接
          orderId: orderData.orderId
        };
      } else {
        throw new Error(result.err_code_des || result.return_msg || '创建订单失败');
      }
    } catch (error) {
      console.error('微信支付创建订单失败:', error);
      throw new Error('创建微信支付订单失败: ' + error.message);
    }
  }

  // 查询订单状态
  async queryOrder(orderId) {
    try {
      const params = {
        appid: this.appId,
        mch_id: this.mchId,
        out_trade_no: orderId,
        nonce_str: this.generateNonceStr()
      };

      params.sign = this.generateSign(params);
      const xmlData = this.buildXmlRequest(params);

      const response = await axios.post(`${this.baseUrl}/pay/orderquery`, xmlData, {
        headers: {
          'Content-Type': 'application/xml'
        }
      });

      const result = this.parseXmlResponse(response.data);
      
      if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
        return {
          success: true,
          tradeState: result.trade_state,
          transactionId: result.transaction_id,
          totalFee: result.total_fee,
          timeEnd: result.time_end
        };
      } else {
        throw new Error(result.err_code_des || result.return_msg || '查询订单失败');
      }
    } catch (error) {
      console.error('微信支付查询订单失败:', error);
      throw new Error('查询微信支付订单失败: ' + error.message);
    }
  }

  // 关闭订单
  async closeOrder(orderId) {
    try {
      const params = {
        appid: this.appId,
        mch_id: this.mchId,
        out_trade_no: orderId,
        nonce_str: this.generateNonceStr()
      };

      params.sign = this.generateSign(params);
      const xmlData = this.buildXmlRequest(params);

      const response = await axios.post(`${this.baseUrl}/pay/closeorder`, xmlData, {
        headers: {
          'Content-Type': 'application/xml'
        }
      });

      const result = this.parseXmlResponse(response.data);
      
      return {
        success: result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS',
        message: result.err_code_des || result.return_msg || '关闭订单成功'
      };
    } catch (error) {
      console.error('微信支付关闭订单失败:', error);
      throw new Error('关闭微信支付订单失败: ' + error.message);
    }
  }

  // 验证回调签名
  verifyNotify(data) {
    try {
      const sign = data.sign;
      delete data.sign;
      
      const calculatedSign = this.generateSign(data);
      return sign === calculatedSign;
    } catch (error) {
      console.error('验证微信支付回调签名失败:', error);
      return false;
    }
  }

  // 构建XML请求体
  buildXmlRequest(params) {
    let xml = '<xml>';
    for (const key in params) {
      xml += `<${key}><![CDATA[${params[key]}]]></${key}>`;
    }
    xml += '</xml>';
    return xml;
  }

  // 解析XML响应
  parseXmlResponse(xmlData) {
    const result = {};
    const regex = /<(\w+)><!\[CDATA\[(.*?)\]\]><\/\w+>/g;
    let match;
    
    while ((match = regex.exec(xmlData)) !== null) {
      result[match[1]] = match[2];
    }
    
    // 处理没有CDATA的标签
    const simpleRegex = /<(\w+)>([^<]*)<\/\w+>/g;
    while ((match = simpleRegex.exec(xmlData)) !== null) {
      if (!result[match[1]]) {
        result[match[1]] = match[2];
      }
    }
    
    return result;
  }

  // 生成支付二维码数据
  generateQRCode(codeUrl) {
    // 这里可以集成二维码生成库，比如 qrcode
    return {
      url: codeUrl,
      base64: null // 实际项目中可以生成base64格式的二维码图片
    };
  }

  // 创建H5支付
  async createH5Pay(orderData) {
    try {
      const params = {
        appid: this.appId,
        mch_id: this.mchId,
        nonce_str: this.generateNonceStr(),
        body: orderData.description || '小红书插件积分充值',
        out_trade_no: orderData.orderId,
        total_fee: Math.round(orderData.amount * 100),
        spbill_create_ip: orderData.clientIp || '127.0.0.1',
        notify_url: this.notifyUrl,
        trade_type: 'MWEB',
        scene_info: JSON.stringify({
          h5_info: {
            type: 'Wap',
            wap_url: orderData.returnUrl || 'https://your-domain.com',
            wap_name: '小红书插件'
          }
        })
      };

      params.sign = this.generateSign(params);
      const xmlData = this.buildXmlRequest(params);

      const response = await axios.post(`${this.baseUrl}/pay/unifiedorder`, xmlData, {
        headers: {
          'Content-Type': 'application/xml'
        }
      });

      const result = this.parseXmlResponse(response.data);
      
      if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
        return {
          success: true,
          mwebUrl: result.mweb_url,
          prepayId: result.prepay_id,
          orderId: orderData.orderId
        };
      } else {
        throw new Error(result.err_code_des || result.return_msg || '创建H5支付失败');
      }
    } catch (error) {
      console.error('微信H5支付创建失败:', error);
      throw new Error('创建微信H5支付失败: ' + error.message);
    }
  }

  // 申请退款
  async refund(refundData) {
    try {
      const params = {
        appid: this.appId,
        mch_id: this.mchId,
        nonce_str: this.generateNonceStr(),
        out_trade_no: refundData.orderId,
        out_refund_no: refundData.refundId,
        total_fee: Math.round(refundData.totalAmount * 100),
        refund_fee: Math.round(refundData.refundAmount * 100),
        refund_desc: refundData.reason || '用户申请退款'
      };

      params.sign = this.generateSign(params);
      const xmlData = this.buildXmlRequest(params);

      // 退款需要使用证书
      const httpsAgent = new (require('https').Agent)({
        cert: fs.readFileSync(this.certPath),
        key: fs.readFileSync(this.keyPath)
      });

      const response = await axios.post(`${this.baseUrl}/secapi/pay/refund`, xmlData, {
        headers: {
          'Content-Type': 'application/xml'
        },
        httpsAgent
      });

      const result = this.parseXmlResponse(response.data);
      
      if (result.return_code === 'SUCCESS' && result.result_code === 'SUCCESS') {
        return {
          success: true,
          refundId: result.refund_id,
          refundFee: result.refund_fee,
          orderId: refundData.orderId
        };
      } else {
        throw new Error(result.err_code_des || result.return_msg || '申请退款失败');
      }
    } catch (error) {
      console.error('微信支付退款失败:', error);
      throw new Error('微信支付退款失败: ' + error.message);
    }
  }
}

module.exports = WechatPay;

