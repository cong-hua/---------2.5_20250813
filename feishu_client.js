// 飞书多维表格集成模块
// 用于在浏览器扩展中从飞书多维表格获取数据

/**
 * 飞书多维表格API客户端
 * 用于从飞书多维表格获取笔记数据
 */
class FeishuBitableClient {
  constructor() {
    // 存储访问令牌
    this.tenantAccessToken = null;
    this.tokenExpireTime = 0;
    
    // 默认配置
    this.config = {
      appId: '',
      appSecret: '',
      appToken: '',
      tableId: '',
      viewId: '',
      fieldMapping: {
        title: '标题',
        content: '正文',
        tags: '标签',
        productId: '商品ID',
        images: '图片链接'
      },
      filter: ''
    };

    // 存储结果缓存
    this.recordsCache = null;
    this.notesCache = null;
  }
  
  /**
   * 初始化客户端配置
   * @param {Object} config 配置对象
   */
  init(config) {
    this.config = { ...this.config, ...config };
    this.recordsCache = null;
    this.notesCache = null;
    console.log('飞书多维表格客户端初始化成功', this.config);
    
    // 临时显示字段映射
    console.log('【调试信息】当前字段映射配置:', JSON.stringify(this.config.fieldMapping, null, 2));
    
    // 临时修改：添加对附件字段的支持
    if (!this.config.fieldMapping.images) {
      console.log('【调试信息】未配置images字段，尝试使用附件字段');
      this.config.fieldMapping.images = '附件';
    }
  }
  
