const mongoose = require('mongoose');

const pointsOrderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  orderNo: {
    type: String,
    required: true,
    unique: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  points: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'paid', 'failed', 'cancelled'],
    default: 'pending'
  },
  paymentMethod: {
    type: String,
    enum: ['alipay', 'wechat', 'other'],
    default: 'other'
  },
  paymentId: {
    type: String,
    sparse: true
  },
  description: {
    type: String,
    required: true
  },
  metadata: {
    type: Object,
    default: {}
  },
  paidAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// 索引
pointsOrderSchema.index({ userId: 1, createdAt: -1 });
pointsOrderSchema.index({ orderNo: 1 });
pointsOrderSchema.index({ status: 1, createdAt: -1 });

// 虚拟字段：格式化的时间
pointsOrderSchema.virtual('formattedCreatedAt').get(function() {
  return this.createdAt.toLocaleString('zh-CN');
});

pointsOrderSchema.virtual('formattedPaidAt').get(function() {
  return this.paidAt ? this.paidAt.toLocaleString('zh-CN') : null;
});

// 实例方法：获取详细信息
pointsOrderSchema.methods.getDetails = function() {
  return {
    id: this._id,
    orderNo: this.orderNo,
    amount: this.amount,
    points: this.points,
    status: this.status,
    paymentMethod: this.paymentMethod,
    description: this.description,
    paidAt: this.paidAt,
    createdAt: this.createdAt,
    formattedCreatedAt: this.formattedCreatedAt,
    formattedPaidAt: this.formattedPaidAt
  };
};

// 静态方法：生成订单号
pointsOrderSchema.statics.generateOrderNo = function() {
  const date = new Date();
  const timestamp = date.getTime();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `PO${timestamp}${random}`;
};

// 预保存钩子：更新更新时间
pointsOrderSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('PointsOrder', pointsOrderSchema);