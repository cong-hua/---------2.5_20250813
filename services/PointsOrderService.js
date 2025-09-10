const mongoose = require('mongoose');
const PointsOrder = require('../models/PointsOrder');
const PointsRecord = require('../models/PointsRecord');
const UserService = require('./UserService');

class PointsOrderService {
  // 创建积分订单
  async createOrder(userId, amount, points, description = '', metadata = {}) {
    try {
      // 验证用户存在
      const user = await UserService.findById(userId);
      if (!user) {
        throw new Error('用户不存在');
      }

      // 生成订单号
      const orderNo = PointsOrder.generateOrderNo();

      // 创建订单
      const order = new PointsOrder({
        userId,
        orderNo,
        amount,
        points,
        description: description || `充值${points}积分`,
        metadata
      });

      await order.save();
      return order;
    } catch (error) {
      console.error('创建积分订单失败:', error);
      throw error;
    }
  }

  // 获取订单详情
  async getOrderById(orderId) {
    return await PointsOrder.findById(orderId).populate('userId', 'username email');
  }

  // 根据订单号获取订单
  async getOrderByNo(orderNo) {
    return await PointsOrder.findOne({ orderNo }).populate('userId', 'username email');
  }

  // 获取用户订单列表
  async getUserOrders(userId, page = 1, limit = 20, status = null) {
    try {
      // 验证ObjectId有效性
      if (!mongoose.isValidObjectId(userId)) {
        console.warn('无效的UserId:', userId);
        return { orders: [], pagination: { current: page, total: 0, totalItems: 0 } };
      }

      const skip = (page - 1) * limit;
      const matchQuery = { userId: new mongoose.Types.ObjectId(String(userId)) };
      
      if (status) {
        matchQuery.status = status;
      }

      const orders = await PointsOrder.find(matchQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await PointsOrder.countDocuments(matchQuery);

      return {
        orders,
        pagination: {
          current: page,
          total: Math.ceil(total / limit),
          totalItems: total
        }
      };
    } catch (error) {
      console.error('获取用户订单失败:', error);
      return { orders: [], pagination: { current: page, total: 0, totalItems: 0 } };
    }
  }

  // 支付订单（模拟支付）
  async payOrder(orderId, paymentMethod = 'other', paymentId = null) {
    try {
      const order = await PointsOrder.findById(orderId);
      if (!order) {
        throw new Error('订单不存在');
      }

      if (order.status !== 'pending') {
        throw new Error('订单状态不正确');
      }

      // 模拟支付过程
      // 在实际应用中，这里应该调用第三方支付接口
      const paymentSuccess = await this.simulatePayment(order);

      if (paymentSuccess) {
        // 更新订单状态
        order.status = 'paid';
        order.paymentMethod = paymentMethod;
        order.paymentId = paymentId;
        order.paidAt = new Date();
        await order.save();

        // 给用户添加积分
        await UserService.addPoints(
          order.userId,
          order.points,
          'recharge',
          order.description,
          {
            orderId: order._id,
            orderNo: order.orderNo,
            amount: order.amount
          }
        );

        return order;
      } else {
        order.status = 'failed';
        await order.save();
        throw new Error('支付失败');
      }
    } catch (error) {
      console.error('支付订单失败:', error);
      throw error;
    }
  }

  // 取消订单
  async cancelOrder(orderId) {
    try {
      const order = await PointsOrder.findById(orderId);
      if (!order) {
        throw new Error('订单不存在');
      }

      if (order.status !== 'pending') {
        throw new Error('只能取消待支付的订单');
      }

      order.status = 'cancelled';
      await order.save();

      return order;
    } catch (error) {
      console.error('取消订单失败:', error);
      throw error;
    }
  }

  // 获取订单统计
  async getOrderStats(userId) {
    try {
      if (!mongoose.isValidObjectId(userId)) {
        return { totalOrders: 0, paidOrders: 0, totalAmount: 0, totalPoints: 0 };
      }

      const stats = await PointsOrder.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(String(userId)) } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            paidOrders: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] } },
            totalAmount: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$amount', 0] } },
            totalPoints: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$points', 0] } }
          }
        }
      ]);

      return stats[0] || { totalOrders: 0, paidOrders: 0, totalAmount: 0, totalPoints: 0 };
    } catch (error) {
      console.error('获取订单统计失败:', error);
      return { totalOrders: 0, paidOrders: 0, totalAmount: 0, totalPoints: 0 };
    }
  }

  // 模拟支付（用于测试）
  async simulatePayment(order) {
    // 模拟支付延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟支付成功率为90%
    const successRate = 0.9;
    return Math.random() < successRate;
  }

  // 清理过期订单
  async cleanupExpiredOrders() {
    try {
      const expiredTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24小时前
      const result = await PointsOrder.updateMany(
        {
          status: 'pending',
          createdAt: { $lt: expiredTime }
        },
        { status: 'cancelled' }
      );

      console.log(`清理了${result.modifiedCount}个过期订单`);
      return result.modifiedCount;
    } catch (error) {
      console.error('清理过期订单失败:', error);
      throw error;
    }
  }
}

module.exports = new PointsOrderService();