  /**
   * 获取租户访问令牌
   * @returns {Promise<string>} 访问令牌
   */
  async getTenantAccessToken() {
    // 检查现有令牌是否有效
    const now = Date.now();
    if (this.tenantAccessToken && this.tokenExpireTime > now) {
      return this.tenantAccessToken;
    }

    try {
      console.log('开始获取飞书访问令牌');
      
      // 调用API获取令牌
      const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          app_id: this.config.appId,
          app_secret: this.config.appSecret
        })
      });
      
      const data = await response.json();
      console.log('获取令牌响应:', data);
      
      if (data.code === 0) {
        this.tenantAccessToken = data.tenant_access_token;
        // 设置令牌过期时间，提前5分钟过期以确保安全
        this.tokenExpireTime = now + (data.expire - 300) * 1000;
        return this.tenantAccessToken;
      } else {
        throw new Error(`获取租户访问令牌失败: ${data.msg || '未知错误'}`);
      }
    } catch (error) {
      console.error('获取访问令牌失败:', error);
      throw error;
    }
  }
  
  /**
   * 临时调试函数 - 输出从飞书获取的原始记录字段信息
   * @param {Array} records 飞书记录数组
   */
  debugRecordFields(records) {
    if (!records || !Array.isArray(records) || records.length === 0) {
      console.log('【调试信息】无记录可供分析');
      return;
    }
    
    console.log('【调试信息】=================== 飞书记录字段分析开始 ===================');
    console.log(`【调试信息】共获取到 ${records.length} 条记录`);
    
    // 分析第一条记录
    const firstRecord = records[0];
    console.log(`【调试信息】第一条记录ID: ${firstRecord.record_id}`);
    
    if (firstRecord.fields) {
      // 输出所有字段名
      const fieldNames = Object.keys(firstRecord.fields);
      console.log(`【调试信息】记录包含的字段名 (${fieldNames.length}): ${fieldNames.join(', ')}`);
      
      // 分析每个字段
      console.log('【调试信息】逐个字段分析:');
      for (const fieldName of fieldNames) {
        const fieldValue = firstRecord.fields[fieldName];
        const valueType = typeof fieldValue;
        
        if (valueType === 'object' && fieldValue !== null) {
          if (Array.isArray(fieldValue)) {
            console.log(`【调试信息】字段 "${fieldName}": 数组类型 [${fieldValue.length}项]`);
            
            // 对数组类型，分析前三个元素
            for (let i = 0; i < Math.min(fieldValue.length, 3); i++) {
              const item = fieldValue[i];
              const itemType = typeof item;
              
              if (itemType === 'object' && item !== null) {
                console.log(`【调试信息】  - 项[${i}]: 对象类型, 属性: ${Object.keys(item).join(', ')}`);
                
                // 分析特殊属性
                if ('url' in item) {
                  console.log(`【调试信息】    * url: ${item.url.substring(0, 100)}...`);
                }
                if ('tmp_url' in item) {
                  console.log(`【调试信息】    * tmp_url: ${item.tmp_url.substring(0, 100)}...`);
                }
                if ('token' in item) {
                  console.log(`【调试信息】    * token: 存在`);
                }
                if ('name' in item) {
                  console.log(`【调试信息】    * name: ${item.name}`);
                }
                if ('type' in item) {
                  console.log(`【调试信息】    * type: ${item.type}`);
                }
              } else {
                console.log(`【调试信息】  - 项[${i}]: ${itemType}类型, 值: ${item}`);
              }
            }
          } else {
            console.log(`【调试信息】字段 "${fieldName}": 对象类型, 属性: ${Object.keys(fieldValue).join(', ')}`);
          }
        } else {
          // 简单类型
          console.log(`【调试信息】字段 "${fieldName}": ${valueType}类型, 值: ${fieldValue}`);
        }
      }
      
      // 重点检查可能包含图片的字段
      console.log('【调试信息】检查可能包含图片的字段:');
      const potentialImageFields = ['图片', '图片链接', '封面', '封面图', '图片地址', '成品', 'images', 'image', '附件'];
      
      for (const imgField of potentialImageFields) {
        if (imgField in firstRecord.fields) {
          console.log(`【调试信息】发现可能的图片字段: "${imgField}"`);
          const fieldValue = firstRecord.fields[imgField];
          
          if (Array.isArray(fieldValue)) {
            console.log(`【调试信息】"${imgField}"字段是数组，长度: ${fieldValue.length}`);
            console.log(`【调试信息】"${imgField}"字段内容:`, JSON.stringify(fieldValue, null, 2));
          } else {
            console.log(`【调试信息】"${imgField}"字段值:`, fieldValue);
          }
        }
      }
    } else {
      console.log('【调试信息】记录没有fields字段');
    }
    
    console.log('【调试信息】=================== 飞书记录字段分析结束 ===================');
  }
  
  /**
   * 获取多维表格中的所有记录
   * @param {Object} options 查询选项
   * @returns {Promise<Array>} 记录列表
   */
  async getAllRecords(options = {}) {
    try {
      // 如果已有缓存且未指定强制刷新，则返回缓存
      if (this.recordsCache && !options.forceRefresh) {
        console.log('使用缓存的记录数据', this.recordsCache.length);
        return this.recordsCache;
      }

      const token = await this.getTenantAccessToken();
      const { 
        appToken = this.config.appToken, 
        tableId = this.config.tableId,
        viewId = this.config.viewId,
        filter = this.config.filter
      } = options;
      
      console.log('获取记录的配置:', {
        appToken,
        tableId,
        viewId,
        filter
      });
      
      // 参数检查
      if (!appToken) {
        throw new Error('未提供飞书App Token');
      }
      
      if (!tableId) {
        throw new Error('未提供飞书Table ID');
      }
      
      let allRecords = [];
      let pageToken = null;
      let hasMore = true;
      let pageCount = 0;
      
      while (hasMore) {
        pageCount++;
        console.log(`开始获取第 ${pageCount} 页数据...`);
        
        // 构建查询参数
        const urlParams = new URLSearchParams();
        urlParams.append('page_size', '100');
        
        if (pageToken) {
          urlParams.append('page_token', pageToken);
        }
        
        // 添加视图ID
        if (viewId) {
          urlParams.append('view_id', viewId);
        }
        
        // 添加筛选条件
        if (filter) {
          let filterStr;
          if (typeof filter === 'string') {
            filterStr = filter;
          } else if (typeof filter === 'object') {
            filterStr = JSON.stringify(filter);
          }
          
          if (filterStr) {
            urlParams.append('filter', filterStr);
          }
        }
        
        // 构建URL
        const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records?${urlParams.toString()}`;
        
        // 发送请求
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        // 解析响应
        const result = await response.json();
        
        if (result.code !== 0) {
          console.error('API错误详情:', result);
          throw new Error(`获取记录失败: ${result.msg || '未知错误'}`);
        }
        
        if (!result.data) {
          throw new Error('API响应格式错误: 缺少data字段');
        }
        
        if (!Array.isArray(result.data.items)) {
          console.error('API响应items不是数组:', result.data);
          result.data.items = [];
        }
        
        // 将本页记录添加到总记录中
        allRecords = allRecords.concat(result.data.items);
        console.log(`当前已获取 ${allRecords.length} 条记录`);
        
        // 检查是否有下一页
        pageToken = result.data.page_token;
        hasMore = !!pageToken;
        
        // 安全措施：防止无限循环
        if (pageCount > 10) {
          console.warn('达到最大页数限制(10页)，停止获取');
          hasMore = false;
        }
      }
      
      console.log(`成功获取所有记录, 共 ${allRecords.length} 条`);
      
      // 添加：调试记录字段
      this.debugRecordFields(allRecords);
      
      this.recordsCache = allRecords;
      return allRecords;
    } catch (error) {
      console.error('获取记录失败:', error);
      throw error;
    }
  }
  
  /**
   * 将飞书记录转换为笔记数据
   * @param {Array} records 飞书记录
   * @returns {Array} 笔记数据数组
   */
  convertToNotes(records) {
    if (!records || !Array.isArray(records)) {
      console.error('[convertToNotes] 无效的记录数据:', records);
      return [];
    }
    
    const { fieldMapping } = this.config;
    
    // 添加：再次调用调试函数
    console.log('【调试信息】在convertToNotes中分析记录数据');
    this.debugRecordFields(records);
    
    // 输出当前的字段映射配置
    console.log('【调试信息】当前的字段映射配置:', JSON.stringify(fieldMapping, null, 2));
    
    // 防止未设置字段映射
    if (!fieldMapping) {
      console.error('[convertToNotes] 未设置字段映射');
      return [];
    }
    
    console.log('[convertToNotes] 正在转换记录为笔记数据，共 ' + records.length + ' 条记录');
    console.log('[convertToNotes] 使用字段映射:', fieldMapping);
    
    // 分析第一条记录的字段，帮助排查问题
    if (records.length > 0 && records[0]) {
      console.log('[convertToNotes] 第一条记录ID:', records[0].record_id);
      console.log('[convertToNotes] 第一条记录所有字段名:', Object.keys(records[0].fields || {}));
      
      // 检查图片字段是否存在
      const imageFieldName = fieldMapping.images;
      if (imageFieldName && records[0].fields) {
        console.log('[convertToNotes] 图片字段名:', imageFieldName);
        console.log('[convertToNotes] 图片字段是否存在:', imageFieldName in records[0].fields);
        
        // 输出图片字段的详细内容
        if (imageFieldName in records[0].fields) {
          const imageField = records[0].fields[imageFieldName];
          console.log('[convertToNotes] 图片字段类型:', typeof imageField);
          console.log('[convertToNotes] 图片字段内容:', JSON.stringify(imageField, null, 2));
          
          if (Array.isArray(imageField)) {
            console.log('[convertToNotes] 图片字段数组长度:', imageField.length);
            for (let i = 0; i < imageField.length && i < 5; i++) {  // 只显示前5个
              console.log(`[convertToNotes] 图片项[${i}]类型:`, typeof imageField[i]);
              console.log(`[convertToNotes] 图片项[${i}]内容:`, JSON.stringify(imageField[i], null, 2));
            }
          }
        }
      }
      
      // 检查"成品"字段是否存在
      if (records[0].fields && "成品" in records[0].fields) {
        console.log('[convertToNotes] 发现"成品"字段');
        const productImages = records[0].fields["成品"];
        console.log('[convertToNotes] "成品"字段类型:', typeof productImages);
        console.log('[convertToNotes] "成品"字段内容:', JSON.stringify(productImages, null, 2));
        
        if (Array.isArray(productImages)) {
          console.log('[convertToNotes] "成品"字段数组长度:', productImages.length);
          for (let i = 0; i < productImages.length && i < 5; i++) {  // 只显示前5个
            console.log(`[convertToNotes] "成品"项[${i}]类型:`, typeof productImages[i]);
            console.log(`[convertToNotes] "成品"项[${i}]内容:`, JSON.stringify(productImages[i], null, 2));
          }
        }
      }
      
      // 遍历所有字段，寻找可能包含图片的字段
      if (records[0].fields) {
        console.log('[convertToNotes] 检查可能包含图片的其他字段:');
        for (const fieldName in records[0].fields) {
          const fieldValue = records[0].fields[fieldName];
          
          // 检查对象类型的字段
          if (typeof fieldValue === 'object' && fieldValue !== null) {
            // 检查是否为附件字段
            if (Array.isArray(fieldValue)) {
              let hasAttachment = false;
              for (const item of fieldValue) {
                if (item && typeof item === 'object' && 
                   (item.type === 'attachment' || item.type === 'image' || 
                    item.url || item.tmp_url || item.file || 
                    (item.mime_type && item.mime_type.startsWith('image/')))) {
                  hasAttachment = true;
                  console.log(`[convertToNotes] 发现可能的图片字段: ${fieldName}`);
                  console.log(`[convertToNotes] 字段[${fieldName}]内容:`, JSON.stringify(fieldValue, null, 2));
                  break;
                }
              }
              if (hasAttachment) continue;
            } else if (fieldValue.type === 'attachment' || fieldValue.type === 'image' || 
                      fieldValue.url || fieldValue.tmp_url || fieldValue.file ||
                      (fieldValue.mime_type && fieldValue.mime_type.startsWith('image/'))) {
              console.log(`[convertToNotes] 发现可能的图片字段: ${fieldName}`);
              console.log(`[convertToNotes] 字段[${fieldName}]内容:`, JSON.stringify(fieldValue, null, 2));
            }
          }
        }
      }
    }
    
    try {
      const notes = records.map((record, index) => {
        // 检查记录结构
        if (!record || !record.fields) {
          console.error(`[convertToNotes] 记录 #${index} 缺少字段数据`);
          return null;
        }
        
        const { fields, record_id } = record;
        
        // 提取标题字段
        let title = '';
        if (fieldMapping.title && fields[fieldMapping.title] !== undefined) {
          const titleField = fields[fieldMapping.title];
          
          // 处理不同类型的标题字段
          if (typeof titleField === 'string') {
            title = titleField;
          } else if (Array.isArray(titleField) && titleField.length > 0) {
            // 如果是数组，尝试提取第一个元素
            if (typeof titleField[0] === 'string') {
              title = titleField[0];
            } else if (titleField[0] && typeof titleField[0] === 'object' && titleField[0].text) {
              // 多选字段格式
              title = titleField[0].text;
            }
          } else if (titleField && typeof titleField === 'object' && titleField.text) {
            // 单值多选字段
            title = titleField.text;
          }
        }
        
        // 提取正文字段
        let content = '';
        if (fieldMapping.content && fields[fieldMapping.content] !== undefined) {
          const contentField = fields[fieldMapping.content];
          
          // 处理不同类型的正文字段
          if (typeof contentField === 'string') {
            content = contentField;
          } else if (Array.isArray(contentField) && contentField.length > 0) {
            // 如果是数组，尝试提取第一个元素
            if (typeof contentField[0] === 'string') {
              content = contentField[0];
            } else if (contentField[0] && typeof contentField[0] === 'object' && contentField[0].text) {
              // 多选字段格式
              content = contentField[0].text;
            }
          } else if (contentField && typeof contentField === 'object' && contentField.text) {
            // 单值多选字段
            content = contentField.text;
          }
        }
        
        // 提取标签字段
        let tags = [];
        if (fieldMapping.tags && fields[fieldMapping.tags] !== undefined) {
          const tagField = fields[fieldMapping.tags];
          
          try {
            // 标签可能是字符串、数组或对象
            if (typeof tagField === 'string') {
              // 处理字符串形式的标签
              // 移除开头的 # 号并按空格或逗号分割
              tags = tagField.split(/[,\s]+/)
                .map(tag => tag.trim())
                .filter(tag => tag)
                .map(tag => tag.startsWith('#') ? tag : '#' + tag);
            } else if (Array.isArray(tagField)) {
              // 处理数组形式的标签
              tags = [];
              for (let i = 0; i < tagField.length; i++) {
                const tag = tagField[i];
                if (typeof tag === 'string') {
                  tags.push(tag.startsWith('#') ? tag : '#' + tag);
                } else if (typeof tag === 'object' && tag && tag.text) {
                  tags.push(tag.text.startsWith('#') ? tag.text : '#' + tag.text);
                }
              }
            } else if (typeof tagField === 'object' && tagField !== null) {
              // 处理多选字段的情况
              if (tagField.text) {
                tags = [tagField.text.startsWith('#') ? tagField.text : '#' + tagField.text];
              } else if (tagField.options) {
                tags = [];
                for (let i = 0; i < tagField.options.length; i++) {
                  const opt = tagField.options[i];
                  const text = opt.text || opt.name || '';
                  if (text) {
                    tags.push(text.startsWith('#') ? text : '#' + text);
                  }
                }
              }
            }
          } catch (tagError) {
            console.error('[convertToNotes] 处理标签时出错:', tagError, '标签字段值:', tagField);
            // 出错时使用空数组
            tags = [];
          }
        }
        
        // 提取商品ID
        let productId = '';
        if (fieldMapping.productId && fields[fieldMapping.productId]) {
          const productIdField = fields[fieldMapping.productId];
          
          // 处理不同类型的商品ID字段
          if (typeof productIdField === 'string') {
            productId = productIdField;
          } else if (Array.isArray(productIdField) && productIdField.length > 0) {
            // 如果是数组，尝试提取第一个元素
            if (typeof productIdField[0] === 'string') {
              productId = productIdField[0];
            } else if (productIdField[0] && typeof productIdField[0] === 'object' && productIdField[0].text) {
              // 多选字段格式
              productId = productIdField[0].text;
            }
          } else if (productIdField && typeof productIdField === 'object' && productIdField.text) {
            // 单值多选字段
            productId = productIdField.text;
          }
        }
        
        // 提取图片字段
        let imageUrls = [];
        if (fieldMapping.images && fields[fieldMapping.images]) {
          const imageField = fields[fieldMapping.images];
          
          console.log(`[convertToNotes] 记录 #${index} 的图片字段内容:`, JSON.stringify(imageField, null, 2));
          
          try {
            // 尝试从不同类型的字段中提取图片URL
            if (typeof imageField === 'string') {
              // 字符串类型，可能包含多个URL
              imageUrls = imageField.split(/[,;\s]+/).filter(Boolean);
              console.log(`[convertToNotes] 记录 #${index} 从字符串解析出 ${imageUrls.length} 张图片`);
            } else if (Array.isArray(imageField)) {
              // 数组类型
              console.log(`[convertToNotes] 记录 #${index} 图片字段为数组，长度 ${imageField.length}`);
              for (let i = 0; i < imageField.length; i++) {
                const item = imageField[i];
                console.log(`[convertToNotes] 记录 #${index} 图片项[${i}]:`, JSON.stringify(item, null, 2));
                
                if (typeof item === 'string') {
                  imageUrls.push(item);
                  console.log(`[convertToNotes] 记录 #${index} 添加字符串图片: ${item.substring(0, 50)}...`);
                } else if (item && typeof item === 'object') {
                  // 检查所有可能的属性
                  if (item.url) {
                    imageUrls.push(item.url);
                    console.log(`[convertToNotes] 记录 #${index} 添加对象.url图片: ${item.url.substring(0, 50)}...`);
                  } else if (item.tmp_url) {
                    imageUrls.push(item.tmp_url);
                    console.log(`[convertToNotes] 记录 #${index} 添加对象.tmp_url图片: ${item.tmp_url.substring(0, 50)}...`);
                  } else if (item.file && item.file.url) {
                    imageUrls.push(item.file.url);
                    console.log(`[convertToNotes] 记录 #${index} 添加对象.file.url图片: ${item.file.url.substring(0, 50)}...`);
                  } else if (item.token) {
                    // 直接添加整个对象，这可能是飞书附件token
                    imageUrls.push(item);
                    console.log(`[convertToNotes] 记录 #${index} 添加token对象图片`);
                  } else {
                    console.log(`[convertToNotes] 记录 #${index} 无法识别的图片对象格式:`, JSON.stringify(item, null, 2));
                  }
                }
              }
            } else if (imageField && typeof imageField === 'object') {
              // 对象类型，可能是附件字段
              console.log(`[convertToNotes] 记录 #${index} 图片字段为对象:`, JSON.stringify(imageField, null, 2));
              
              if (imageField.url) {
                imageUrls.push(imageField.url);
                console.log(`[convertToNotes] 记录 #${index} 添加对象.url图片: ${imageField.url.substring(0, 50)}...`);
              } else if (imageField.tmp_url) {
                imageUrls.push(imageField.tmp_url);
                console.log(`[convertToNotes] 记录 #${index} 添加对象.tmp_url图片: ${imageField.tmp_url.substring(0, 50)}...`);
              } else if (imageField.file && imageField.file.url) {
                imageUrls.push(imageField.file.url);
                console.log(`[convertToNotes] 记录 #${index} 添加对象.file.url图片: ${imageField.file.url.substring(0, 50)}...`);
              } else if (imageField.token) {
                // 直接添加整个对象，这可能是飞书附件token
                imageUrls.push(imageField);
                console.log(`[convertToNotes] 记录 #${index} 添加token对象图片`);
              }
            }
            
            // 检查其他可能包含图片的字段 - 比如"成品"字段
            const productImages = fields["成品"] || [];
            if (Array.isArray(productImages) && productImages.length > 0) {
              // 处理"成品"字段中的图片
              console.log(`[convertToNotes] 记录 #${index} "成品"字段为数组，长度 ${productImages.length}`);
              
              for (let i = 0; i < productImages.length; i++) {
                const item = productImages[i];
                console.log(`[convertToNotes] 记录 #${index} "成品"项[${i}]:`, JSON.stringify(item, null, 2));
                
                if (item && typeof item === 'object') {
                  if (item.url) {
                    imageUrls.push(item.url);
                    console.log(`[convertToNotes] 记录 #${index} 添加"成品".url图片: ${item.url.substring(0, 50)}...`);
                  } else if (item.tmp_url) {
                    imageUrls.push(item.tmp_url);
                    console.log(`[convertToNotes] 记录 #${index} 添加"成品".tmp_url图片: ${item.tmp_url.substring(0, 50)}...`);
                  } else if (item.token) {
                    // 直接添加整个对象
                    imageUrls.push(item);
                    console.log(`[convertToNotes] 记录 #${index} 添加"成品"token对象图片`);
                  } else {
                    console.log(`[convertToNotes] 记录 #${index} 无法识别的"成品"对象格式:`, JSON.stringify(item, null, 2));
                  }
                }
              }
            }
            
          } catch (imageError) {
            console.error('[convertToNotes] 处理图片字段时出错:', imageError, '图片字段值:', imageField);
            imageUrls = [];
          }
        }
        
        if (imageUrls.length > 0) {
          console.log(`[convertToNotes] 记录 #${index} (${record_id}) 找到 ${imageUrls.length} 张图片`);
          
          // 输出前几张图片信息用于调试
          for (let i = 0; i < Math.min(imageUrls.length, 3); i++) {
            const imgData = imageUrls[i];
            if (typeof imgData === 'string') {
              console.log(`[convertToNotes] 图片[${i}]为URL: ${imgData.substring(0, 100)}...`);
            } else if (typeof imgData === 'object') {
              console.log(`[convertToNotes] 图片[${i}]为对象:`, JSON.stringify(imgData, null, 2));
            } else {
              console.log(`[convertToNotes] 图片[${i}]类型: ${typeof imgData}`);
            }
          }
        } else {
          console.log(`[convertToNotes] 记录 #${index} (${record_id}) 未找到图片`);
          
          // 检查记录中的所有字段名，寻找可能包含图片的字段
          console.log(`[convertToNotes] 记录 #${index} 的所有字段:`, Object.keys(fields));
        }
        
        // 构建笔记对象
        return {
          recordId: record_id,
          title,
          body: content, // 使用body而不是content作为字段名
          tags,
          productId,
          imageUrls,
          images: [], // 存储实际图片对象
        };
      }).filter(note => note && note.title);
      
      console.log(`[convertToNotes] 成功转换 ${notes.length} 条笔记数据`);
      
      // 临时修改：尝试从多种可能的字段名中查找图片
      console.log('【调试信息】临时修改：尝试从其他字段中查找图片');
      
      // 可能包含图片的字段名列表
      const possibleImageFields = ['图片', '图片链接', '封面', '封面图', '图片地址', '成品', 'images', 'image', '附件'];
      
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        // 如果笔记已有图片，跳过
        if (note.imageUrls && note.imageUrls.length > 0) {
          continue;
        }
        
        // 找到对应的记录
        const record = records.find(r => r.record_id === note.recordId);
        if (!record || !record.fields) {
          continue;
        }
        
        // 检查所有可能的图片字段
        for (const fieldName of possibleImageFields) {
          if (record.fields[fieldName]) {
            const fieldValue = record.fields[fieldName];
            
            // 检查是否为数组
            if (Array.isArray(fieldValue) && fieldValue.length > 0) {
              console.log(`【调试信息】在笔记#${i} 中找到字段 "${fieldName}" 可能包含图片，长度: ${fieldValue.length}`);
              
              // 记录当前为空的情况
              if (!note.imageUrls || note.imageUrls.length === 0) {
                note.imageUrls = [];
                console.log(`【调试信息】笔记#${i} 之前没有图片，现在添加`);
              }
              
              // 处理数组中的每个项
              for (const item of fieldValue) {
                if (typeof item === 'string') {
                  // 字符串直接添加
                  note.imageUrls.push(item);
                  console.log(`【调试信息】添加字符串图片URL: ${item.substring(0, 100)}...`);
                } else if (item && typeof item === 'object') {
                  // 对象类型，需要检查不同的属性
                  if (item.url) {
                    note.imageUrls.push(item);
                    console.log(`【调试信息】添加带url的对象`);
                  } else if (item.tmp_url) {
                    note.imageUrls.push(item);
                    console.log(`【调试信息】添加带tmp_url的对象`);
                  } else if (item.file && item.file.url) {
                    note.imageUrls.push(item);
                    console.log(`【调试信息】添加带file.url的对象`);
                  } else if (item.token) {
                    note.imageUrls.push(item);
                    console.log(`【调试信息】添加带token的对象`);
                  } else if (item.name && (item.type === 'image' || item.type === 'attachment')) {
                    note.imageUrls.push(item);
                    console.log(`【调试信息】添加带name和type的对象`);
                  } else {
                    console.log(`【调试信息】跳过无法识别的对象: ${JSON.stringify(item, null, 2)}`);
                  }
                }
              }
            } else if (typeof fieldValue === 'string') {
              // 单个字符串
              console.log(`【调试信息】在笔记#${i} 中找到字段 "${fieldName}" 为字符串，可能是图片URL`);
              
              if (!note.imageUrls || note.imageUrls.length === 0) {
                note.imageUrls = [];
              }
              
              note.imageUrls.push(fieldValue);
              console.log(`【调试信息】添加字符串图片URL: ${fieldValue.substring(0, 100)}...`);
            } else if (fieldValue && typeof fieldValue === 'object') {
              // 单个对象
              console.log(`【调试信息】在笔记#${i} 中找到字段 "${fieldName}" 为对象`);
              
              if (!note.imageUrls || note.imageUrls.length === 0) {
                note.imageUrls = [];
              }
              
              note.imageUrls.push(fieldValue);
              console.log(`【调试信息】添加对象: ${JSON.stringify(fieldValue, null, 2)}`);
            }
          }
        }
        
        // 检查现在是否有图片
        if (note.imageUrls && note.imageUrls.length > 0) {
          console.log(`【调试信息】笔记#${i} 现在有 ${note.imageUrls.length} 张图片`);
        } else {
          console.log(`【调试信息】笔记#${i} 仍然没有图片`);
        }
      }
      
      // 输出笔记中的图片URL统计
      let notesWithImages = 0;
      let totalImageUrls = 0;
      
      for (const note of notes) {
        if (note.imageUrls && note.imageUrls.length > 0) {
          notesWithImages++;
          totalImageUrls += note.imageUrls.length;
        }
      }
      
      console.log(`[convertToNotes] 统计: ${notesWithImages}/${notes.length} 条笔记包含图片，共 ${totalImageUrls} 张图片`);
      
      return notes;
    } catch (error) {
      console.error('[convertToNotes] 转换笔记数据失败:', error);
      console.error('[convertToNotes] 错误堆栈:', error.stack);
      return [];
    }
  }
  
  /**
   * 获取笔记数据
   * @param {Object} options 查询选项
   * @returns {Promise<Array>} 笔记数据数组
   */
  async fetchNotes(options = {}) {
    try {
      // 如果已有缓存且未指定强制刷新，则返回缓存
      if (this.notesCache && !options.forceRefresh) {
        console.log('使用缓存的笔记数据', this.notesCache.length);
        return this.notesCache;
      }
      
      // 获取飞书记录
      const records = await this.getAllRecords(options);
      
      // 转换为笔记数据
      const notes = this.convertToNotes(records);
      
      // 缓存结果
      this.notesCache = notes;
      
      return notes;
    } catch (error) {
      console.error('获取笔记数据失败:', error);
      throw error;
    }
  }
  
  /**
   * 下载飞书附件
   * @param {Object|string} attachment 附件对象或URL
   * @param {string} token 访问令牌
   * @returns {Promise<Object>} 下载结果
   */
  async downloadAttachment(attachment, token) {
    console.log('[downloadAttachment] 开始下载附件:', typeof attachment === 'object' ? 
      JSON.stringify(attachment, null, 2) : attachment);
    
    try {
      // 处理字符串类型
      if (typeof attachment === 'string') {
        console.log('[downloadAttachment] 处理字符串类型的附件URL');
        return await this.downloadFeishuFile(attachment);
      }
      
      // 检查附件对象有效性
      if (!attachment || typeof attachment !== 'object') {
        throw new Error('无效的附件对象');
      }
      
      // 检查各种可能的字段
      if (attachment.url) {
        console.log('[downloadAttachment] 处理带有url字段的附件对象');
        
        // 如果有token字段，使用对象原样传递
        if (attachment.token) {
          console.log('[downloadAttachment] 附件对象包含token，直接传递');
          return await this.downloadFeishuFile(attachment);
        }
        
        // 否则使用URL和传入的token
        console.log('[downloadAttachment] 使用url字段和传入的token下载');
        const downloadObj = { url: attachment.url };
        if (token) {
          downloadObj.token = token;
        }
        return await this.downloadFeishuFile(downloadObj);
      } 
      else if (attachment.tmp_url) {
        console.log('[downloadAttachment] 处理带有tmp_url字段的附件对象');
        
        // 如果有token字段，使用对象原样传递
        if (attachment.token) {
          console.log('[downloadAttachment] 附件对象包含token，直接传递');
          return await this.downloadFeishuFile(attachment);
        }
        
        // 否则使用URL和传入的token
        console.log('[downloadAttachment] 使用tmp_url字段和传入的token下载');
        const downloadObj = { url: attachment.tmp_url };
        if (token) {
          downloadObj.token = token;
        }
        return await this.downloadFeishuFile(downloadObj);
      }
      else if (attachment.file && attachment.file.url) {
        console.log('[downloadAttachment] 处理带有file.url字段的附件对象');
        
        // 使用file.url字段
        const downloadObj = { url: attachment.file.url };
        if (token) {
          downloadObj.token = token;
        }
        return await this.downloadFeishuFile(downloadObj);
      }
      else if (attachment.token) {
        // 特殊情况：有token但没有url，可能是特殊格式
        console.log('[downloadAttachment] 附件对象只有token，无法处理');
        throw new Error('附件对象缺少URL');
      }
      else {
        console.error('[downloadAttachment] 无法识别的附件格式:', attachment);
        throw new Error('无法识别的附件格式');
      }
    } catch (error) {
      console.error('[downloadAttachment] 下载附件失败:', error);
      return {
        success: false,
        error: error.message,
        originalAttachment: attachment
      };
    }
  }
  
  /**
   * 下载图片并转换为Blob对象
   * @param {string} url 图片URL
   * @param {string} token 访问令牌
   * @returns {Promise<Object>} 下载结果
   */
  async downloadImageAsBlob(url, token = null) {
    console.log('[downloadImageAsBlob] 正在下载图片:', typeof url === 'object' ? JSON.stringify(url, null, 2) : url);
    console.log('[downloadImageAsBlob] token:', token ? token.substring(0, 10) + '...' : '无');
    
    try {
      // 检查URL是否为飞书附件
      const isAttachment = url && (
        (typeof url === 'string' && (
          url.includes('feishu.cn/space/api/box/stream/download/all') || 
          url.includes('larksuite.com/space/api/box/stream/download/all') ||
          url.includes('feishu.cn/open-apis/bitable') ||
          url.includes('larksuite.com/open-apis/bitable') ||
          url.includes('feishucdn.com/obj/') ||
          url.includes('file-robot-test.feishu.cn/space/api/box/stream/download/') ||
          url.includes('internal-api-drive-stream.feishu.cn/space/api/box/stream/download/') ||
          // 处理文档中的图片链接
          url.includes('p-') && (url.includes('/obj/') || url.includes('/images/'))
        )) || 
        typeof url === 'object'
      );
      
      if (isAttachment) {
        console.log('[downloadImageAsBlob] 检测到飞书附件:', typeof url === 'object' ? JSON.stringify(url, null, 2) : url);
        const result = await this.downloadFeishuFile(url);
        console.log('[downloadImageAsBlob] 飞书附件下载结果:', result.success ? '成功' : '失败', result.error || '');
        return result;
      }
      
      // 普通图片URL下载处理
      console.log('[downloadImageAsBlob] 使用普通下载方式获取图片:', url);
      const headers = {};
      
      // 如果没有提供token，尝试获取一个
      if (!token && (url.includes('feishu.cn') || url.includes('larksuite.com') || url.includes('feishucdn.com'))) {
        try {
          token = await this.getTenantAccessToken();
          console.log('[downloadImageAsBlob] 自动获取飞书token:', token ? '成功' : '失败');
        } catch (e) {
          console.warn('[downloadImageAsBlob] 获取token失败:', e.message);
        }
      }
      
      // 如果有token并且是飞书URL，添加授权头
      if (token && typeof url === 'string' && (
        url.includes('feishu.cn') || 
        url.includes('larksuite.com') || 
        url.includes('feishucdn.com')
      )) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('[downloadImageAsBlob] 添加授权头进行下载');
      }
      
      // 确保使用原始URL，不要修改URL中的任何参数
      console.log('[downloadImageAsBlob] 使用完整URL下载:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
        mode: 'cors'
      });
      
      if (!response.ok) {
        console.error(`[downloadImageAsBlob] 图片下载失败，HTTP状态码: ${response.status}`);
        return {
          success: false,
          error: `HTTP错误: ${response.status}`,
          statusCode: response.status
        };
      }
      
      const blob = await response.blob();
      
      if (!blob || blob.size === 0) {
        console.error('[downloadImageAsBlob] 下载的图片为空');
        return {
          success: false,
          error: '下载的图片为空',
          blob: null
        };
      }
      
      // 检查文件大小，太小可能是失败的响应
      if (blob.size < 100) {
        console.warn(`[downloadImageAsBlob] 下载的文件可能有问题，大小过小: ${blob.size} 字节`);
        
        try {
          // 尝试读取响应文本，看看是否包含错误信息
          const errorText = await response.clone().text();
          if (errorText && errorText.length < 1000) {  // 限制日志大小
            console.error('[downloadImageAsBlob] 响应内容可能包含错误:', errorText);
          }
        } catch (e) {
          // 忽略读取错误
        }
        
        return {
          success: false,
          error: `文件大小异常: ${blob.size} 字节`,
          blob: null
        };
      }
      
      // 检查MIME类型，确保是图片类型
      if (!blob.type.startsWith('image/')) {
        console.warn(`[downloadImageAsBlob] 非图片类型: ${blob.type}, 大小: ${blob.size} 字节`);
        
        // 尝试强制转换为图片类型
        try {
          const imageBlob = new Blob([blob], { type: 'image/jpeg' });
          console.log(`[downloadImageAsBlob] 强制转换为图片类型: ${imageBlob.type}, 大小: ${imageBlob.size} 字节`);
          
          // 创建blob URL
          const blobUrl = URL.createObjectURL(imageBlob);
          
          return {
            success: true,
            blob: imageBlob,
            blobUrl,
            data: imageBlob,
            converted: true
          };
        } catch (convertError) {
          console.error('[downloadImageAsBlob] 转换为图片类型失败:', convertError.message);
        }
      } else {
        console.log(`[downloadImageAsBlob] 成功下载图片, 类型: ${blob.type}, 大小: ${blob.size} 字节`);
      }
      
      // 创建blob URL
      const blobUrl = URL.createObjectURL(blob);
      
      return {
        success: true,
        blob,
        blobUrl,
        data: blob // 添加data属性，确保与downloadFeishuFile返回格式一致
      };
    } catch (error) {
      console.error('[downloadImageAsBlob] 下载图片失败:', error.message, '堆栈:', error.stack);
      return {
        success: false,
        error: error.message,
        url: url
      };
    }
  }
  
  /**
   * 预加载笔记图片
   * @param {Array} notes 笔记数据数组
   * @param {Function} progressCallback 可选的进度回调函数
   * @param {boolean} saveToLocal 是否将图片保存到本地磁盘 (默认为true)
   * @returns {Promise<Array>} 更新后的笔记数据数组
   */
  async preloadImages(notes, progressCallback, saveToLocal = true) {
    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      console.log('[preloadImages] 没有笔记数据，跳过图片预加载');
      return [];
    }
    
    console.log('[preloadImages] 开始处理笔记图片，笔记数量:', notes.length);
    console.log('[preloadImages] 图片将' + (saveToLocal ? '保存' : '不保存') + '到本地磁盘');
    
    // 详细输出日志，分析传入的笔记数据
    console.log('[preloadImages] 详细分析传入的笔记数据:');
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const noteId = note.recordId || `note_${i}`;
      
      console.log(`[preloadImages] 笔记[${i}] ID:${noteId} 标题:"${note.title}"`);
      
      // 分析imageUrls数组
      if (note.imageUrls && Array.isArray(note.imageUrls)) {
        console.log(`[preloadImages] 笔记[${i}] 包含 ${note.imageUrls.length} 个图片URL`);
        
        // 输出前3个图片URL的详细信息用于调试
        for (let j = 0; j < Math.min(note.imageUrls.length, 3); j++) {
          const imageData = note.imageUrls[j];
          if (typeof imageData === 'string') {
            console.log(`[preloadImages] 笔记[${i}] 图片[${j}] 为URL字符串:`, 
              imageData.length > 100 ? imageData.substring(0, 100) + '...' : imageData);
          } else if (typeof imageData === 'object' && imageData !== null) {
            console.log(`[preloadImages] 笔记[${i}] 图片[${j}] 为对象:`, JSON.stringify(imageData, null, 2));
            
            // 检查对象中的重要属性
            if (imageData.url) {
              console.log(`[preloadImages] 笔记[${i}] 图片[${j}] 包含url属性:`, 
                imageData.url.length > 100 ? imageData.url.substring(0, 100) + '...' : imageData.url);
            }
            if (imageData.token) {
              console.log(`[preloadImages] 笔记[${i}] 图片[${j}] 包含token属性`);
            }
            if (imageData.file && imageData.file.url) {
              console.log(`[preloadImages] 笔记[${i}] 图片[${j}] 包含file.url属性:`, 
                imageData.file.url.length > 100 ? imageData.file.url.substring(0, 100) + '...' : imageData.file.url);
            }
          } else {
            console.log(`[preloadImages] 笔记[${i}] 图片[${j}] 为不支持的类型:`, typeof imageData);
          }
        }
      } else {
        console.log(`[preloadImages] 笔记[${i}] 不包含图片URL数组`);
      }
      
      // 检查图片数组是否已经预加载
      if (note.images && Array.isArray(note.images) && note.images.length > 0) {
        console.log(`[preloadImages] 笔记[${i}] 已经有 ${note.images.length} 张预加载图片`);
      }
    }
    
    try {
      // 创建进度追踪对象
      const progress = {
        total: 0,      // 总图片数
        current: 0,    // 当前处理的图片数
        success: 0,    // 成功下载的图片数
        failed: 0,     // 失败的图片数
        skipped: 0,    // 跳过的图片数
        detail: {}     // 详细信息
      };
      
      // 计算需要加载的图片总数
      for (const note of notes) {
        // 检查imageUrls是否存在且为数组
        if (note.imageUrls && Array.isArray(note.imageUrls)) {
          progress.total += note.imageUrls.length;
        }
      }
      
      console.log(`[preloadImages] 共发现 ${progress.total} 张图片需要预加载`);
      
      // 如果提供了回调函数，初始化进度
      if (typeof progressCallback === 'function') {
        progressCallback(progress);
      }
      
      // 处理每个笔记
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        const noteId = note.recordId || `note_${i}`;
        
        // 确保images数组存在
        if (!note.images) {
          note.images = [];
        }
        
        // 确保localFiles数组存在
        if (!note.localFiles) {
          note.localFiles = [];
        }
        
        // 跳过没有图片URL的笔记
        if (!note.imageUrls || !Array.isArray(note.imageUrls) || note.imageUrls.length === 0) {
          console.log(`[preloadImages] 笔记 ${i+1}/${notes.length} (${noteId}) 没有图片，跳过`);
          continue;
        }
        
        console.log(`[preloadImages] 处理笔记 ${i+1}/${notes.length} (${noteId}) 的图片，共 ${note.imageUrls.length} 张`);
        
        // 处理每张图片
        for (let j = 0; j < note.imageUrls.length; j++) {
          const imageData = note.imageUrls[j];
          const imageIndex = j;
          
          // 检查是URL还是对象
          if (typeof imageData === 'string') {
            // URL类型
            try {
              console.log(`[preloadImages] 处理URL图片 ${j+1}/${note.imageUrls.length}: ${imageData.substring(0, 100)}...`);
              await this.processImageUrl(imageData, noteId, imageIndex, progress, saveToLocal);
            } catch (error) {
              console.error(`[preloadImages] 处理图片URL失败:`, error);
              // 错误已在processImageUrl中处理，这里不需要额外处理
            }
          } else if (imageData && typeof imageData === 'object') {
            // 对象类型（如飞书附件）
            try {
              console.log(`[preloadImages] 处理对象图片 ${j+1}/${note.imageUrls.length}:`, JSON.stringify(imageData, null, 2));
              await this.processImageObject(imageData, noteId, imageIndex, progress, saveToLocal);
            } catch (error) {
              console.error(`[preloadImages] 处理图片对象失败:`, error);
              // 错误已在processImageObject中处理，这里不需要额外处理
            }
          } else {
            // 无效类型
            console.warn(`[preloadImages] 无效的图片数据类型: ${typeof imageData}`);
            progress.skipped++;
            progress.current++;
            progress.detail[`${noteId}_${imageIndex}`] = {
              status: 'skipped',
              reason: '无效的图片数据类型'
            };
          }
          
          // 更新进度
          if (typeof progressCallback === 'function') {
            progressCallback(progress);
          }
        }
        
        // 注意: 图片资源会由processImageUrl和processImageObject添加到note.images数组中
      }
      
      console.log(`[preloadImages] 图片预加载完成: 成功 ${progress.success}, 失败 ${progress.failed}, 跳过 ${progress.skipped}, 总计 ${progress.total}`);
      
      return notes;
    } catch (error) {
      console.error('[preloadImages] 预加载图片失败:', error);
      console.error('[preloadImages] 错误堆栈:', error.stack);
      // 出错时仍然返回原始笔记，避免整体失败
      console.log('[preloadImages] 返回未完全预加载图片的笔记');
      return notes;
    }
  }
  
  /**
   * 更新记录状态
   * @param {string} recordId 记录ID
   * @param {Object} fields 要更新的字段
   * @returns {Promise<Object>} 更新结果
   */
  async updateRecordStatus(recordId, fields) {
    try {
      if (!recordId) {
        throw new Error('未提供记录ID');
      }
      
      if (!fields || Object.keys(fields).length === 0) {
        throw new Error('未提供要更新的字段');
      }
      
      const { appToken, tableId } = this.config;
      
      if (!appToken || !tableId) {
        throw new Error('缺少必要的配置: appToken 或 tableId');
      }
      
      const token = await this.getTenantAccessToken();
      
      const url = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/${recordId}`;
      
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields
        })
      });
      
      const result = await response.json();
      
      if (result.code !== 0) {
        throw new Error(`更新记录失败: ${result.msg || '未知错误'}`);
      }
      
      console.log('更新记录成功:', result);
      return result.data;
    } catch (error) {
      console.error('更新记录状态失败:', error);
      throw error;
    }
  }
  
  /**
   * 处理图片URL
   * @param {string} imageUrl 图片URL
   * @param {string} noteId 笔记ID
   * @param {number} imageIndex 图片索引
   * @param {Object} progress 进度对象
   * @param {boolean} saveToLocal 是否保存到本地
   * @returns {Promise<Object>} 处理结果
   */
  async processImageUrl(imageUrl, noteId, imageIndex, progress, saveToLocal = false) {
    // 跳过无效URL
    if (!imageUrl || typeof imageUrl !== 'string') {
      console.warn(`[processImageUrl] 无效的图片URL:`, imageUrl);
      progress.skipped++;
      progress.current++;
      progress.detail[`${noteId}_${imageIndex}`] = {
        status: 'skipped',
        reason: '无效URL'
      };
      return null;
    }
    
    // 检查是否为飞书URL，如果是则尝试获取token
    let token = null;
    if (imageUrl.includes('feishu.cn') || imageUrl.includes('feishu.com') || imageUrl.includes('feishucdn.com')) {
      try {
        token = await this.getTenantAccessToken();
      } catch (error) {
        console.error(`[processImageUrl] 获取飞书token失败:`, error);
      }
    }
    
    // 记录详细日志
    console.log(`[processImageUrl] 下载图片 ${noteId}_${imageIndex}: ${imageUrl.substring(0, 100)}...`);
    
    try {
      // 尝试下载图片
      const result = await this.downloadImageAsBlob(imageUrl, token);
      
      // 检查结果
      if (result && result.success && result.blob) {
        const blobSize = result.blob.size;
        console.log(`[processImageUrl] 图片下载成功: ${blobSize} 字节`);
        
        // 保存到本地(如果需要)
        let localFileInfo = null;
        if (saveToLocal) {
          try {
            // 从URL中提取文件名
            let fileName = 'image.jpg';
            try {
              const urlObj = new URL(imageUrl);
              const pathParts = urlObj.pathname.split('/');
              const lastPart = pathParts[pathParts.length - 1];
              if (lastPart && lastPart.length > 0) {
                fileName = lastPart;
              }
            } catch (e) {
              console.warn(`[processImageUrl] 无法从URL提取文件名:`, e);
            }
            
            localFileInfo = await this.downloadImageToLocal(result.blob, fileName);
            console.log(`[processImageUrl] 图片已处理:`, localFileInfo);
          } catch (localError) {
            console.error(`[processImageUrl] 处理图片失败:`, localError);
          }
        }
        
        // 更新进度
        progress.success++;
        progress.current++;
        progress.detail[`${noteId}_${imageIndex}`] = {
          status: 'success',
          type: 'url',
          size: blobSize,
          url: result.blobUrl || localFileInfo?.blobUrl
        };
        
        // 查找相应的笔记并添加图片
        const notes = this.notesCache || [];
        const note = notes.find(n => n.recordId === noteId);
        if (note) {
          // 确保images数组存在
          if (!note.images) {
            note.images = [];
          }
          
          // 确保localFiles数组存在
          if (!note.localFiles) {
            note.localFiles = [];
          }
          
          // 添加图片信息
          note.images.push({
            blob: result.blob,
            data: result.data || result.blob,
            url: result.blobUrl || localFileInfo?.blobUrl,
            blobUrl: result.blobUrl || localFileInfo?.blobUrl,
            originalUrl: imageUrl,
            success: true
          });
          
          // 如果有本地文件信息，添加到localFiles数组
          if (localFileInfo) {
            note.localFiles.push({
              path: localFileInfo.localPath,
              fileName: localFileInfo.fileName,
              originalName: localFileInfo.originalName,
              size: localFileInfo.size,
              type: localFileInfo.type,
              blobUrl: localFileInfo.blobUrl,
              index: imageIndex
            });
          }
        }
        
        return result;
      } else {
        throw new Error(result?.error || '图片下载失败，无结果');
      }
    } catch (error) {
      console.error(`[processImageUrl] 图片下载失败:`, error);
      
      // 更新进度
      progress.failed++;
      progress.current++;
      progress.detail[`${noteId}_${imageIndex}`] = {
        status: 'failed',
        type: 'url',
        error: error.message,
        url: imageUrl
      };
      
      // 查找相应的笔记并添加失败信息
      const notes = this.notesCache || [];
      const note = notes.find(n => n.recordId === noteId);
      if (note) {
        // 确保images数组存在
        if (!note.images) {
          note.images = [];
        }
        
        // 添加失败信息
        note.images.push({
          originalUrl: imageUrl,
          success: false,
          error: error.message,
          blobUrl: null
        });
      }
      
      throw error;
    }
  }
  
  /**
   * 处理图片对象
   * @param {Object} imageObj 图片对象
   * @param {string} noteId 笔记ID
   * @param {number} imageIndex 图片索引
   * @param {Object} progress 进度对象
   * @param {boolean} saveToLocal 是否保存到本地
   * @returns {Promise<Object>} 处理结果
   */
  async processImageObject(imageObj, noteId, imageIndex, progress, saveToLocal = false) {
    // 如果对象为空或不是对象，则跳过
    if (!imageObj || typeof imageObj !== 'object') {
      console.warn(`[processImageObject] 无效的图片对象:`, imageObj);
      progress.skipped++;
      progress.current++;
      progress.detail[`${noteId}_${imageIndex}`] = {
        status: 'skipped',
        reason: '无效对象'
      };
      return null;
    }
    
    // 检查是否包含URL或token属性
    if (!imageObj.url && !imageObj.token && !imageObj.fileToken) {
      console.warn(`[processImageObject] 图片对象缺少URL或token属性:`, imageObj);
      progress.skipped++;
      progress.current++;
      progress.detail[`${noteId}_${imageIndex}`] = {
        status: 'skipped',
        reason: '缺少URL或token'
      };
      return null;
    }
    
    // 如果包含URL，则尝试直接下载
    if (imageObj.url) {
      return this.processImageUrl(imageObj.url, noteId, imageIndex, progress, saveToLocal);
    }
    
    // 构建fileInfo对象
    const fileInfo = {
      token: imageObj.token || imageObj.fileToken,
      fileToken: imageObj.token || imageObj.fileToken,
      name: imageObj.name || 'attachment.jpg'
    };
    
    try {
      // 记录详细日志
      console.log(`[processImageObject] 下载附件 ${noteId}_${imageIndex}: token=${fileInfo.token}`);
      
      // 尝试下载附件
      const result = await this.downloadFeishuFile(fileInfo);
      
      // 检查结果
      if (result && result.success && result.blob) {
        const blobSize = result.blob.size;
        console.log(`[processImageObject] 附件下载成功: ${blobSize} 字节`);
        
        // 保存到本地(如果需要)
        let localFileInfo = null;
        if (saveToLocal) {
          try {
            const fileName = fileInfo.name || 'attachment.jpg';
            localFileInfo = await this.downloadImageToLocal(result.blob, fileName);
            console.log(`[processImageObject] 图片已处理:`, localFileInfo);
          } catch (localError) {
            console.error(`[processImageObject] 处理图片失败:`, localError);
          }
        }
        
        // 更新进度
        progress.success++;
        progress.current++;
        progress.detail[`${noteId}_${imageIndex}`] = {
          status: 'success',
          type: 'attachment',
          size: blobSize,
          url: result.blobUrl || localFileInfo?.blobUrl
        };
        
        // 查找相应的笔记并添加图片
        const notes = this.notesCache || [];
        const note = notes.find(n => n.recordId === noteId);
        if (note) {
          // 确保images数组存在
          if (!note.images) {
            note.images = [];
          }
          
          // 确保localFiles数组存在
          if (!note.localFiles) {
            note.localFiles = [];
          }
          
          // 添加图片信息
          note.images.push({
            blob: result.blob,
            data: result.data || result.blob,
            url: result.blobUrl || localFileInfo?.blobUrl,
            blobUrl: result.blobUrl || localFileInfo?.blobUrl,
            originalObj: imageObj,
            success: true
          });
          
          // 如果有本地文件信息，添加到localFiles数组
          if (localFileInfo) {
            note.localFiles.push({
              path: localFileInfo.localPath,
              fileName: localFileInfo.fileName,
              originalName: localFileInfo.originalName,
              size: localFileInfo.size,
              type: localFileInfo.type,
              blobUrl: localFileInfo.blobUrl,
              index: imageIndex
            });
          }
        }
        
        return result;
      } else {
        throw new Error(result?.error || '附件下载失败，无结果');
      }
    } catch (error) {
      console.error(`[processImageObject] 附件下载失败:`, error);
      
      // 更新进度
      progress.failed++;
      progress.current++;
      progress.detail[`${noteId}_${imageIndex}`] = {
        status: 'failed',
        type: 'attachment',
        error: error.message,
        token: fileInfo.token
      };
      
      // 查找相应的笔记并添加失败信息
      const notes = this.notesCache || [];
      const note = notes.find(n => n.recordId === noteId);
      if (note) {
        // 确保images数组存在
        if (!note.images) {
          note.images = [];
        }
        
        // 添加失败信息
        note.images.push({
          originalObj: imageObj,
          success: false,
          error: error.message,
          blobUrl: null
        });
      }
      
      throw error;
    }
  }

  /**
   * 下载飞书文件
   * @param {string|Object} fileInfo 飞书文件信息，可能是URL或包含文件信息的对象
   * @returns {Promise<Object>} 下载结果对象
   */
  async downloadFeishuFile(fileInfo) {
    console.log('[downloadFeishuFile] 开始下载飞书文件:', typeof fileInfo === 'object' ? JSON.stringify(fileInfo, null, 2) : fileInfo);
    
    try {
      // 初始化token为null，可能需要动态获取
      let token = null;
      let downloadUrl = null;
      
      // 处理对象类型的文件信息
      if (typeof fileInfo === 'object' && fileInfo !== null) {
        console.log('[downloadFeishuFile] 处理对象类型的文件信息');
        
        // 检查是否为飞书多维表格附件格式
        if (fileInfo.token) {
          // 飞书多维表格的附件格式，包含token用于授权
          console.log('[downloadFeishuFile] 检测到飞书多维表格附件格式，包含token');
          token = fileInfo.token;
          
          // 检查文件URL
          if (fileInfo.url) {
            downloadUrl = fileInfo.url;
            console.log('[downloadFeishuFile] 使用fileInfo.url下载附件');
          } else if (fileInfo.tmp_url) {
            downloadUrl = fileInfo.tmp_url;
            console.log('[downloadFeishuFile] 使用fileInfo.tmp_url下载附件');
          } else {
            throw new Error('附件对象缺少url或tmp_url属性');
          }
        } else if (fileInfo.url) {
          // 简单对象，包含URL但不包含token
          downloadUrl = fileInfo.url;
          console.log('[downloadFeishuFile] 使用fileInfo.url下载附件，不包含token');
          
          // 尝试获取token
          try {
            token = await this.getTenantAccessToken();
            console.log('[downloadFeishuFile] 获取飞书token成功');
          } catch (error) {
            console.warn('[downloadFeishuFile] 获取token失败，可能影响下载:', error.message);
          }
        } else if (fileInfo.tmp_url) {
          // 包含临时URL的对象
          downloadUrl = fileInfo.tmp_url;
          console.log('[downloadFeishuFile] 使用fileInfo.tmp_url下载附件');
          
          // 尝试获取token
          try {
            token = await this.getTenantAccessToken();
            console.log('[downloadFeishuFile] 获取飞书token成功');
          } catch (error) {
            console.warn('[downloadFeishuFile] 获取token失败，可能影响下载:', error.message);
          }
        } else if (fileInfo.file && fileInfo.file.url) {
          // 嵌套的file对象
          downloadUrl = fileInfo.file.url;
          console.log('[downloadFeishuFile] 使用fileInfo.file.url下载附件');
          
          // 尝试获取token
          try {
            token = await this.getTenantAccessToken();
            console.log('[downloadFeishuFile] 获取飞书token成功');
          } catch (error) {
            console.warn('[downloadFeishuFile] 获取token失败，可能影响下载:', error.message);
          }
        } else {
          console.error('[downloadFeishuFile] 附件对象格式不支持:', fileInfo);
          throw new Error('不支持的附件对象格式');
        }
      } else if (typeof fileInfo === 'string') {
        // 字符串URL类型
        downloadUrl = fileInfo;
        console.log('[downloadFeishuFile] 使用字符串URL下载附件');
        
        // 检查是否为飞书域名
        if (downloadUrl.includes('feishu.cn') || 
            downloadUrl.includes('larksuite.com') || 
            downloadUrl.includes('feishucdn.com')) {
          // 尝试获取token
          try {
            token = await this.getTenantAccessToken();
            console.log('[downloadFeishuFile] 获取飞书token成功');
          } catch (error) {
            console.warn('[downloadFeishuFile] 获取token失败，可能影响下载:', error.message);
          }
        }
      } else {
        console.error('[downloadFeishuFile] 不支持的文件信息类型:', typeof fileInfo);
        throw new Error(`不支持的文件信息类型: ${typeof fileInfo}`);
      }
      
      if (!downloadUrl) {
        throw new Error('无法提取下载URL');
      }
      
      console.log('[downloadFeishuFile] 开始下载文件，URL:', downloadUrl);
      
      // 准备请求头
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        console.log('[downloadFeishuFile] 添加授权头');
      }
      
      // 发送请求
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers,
        credentials: 'include',
        mode: 'cors'
      });
      
      if (!response.ok) {
        console.error(`[downloadFeishuFile] 下载失败，HTTP状态码: ${response.status}`);
        
        try {
          // 尝试读取错误响应
          const errorText = await response.text();
          console.error('[downloadFeishuFile] 错误响应:', errorText);
        } catch (e) {
          // 忽略读取错误
        }
        
        return {
          success: false,
          error: `HTTP错误: ${response.status}`,
          statusCode: response.status
        };
      }
      
      // 获取响应Blob
      const blob = await response.blob();
      
      // 检查Blob有效性
      if (!blob || blob.size === 0) {
        console.error('[downloadFeishuFile] 下载的文件为空');
        return {
          success: false,
          error: '下载的文件为空',
          blob: null
        };
      }
      
      // 检查文件大小，太小可能是失败的响应
      if (blob.size < 100) {
        console.warn(`[downloadFeishuFile] 下载的文件可能有问题，大小过小: ${blob.size} 字节`);
        
        try {
          // 尝试读取响应文本，看看是否包含错误信息
          const errorText = await response.clone().text();
          console.error('[downloadFeishuFile] 响应内容:', errorText);
        } catch (e) {
          // 忽略读取错误
        }
        
        return {
          success: false,
          error: `文件大小异常: ${blob.size} 字节`,
          blob: null
        };
      }
      
      console.log(`[downloadFeishuFile] 下载成功，大小: ${blob.size} 字节，类型: ${blob.type}`);
      
      // 创建blob URL
      const blobUrl = URL.createObjectURL(blob);
      
      // 返回成功结果
      const result = {
        success: true,
        blob,
        blobUrl,
        data: blob, // 添加data属性保持一致性
        originalUrl: downloadUrl,
        fileInfo
      };
      
      // 确保result有data属性
      if (!result.data) {
        result.data = blob;
      }
      
      return result;
    } catch (error) {
      console.error('[downloadFeishuFile] 下载失败:', error);
      return {
        success: false,
        error: error.message,
        fileInfo
      };
    }
  }

  /**
   * 将图片下载到本地磁盘
   * @param {Blob} blob 图片Blob对象
   * @param {string} fileName 文件名
   * @returns {Promise<Object>} 下载结果，包含本地文件路径
   */
  async downloadImageToLocal(blob, fileName) {
    if (!blob) {
      console.error('[downloadImageToLocal] Blob为空，无法保存');
      return {
        fileName: fileName || 'image.jpg',
        originalName: fileName || 'image.jpg',
        localPath: null,
        size: 0,
        type: 'image/jpeg',
        timestamp: new Date().getTime(),
        isMemoryOnly: true
      };
    }
    
    // 确保文件名有效
    const safeFileName = this.getSafeFileName(fileName || 'image.jpg');
    
    try {
      // 检查是否可以使用chrome.downloads
      if (typeof chrome === 'undefined' || !chrome.downloads) {
        console.log('[downloadImageToLocal] chrome.downloads API不可用，使用内存模式');
        
        // 创建Blob URL (作为内存中的表示)
        const blobUrl = URL.createObjectURL(blob);
        
        return {
          fileName: safeFileName,
          originalName: safeFileName,
          localPath: null,
          size: blob.size,
          type: blob.type,
          timestamp: new Date().getTime(),
          blobUrl: blobUrl,
          data: blob
        };
      }
      
      console.log('[downloadImageToLocal] 使用chrome.downloads API下载图片');
      
      // 创建Blob URL
      const blobUrl = URL.createObjectURL(blob);
      
      // 构建文件名
      const timestamp = new Date().getTime();
      const fullFileName = `${timestamp}_${safeFileName}`;
      
      // 使用chrome.downloads API下载文件
      return new Promise((resolve, reject) => {
        chrome.downloads.download({
          url: blobUrl,
          filename: `feishu_images/${fullFileName}`,
          saveAs: false,
          conflictAction: 'uniquify'
        }, (downloadId) => {
          // 检查是否有错误
          if (chrome.runtime.lastError) {
            console.error('[downloadImageToLocal] 下载API错误:', chrome.runtime.lastError);
            URL.revokeObjectURL(blobUrl);
            
            // 失败时返回内存中的对象
            resolve({
              fileName: safeFileName,
              originalName: safeFileName,
              localPath: null,
              size: blob.size,
              type: blob.type,
              timestamp: new Date().getTime(),
              blobUrl: blobUrl,
              data: blob,
              error: chrome.runtime.lastError.message
            });
            return;
          }
          
          if (downloadId === undefined) {
            console.warn('[downloadImageToLocal] 下载ID未定义，可能取消下载');
            URL.revokeObjectURL(blobUrl);
            
            // 返回内存中的对象
            resolve({
              fileName: safeFileName,
              originalName: safeFileName,
              localPath: null,
              size: blob.size,
              type: blob.type,
              timestamp: new Date().getTime(),
              blobUrl: blobUrl,
              data: blob
            });
            return;
          }
          
          console.log(`[downloadImageToLocal] 开始下载，ID: ${downloadId}`);
          
          const onChanged = function(delta) {
            if (delta.id !== downloadId) return;
            
            console.log(`[downloadImageToLocal] 下载状态变化:`, delta);
            
            // 下载完成
            if (delta.state && delta.state.current === 'complete') {
              chrome.downloads.onChanged.removeListener(onChanged);
              
              // 查询下载项
              chrome.downloads.search({id: downloadId}, (results) => {
                if (!results || results.length === 0) {
                  console.warn('[downloadImageToLocal] 找不到下载项');
                  URL.revokeObjectURL(blobUrl);
                  
                  // 返回内存中的对象
                  resolve({
                    fileName: safeFileName,
                    originalName: safeFileName,
                    localPath: null,
                    size: blob.size,
                    type: blob.type,
                    timestamp: new Date().getTime(),
                    blobUrl: blobUrl,
                    data: blob
                  });
                  return;
                }
                
                const download = results[0];
                console.log(`[downloadImageToLocal] 下载完成:`, download);
                
                URL.revokeObjectURL(blobUrl);
                
                // 获取本地文件路径
                const localPath = download.filename;
                
                resolve({
                  fileName: fullFileName,
                  originalName: safeFileName,
                  localPath: localPath,
                  size: blob.size,
                  type: blob.type,
                  timestamp: timestamp,
                  downloadId: downloadId,
                  isLocalFile: true,
                  blobUrl: blobUrl, // 保留blobUrl作为备用
                  data: blob // 保留数据作为备用
                });
              });
            }
            
            // 下载错误
            if (delta.error) {
              chrome.downloads.onChanged.removeListener(onChanged);
              console.error(`[downloadImageToLocal] 下载错误: ${delta.error.current}`);
              URL.revokeObjectURL(blobUrl);
              
              // 返回内存中的对象
              resolve({
                fileName: safeFileName,
                originalName: safeFileName,
                localPath: null,
                size: blob.size,
                type: blob.type,
                timestamp: new Date().getTime(),
                blobUrl: blobUrl,
                data: blob,
                error: delta.error.current
              });
            }
          };
          
          chrome.downloads.onChanged.addListener(onChanged);
          
          // 添加超时处理
          setTimeout(() => {
            chrome.downloads.search({id: downloadId}, (results) => {
              if (results && results.length > 0 && results[0].state !== 'complete') {
                console.warn('[downloadImageToLocal] 下载超时，使用内存模式');
                chrome.downloads.onChanged.removeListener(onChanged);
                
                // 返回内存中的对象
                resolve({
                  fileName: safeFileName,
                  originalName: safeFileName,
                  localPath: null,
                  size: blob.size,
                  type: blob.type,
                  timestamp: new Date().getTime(),
                  blobUrl: blobUrl,
                  data: blob,
                  error: '下载超时'
                });
              }
            });
          }, 10000); // 10秒超时
        });
      });
    } catch (error) {
      console.error(`[downloadImageToLocal] 保存图片失败:`, error);
      
      // 创建Blob URL作为备用
      const blobUrl = URL.createObjectURL(blob);
      
      // 出错时返回一个模拟的结果，保持兼容性
      return {
        fileName: safeFileName,
        originalName: safeFileName,
        localPath: null,
        size: blob.size,
        type: blob.type,
        timestamp: new Date().getTime(),
        error: error.message,
        isMemoryOnly: true,
        blobUrl: blobUrl,
        data: blob
      };
    }
  }
  
  /**
   * 获取安全的文件名
   * @param {string} fileName 原始文件名
   * @returns {string} 安全的文件名
   */
  getSafeFileName(fileName) {
    if (!fileName) return 'image.jpg';
    
    // 移除不安全的字符
    let safeName = fileName.replace(/[\\/:*?"<>|]/g, '_');
    
    // 确保文件名不超过100字符
    if (safeName.length > 100) {
      const ext = path.extname(safeName);
      const baseName = path.basename(safeName, ext);
      safeName = baseName.substring(0, 95 - ext.length) + ext;
    }
    
    return safeName;
  }
}

// 导出实例
const feishuClient = new FeishuBitableClient();
window.feishuClient = feishuClient;