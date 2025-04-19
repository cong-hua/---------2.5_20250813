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
      console.error('无效的记录数据:', records);
      return [];
    }
    
    const { fieldMapping } = this.config;
    
    // 防止未设置字段映射
    if (!fieldMapping) {
      console.error('未设置字段映射');
      return [];
    }
    
    console.log('正在转换记录为笔记数据，共 ' + records.length + ' 条记录');
    console.log('使用字段映射:', fieldMapping);
    
    try {
      const notes = records.map((record, index) => {
        // 检查记录结构
        if (!record || !record.fields) {
          console.error(`记录 #${index} 缺少字段数据`);
          return null;
        }
        
        const { fields, record_id } = record;
        
        // 提取标题字段
        let title = '';
        if (fieldMapping.title && fields[fieldMapping.title]) {
          title = fields[fieldMapping.title];
        }
        
        // 提取正文字段
        let content = '';
        if (fieldMapping.content && fields[fieldMapping.content]) {
          content = fields[fieldMapping.content];
        }
        
        // 提取标签字段
        let tags = [];
        if (fieldMapping.tags && fields[fieldMapping.tags]) {
          const tagField = fields[fieldMapping.tags];
          
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
            tags = tagField.map(tag => {
              if (typeof tag === 'string') {
                return tag.startsWith('#') ? tag : '#' + tag;
              }
              if (typeof tag === 'object' && tag && tag.text) {
                return tag.text.startsWith('#') ? tag.text : '#' + tag.text;
              }
              return '';
            }).filter(Boolean);
          } else if (typeof tagField === 'object' && tagField !== null) {
            // 处理多选字段的情况
            if (tagField.text) {
              tags = [tagField.text.startsWith('#') ? tagField.text : '#' + tagField.text];
            } else if (tagField.options) {
              tags = tagField.options.map(opt => {
                const text = opt.text || opt.name || '';
                return text.startsWith('#') ? text : '#' + text;
              });
            }
          }
        }
        
        // 提取商品ID
        let productId = '';
        if (fieldMapping.productId && fields[fieldMapping.productId]) {
          productId = fields[fieldMapping.productId];
        }
        
        // 提取图片字段
        let imageUrls = [];
        if (fieldMapping.images && fields[fieldMapping.images]) {
          const imageField = fields[fieldMapping.images];
          
          // 尝试从不同类型的字段中提取图片URL
          if (typeof imageField === 'string') {
            // 字符串类型，可能包含多个URL
            imageUrls = imageField.split(/[,;\s]+/).filter(Boolean);
          } else if (Array.isArray(imageField)) {
            // 数组类型
            imageField.forEach(item => {
              if (typeof item === 'string') {
                imageUrls.push(item);
              } else if (item && item.url) {
                imageUrls.push(item.url);
              } else if (item && item.file && item.file.url) {
                imageUrls.push(item.file.url);
              }
            });
          } else if (imageField && typeof imageField === 'object') {
            // 对象类型，可能是附件字段
            if (imageField.url) {
              imageUrls.push(imageField.url);
            } else if (imageField.file && imageField.file.url) {
              imageUrls.push(imageField.file.url);
            }
          }
        }
        
        // 构建笔记对象
        return {
          recordId: record_id,
          title,
          content,
          tags,
          productId,
          imageUrls,
          images: [], // 存储实际图片对象
        };
      }).filter(note => note && note.title);
      
      console.log(`成功转换 ${notes.length} 条笔记数据`);
      return notes;
    } catch (error) {
      console.error('转换笔记数据失败:', error);
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
   * @param {Object} attachment 附件对象
   * @param {string} token 访问令牌
   * @returns {Promise<Blob>} 图片Blob对象
   */
  async downloadAttachment(attachment, token) {
    try {
      if (!attachment || !attachment.url) {
        throw new Error('无效的附件对象');
      }
      
      const attachmentUrl = attachment.url;
      console.log('开始下载附件:', attachmentUrl);
      
      return await this.downloadImageAsBlob(attachmentUrl, token);
    } catch (error) {
      console.error('下载附件失败:', error);
      throw error;
    }
  }
  
  /**
   * 将图片URL下载为Blob对象
   * @param {string} url 图片URL
   * @param {string} token 访问令牌
   * @returns {Promise<Blob>} 图片Blob对象
   */
  async downloadImageAsBlob(url, token = null) {
    try {
      console.log('开始下载图片:', url);
      
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
      }
      
      const blob = await response.blob();
      console.log('图片下载成功, 大小:', Math.round(blob.size / 1024), 'KB');
      
      return blob;
    } catch (error) {
      console.error('下载图片失败:', error);
      throw error;
    }
  }
  
  /**
   * 预加载笔记图片
   * @param {Array} notes 笔记数据数组
   * @returns {Promise<Array>} 更新后的笔记数据数组
   */
  async preloadImages(notes) {
    if (!notes || !Array.isArray(notes) || notes.length === 0) {
      return [];
    }
    
    try {
      const token = await this.getTenantAccessToken();
      
      // 创建进度追踪对象
      const progress = {
        total: 0,
        loaded: 0,
        failed: 0
      };
      
      // 计算需要加载的图片总数
      notes.forEach(note => {
        if (note.imageUrls && Array.isArray(note.imageUrls)) {
          progress.total += note.imageUrls.length;
        }
      });
      
      console.log(`开始预加载 ${progress.total} 张图片`);
      
      // 为每个笔记加载图片
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i];
        
        if (!note.imageUrls || !Array.isArray(note.imageUrls) || note.imageUrls.length === 0) {
          continue;
        }
        
        note.images = [];
        
        for (let j = 0; j < note.imageUrls.length; j++) {
          const url = note.imageUrls[j];
          
          try {
            console.log(`正在加载笔记 ${i+1}/${notes.length} 的第 ${j+1}/${note.imageUrls.length} 张图片`);
            
            // 下载图片
            const blob = await this.downloadImageAsBlob(url, token);
            
            // 创建对象URL
            const objectUrl = URL.createObjectURL(blob);
            
            // 添加到笔记的图片列表
            note.images.push({
              blob,
              url: objectUrl,
              originalUrl: url
            });
            
            progress.loaded++;
          } catch (error) {
            console.error(`加载图片失败: ${url}`, error);
            progress.failed++;
          }
          
          // 更新进度
          const progressPercent = Math.round((progress.loaded + progress.failed) / progress.total * 100);
          console.log(`图片加载进度: ${progressPercent}% (${progress.loaded}/${progress.total}, 失败: ${progress.failed})`);
        }
      }
      
      console.log(`图片预加载完成: 成功 ${progress.loaded}, 失败 ${progress.failed}, 总计 ${progress.total}`);
      
      return notes;
    } catch (error) {
      console.error('预加载图片失败:', error);
      throw error;
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
}

// 导出实例
const feishuClient = new FeishuBitableClient();
window.feishuClient = feishuClient; 