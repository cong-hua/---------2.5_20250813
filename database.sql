-- 小红书发布插件积分系统数据库表结构

-- 用户表 (扩展积分字段)
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(100),
    phone VARCHAR(20),
    password_hash VARCHAR(255),
    -- 积分相关字段
    current_points INT DEFAULT 0 COMMENT '当前积分',
    total_consumed_points INT DEFAULT 0 COMMENT '累计消耗积分',
    total_recharged_points INT DEFAULT 0 COMMENT '累计充值积分',
    -- 基础字段
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
    INDEX idx_username (username),
    INDEX idx_points (current_points)
);

-- 充值记录表
CREATE TABLE IF NOT EXISTS recharge_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    order_id VARCHAR(64) NOT NULL UNIQUE COMMENT '订单ID',
    amount DECIMAL(10,2) NOT NULL COMMENT '充值金额(元)',
    points INT NOT NULL COMMENT '获得积分数量',
    exchange_rate DECIMAL(5,2) DEFAULT 10.00 COMMENT '兑换比例(1元=10积分)',
    payment_method ENUM('wechat', 'alipay') NOT NULL COMMENT '支付方式',
    payment_status ENUM('pending', 'success', 'failed', 'cancelled') DEFAULT 'pending',
    transaction_id VARCHAR(100) COMMENT '第三方交易ID',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_order_id (order_id),
    INDEX idx_payment_status (payment_status),
    INDEX idx_created_at (created_at)
);

-- 积分扣费记录表
CREATE TABLE IF NOT EXISTS points_deduction_records (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    points_deducted INT NOT NULL COMMENT '扣除的积分数量',
    action_type ENUM('publish_note', 'other') DEFAULT 'publish_note' COMMENT '扣费类型',
    action_description VARCHAR(255) COMMENT '扣费描述',
    note_id VARCHAR(100) COMMENT '关联的笔记ID(如果是发布笔记)',
    before_points INT NOT NULL COMMENT '扣费前积分',
    after_points INT NOT NULL COMMENT '扣费后积分',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_action_type (action_type),
    INDEX idx_created_at (created_at)
);

-- 积分变动日志表 (记录所有积分变动)
CREATE TABLE IF NOT EXISTS points_logs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    change_type ENUM('recharge', 'deduction', 'refund', 'admin_adjust') NOT NULL,
    points_change INT NOT NULL COMMENT '积分变动数量(正数为增加，负数为减少)',
    before_points INT NOT NULL COMMENT '变动前积分',
    after_points INT NOT NULL COMMENT '变动后积分',
    reference_id INT COMMENT '关联记录ID(充值记录ID或扣费记录ID)',
    reference_type ENUM('recharge', 'deduction') COMMENT '关联记录类型',
    description VARCHAR(255) COMMENT '变动描述',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_change_type (change_type),
    INDEX idx_created_at (created_at)
);

-- 系统配置表 (存储积分相关配置)
CREATE TABLE IF NOT EXISTS system_config (
    id INT PRIMARY KEY AUTO_INCREMENT,
    config_key VARCHAR(100) NOT NULL UNIQUE,
    config_value TEXT,
    description VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_config_key (config_key)
);

-- 插入默认配置
INSERT INTO system_config (config_key, config_value, description) VALUES
('points_exchange_rate', '10', '积分兑换比例：1元=N积分'),
('publish_note_cost', '1', '发布一篇笔记消耗的积分数'),
('min_recharge_amount', '10', '最小充值金额(元)'),
('max_recharge_amount', '1000', '最大充值金额(元)')
ON DUPLICATE KEY UPDATE 
    config_value = VALUES(config_value),
    description = VALUES(description);

