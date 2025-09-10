const mongoose = require('mongoose');

const pointsRecordSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  points: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['earn', 'consume']
  },
  actionType: {
    type: String,
    required: true,
    enum: ['publish_note', 'recharge', 'registration_bonus', 'daily_bonus', 'admin_adjustment', 'refund', 'other']
  },
  description: {
    type: String,
    required: true
  },
  balance: {
    type: Number,
    required: true
  },
  metadata: {
    type: Object,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// 索引
pointsRecordSchema.index({ userId: 1, createdAt: -1 });
pointsRecordSchema.index({ type: 1, createdAt: -1 });
pointsRecordSchema.index({ actionType: 1, createdAt: -1 });

// 虚拟字段：格式化的时间
pointsRecordSchema.virtual('formattedCreatedAt').get(function() {
  return this.createdAt.toLocaleString('zh-CN');
});

// 实例方法：获取详细信息
pointsRecordSchema.methods.getDetails = function() {
  return {
    id: this._id,
    points: this.points,
    type: this.type,
    actionType: this.actionType,
    description: this.description,
    balance: this.balance,
    createdAt: this.createdAt,
    formattedCreatedAt: this.formattedCreatedAt
  };
};

module.exports = mongoose.model('PointsRecord', pointsRecordSchema);