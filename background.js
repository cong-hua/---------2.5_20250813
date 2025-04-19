// 修改发布状态对象
let publishState = {
  isPublishing: false,
  currentIndex: 0,
  totalNotes: 0,
  publishConfig: null,
  tabId: null,
  currentAction: '',
  waitTime: 0
};

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 立即返回 true 表示我们将异步发送响应
  const handleMessage = async () => {
    switch (message.type) {
      case 'START_PUBLISH':
        await startPublishing(message.data);
        return { success: true };
      case 'GET_STATE':
        return publishState;
      case 'STOP_PUBLISH':
        await stopPublishing();
        return { success: true };
    }
  };

  // 使用 Promise 处理异步响应
  handleMessage().then(response => {
    if (sendResponse) {
      sendResponse(response);
    }
  }).catch(error => {
    console.error('处理消息出错:', error);
    if (sendResponse) {
      sendResponse({ error: error.message });
    }
  });

  // 返回 true 表示我们会异步调用 sendResponse
  return true;
});

// 修改开始发布函数
async function startPublishing(data) {
  if (publishState.isPublishing) return;

  try {
    // 重置发布状态
    publishState = {
      isPublishing: true,
      currentIndex: 0,
      totalNotes: data.notes.length,
      publishConfig: {
        intervalType: data.publishConfig.intervalType,
        fixedInterval: data.publishConfig.fixedInterval,
        minInterval: data.publishConfig.minInterval,
        maxInterval: data.publishConfig.maxInterval
      },
      tabId: null,
      currentAction: '准备发布',
      waitTime: 0
    };

    // 创建新标签页
    const tab = await chrome.tabs.create({
      url: 'https://creator.xiaohongshu.com/publish/publish',
      active: true
    });
    publishState.tabId = tab.id;

    // 开始发布循环
    for (let i = 0; i < data.notes.length; i++) {
      if (!publishState.isPublishing) break;

      try {
        // 发布当前笔记
        await publishNote(data.notes[i]);
        
        // 更新进度
        publishState.currentIndex = i + 1;
        notifyPopup('NOTE_PUBLISHED', {
          index: i,
          total: data.notes.length
        });

        // 如果不是最后一篇，等待指定时间
        if (i < data.notes.length - 1) {
          const waitTime = calculateWaitTime();
          publishState.waitTime = waitTime;
          publishState.currentAction = '等待发布下一篇';
          
          notifyPopup('WAITING', {
            nextIndex: i + 1,
            waitTime,
            currentTime: new Date().toLocaleTimeString()
          });
          
          await wait(waitTime);
        }

      } catch (error) {
        console.error('发布笔记失败:', error);
        notifyPopup('ERROR', error.message);
        await handleError();
        break;
      }
    }

    // 发布完成
    if (publishState.currentIndex >= data.notes.length) {
      notifyPopup('COMPLETED');
    }

    // 清理状态
    await cleanup();

  } catch (error) {
    console.error('启动发布失败:', error);
    notifyPopup('ERROR', error.message);
    await cleanup();
  }
}

// 计算等待时间
function calculateWaitTime() {
  const config = publishState.publishConfig;
  if (config.intervalType === 'random') {
    return Math.floor(
      Math.random() * (config.maxInterval - config.minInterval + 1)
    ) + config.minInterval;
  }
  return config.fixedInterval;
}

// 错误处理
async function handleError() {
  publishState.isPublishing = false;
  
  // 尝试关闭发布标签页
  try {
    if (publishState.tabId) {
      await chrome.tabs.remove(publishState.tabId);
    }
  } catch (error) {
    console.error('关闭标签页失败:', error);
  }
}

// 修改通知函数
function notifyPopup(type, data) {
  const time = new Date().toLocaleTimeString();
  let message = '';

  // 根据不同类型的消息生成日志内容
  switch (type) {
    case 'START_PUBLISH':
      message = `[${time}] 开始发布任务，共 ${publishState.totalNotes} 篇笔记`;
      break;
    case 'NOTE_PUBLISHED':
      message = `[${time}] 成功发布第 ${data.index + 1}/${data.total} 篇笔记`;
      break;
    case 'WAITING':
      const nextTime = new Date(Date.now() + data.waitTime * 1000).toLocaleTimeString();
      message = `[${time}] 等待发布第 ${data.nextIndex + 1} 篇笔记...
预计发布时间: ${nextTime}
等待时间: ${data.waitTime} 秒`;
      break;
    case 'ACTION_UPDATE':
      message = `[${time}] 正在发布第 ${publishState.currentIndex + 1} 篇：${publishState.currentAction}`;
      break;
    case 'ERROR':
      message = `[${time}] 发布出错: ${data}`;
      break;
    case 'COMPLETED':
      message = `[${time}] 所有笔记发布完成！`;
      break;
    case 'STOPPED':
      message = `[${time}] 已停止发布`;
      break;
    case 'COUNTDOWN':
      message = `[${time}] 倒计时: ${data.remainingTime}/${data.totalTime} 秒`;
      break;
    default:
      message = `[${time}] ${publishState.currentAction}`;
  }

  // 保存状态
  chrome.storage.local.set({
    pState: {
      i: publishState.isPublishing,
      c: publishState.currentIndex,
      t: publishState.totalNotes,
      a: publishState.currentAction,
      w: publishState.waitTime
    }
  });

  // 发送消息到 popup
  chrome.runtime.sendMessage({
    type: 'STATUS_UPDATE',
    data: {
      message,
      state: {
        isPublishing: publishState.isPublishing,
        currentIndex: publishState.currentIndex,
        totalNotes: publishState.totalNotes,
        currentAction: publishState.currentAction,
        waitTime: publishState.waitTime,
        time,
        countdown: type === 'COUNTDOWN' ? {
          current: data.remainingTime,
          total: data.totalTime
        } : null
      }
    }
  }).catch(() => {});
}

// 修改清理函数
async function cleanup() {
  publishState = {
    isPublishing: false,
    currentIndex: 0,
    totalNotes: 0,
    publishConfig: null,
    tabId: null,
    currentAction: '',
    waitTime: 0
  };
  
  await chrome.storage.local.remove(['pState']);
}

// 停止发布
async function stopPublishing() {
  // 设置发布状态为停止
  publishState.isPublishing = false;
  publishState.currentAction = '已停止发布';
  publishState.waitTime = 0;
  
  // 通知 popup 已停止
  notifyPopup('STOPPED');
  
  // 记录日志
  console.log('发布任务被手动停止', publishState);
  
  // 尝试关闭发布标签页
  try {
    if (publishState.tabId) {
      await chrome.tabs.remove(publishState.tabId);
      publishState.tabId = null;
    }
  } catch (error) {
    console.error('关闭标签页失败:', error);
  }
  
  // 清理存储的状态
  await chrome.storage.local.set({
    pState: {
      i: false,
      c: publishState.currentIndex,
      t: publishState.totalNotes,
      a: '已停止发布',
      w: 0
    }
  });
  
  return { success: true };
}

// 在扩展启动时恢复状态
chrome.runtime.onStartup.addListener(async () => {
  try {
    const data = await chrome.storage.local.get('pState');
    if (data.pState && data.pState.i) {
      publishState = {
        isPublishing: data.pState.i,
        currentIndex: data.pState.c,
        totalNotes: data.pState.t,
        publishConfig: {
          intervalType: data.pState.intervalType,
          fixedInterval: data.pState.fixedInterval,
          minInterval: data.pState.minInterval,
          maxInterval: data.pState.maxInterval
        },
        tabId: null,
        currentAction: data.pState.a,
        waitTime: data.pState.w
      };
      await startPublishing({ notes: [], publishConfig: { intervalType: data.pState.intervalType, fixedInterval: data.pState.fixedInterval, minInterval: data.pState.minInterval, maxInterval: data.pState.maxInterval } });
    }
  } catch (error) {
    console.error('恢复状态失败:', error);
  }
});

// 修改发布笔记函数
async function publishNote(noteData) {
  try {
    // 更新上传图片状态
    publishState.currentAction = '正在上传图片...';
    notifyPopup('ACTION_UPDATE');

    // 获取当前标签页
    publishState.currentAction = '打开发布页面';
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    await chrome.tabs.update(tab.id, { 
      url: 'https://creator.xiaohongshu.com/publish/publish?source=official&from=tab_switch' 
    });
    
    // 等待页面加载
    publishState.currentAction = '等待页面加载';
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 点击图文按钮
    publishState.currentAction = '点击图文按钮';
    const clickTextResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: () => {
        return new Promise((resolve) => {
          const waitForButton = setInterval(() => {
            const btn = document.querySelector('#web > div.outarea.upload-c > div > div > div.header > div:nth-child(2) > span');
            if (btn) {
              clearInterval(waitForButton);
              btn.click();
              resolve({ success: true });
            }
          }, 1000);

          // 20秒后超时
          setTimeout(() => {
            clearInterval(waitForButton);
            resolve({ success: false, error: '未找到图文按钮' });
          }, 20000);
        });
      }
    });

    if (!clickTextResult[0].result.success) {
      throw new Error(clickTextResult[0].result.error);
    }

    // 等待页面切换
    publishState.currentAction = '等待页面切换';
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 上传图片
    publishState.currentAction = '上传图片';
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: (imageDataArray) => {
        return new Promise((resolve) => {
          const uploadInput = document.querySelector('#web > div.outarea.upload-c > div > div > div.upload-content > div.upload-wrapper > div > input');
          if (uploadInput) {
            // 创建 DataTransfer 对象
            const dataTransfer = new DataTransfer();
            
            // 将 base64 数据转换为 File 对象
            imageDataArray.forEach((imageData, index) => {
              // 从 base64 创建 Blob
              const byteString = atob(imageData.split(',')[1]);
              const mimeString = imageData.split(',')[0].split(':')[1].split(';')[0];
              const ab = new ArrayBuffer(byteString.length);
              const ia = new Uint8Array(ab);
              for (let i = 0; i < byteString.length; i++) {
                ia[i] = byteString.charCodeAt(i);
              }
              const blob = new Blob([ab], { type: mimeString });
              
              // 创建 File 对象
              const file = new File([blob], `image${index + 1}.jpg`, { type: mimeString });
              dataTransfer.items.add(file);
            });

            // 设置文件到上传输入框
            uploadInput.files = dataTransfer.files;
            uploadInput.dispatchEvent(new Event('change', { bubbles: true }));
            resolve(true);
          } else {
            resolve(false);
          }
        });
      },
      args: [Object.values(noteData.imageUrls)]
    });

    // 等待图片上传
    publishState.currentAction = '等待图片上传完成';
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 更新填写内容状态
    publishState.currentAction = '正在填写笔记内容...';
    notifyPopup('ACTION_UPDATE');

    // 填写内容
    publishState.currentAction = '填写笔记内容';
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: (contentData, productId) => {
        return new Promise((resolve) => {
          setTimeout(() => {
            // 填写标题
            const titleInput = document.querySelector('.titleInput input');
            if (titleInput) {
              titleInput.value = contentData.title;
              titleInput.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // 点击正文编辑器
            const editor = document.querySelector('#quillEditor > div');
            if (editor) {
              editor.click();
              editor.focus();
              editor.innerHTML = '';

              // 分行处理正文，保留空行
              const lines = contentData.body.split('\n');
              let currentLine = 0;

              function typeLine() {
                if (currentLine < lines.length) {
                  const line = lines[currentLine];
                  
                  // 如果不是第一行，先按回车换行
                  if (currentLine > 0) {
                    editor.dispatchEvent(new KeyboardEvent('keydown', {
                      key: 'Enter',
                      code: 'Enter',
                      keyCode: 13,
                      which: 13,
                      bubbles: true
                    }));
                  }

                  // 如果是空行，只需要换行
                  if (line.trim() === '') {
                    currentLine++;
                    setTimeout(typeLine, 100);
                  } else {
                    // 逐字符输入当前行
                    let charIndex = 0;
                    function typeChar() {
                      if (charIndex < line.length) {
                        document.execCommand('insertText', false, line[charIndex]);
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                        charIndex++;
                        setTimeout(typeChar, 50);
                      } else {
                        currentLine++;
                        setTimeout(typeLine, 100);
                      }
                    }
                    typeChar();
                  }
                } else {
                  // 确保最后有一个空行
                  editor.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true
                  }));
                  setTimeout(startAddingTags, 500);
                }
              }

              // 开始输入正文
              typeLine();

              // 输入标签
              function startAddingTags() {
                let currentIndex = 0;
                function addNextTag() {
                  if (currentIndex < contentData.tags.length) {
                    const tag = contentData.tags[currentIndex];
                    
                    // 如果不是第一个标签，添加空格
                    if (currentIndex > 0) {
                      document.execCommand('insertText', false, ' ');
                    }

                    // 直接输入标签文本（包含#）
                    let charIndex = 0;
                    function typeChar() {
                      if (charIndex < tag.length) {
                        document.execCommand('insertText', false, tag[charIndex]);
                        editor.dispatchEvent(new Event('input', { bubbles: true }));
                        charIndex++;
                        setTimeout(typeChar, 200);
                      } else {
                        // 等待2秒让下拉框出现
                        setTimeout(() => {
                          // 按回车选择标签
                          editor.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Enter',
                            code: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true
                          }));
                          
                          // 继续下一个标签
                          setTimeout(() => {
                            currentIndex++;
                            addNextTag();
                          }, 1000);
                        }, 2000);
                      }
                    }
                    typeChar();
                  } else {
                    // 处理商品链接
                    if (productId) {
                      setTimeout(() => {
                        // 点击添加商品按钮
                        const addProductButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.body > div.content > div.media-commodity > div > div > div > div > div > div > div.multi-good-select-empty-btn > button > div > span');
                        if (addProductButton) {
                          addProductButton.click();

                          // 等待弹窗出现并点击搜索商品ID按钮
                          setTimeout(() => {
                            const searchButton = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.d-grid > div:nth-child(2) > div > div > div');
                            if (searchButton) {
                              searchButton.click();

                              // 等待输入框出现并输入商品ID
                              setTimeout(() => {
                                const searchInput = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.d-grid > div:nth-child(2) > div > div > div > div');
                                if (searchInput) {
                                  searchInput.focus();
                                  document.execCommand('insertText', false, productId);
                                  searchInput.dispatchEvent(new Event('input', { bubbles: true }));

                                  // 等待搜索结果并勾选商品
                                  setTimeout(() => {
                                    const checkboxSpan = document.querySelector('body > div.d-modal-mask > div > div.d-modal-content > div > div.goods-list-container > div.goods-list-normal > div > div.good-card-container > div.d-grid.d-checkbox.d-checkbox-main.d-clickable.good-selected > span');
                                    if (checkboxSpan) {
                                      checkboxSpan.click();

                                      // 点击保存按钮
                                      setTimeout(() => {
                                        const saveButton = document.querySelector('body > div.d-modal-mask > div > div.d-modal-footer > div > button > div');
                                        if (saveButton) {
                                          saveButton.click();
                                          
                                          // 等待保存完成后再点击发布按钮
                                          setTimeout(() => {
                                            const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div');
                                            if (publishButton) {
                                              publishButton.click();
                                              resolve(true);
                                            } else {
                                              resolve(false);
                                            }
                                          }, 2000);
                                        } else {
                                          resolve(false);
                                        }
                                      }, 1000);
                                    } else {
                                      resolve(false);
                                    }
                                  }, 2000);
                                } else {
                                  resolve(false);
                                }
                              }, 1000);
                            } else {
                              resolve(false);
                            }
                          }, 1000);
                        } else {
                          resolve(false);
                        }
                      }, 1000);
                    } else {
                      // 如果没有商品ID，直接点击发布按钮
                      setTimeout(() => {
                        const publishButton = document.querySelector('#web > div.outarea.publish-c > div > div > div > div.submit > div > button.d-button.d-button-large.--size-icon-large.--size-text-h6.d-button-with-content.--color-static.bold.--color-bg-fill.--color-text-paragraph.custom-button.red.publishBtn > div');
                        if (publishButton) {
                          publishButton.click();
                          resolve(true);
                        } else {
                          resolve(false);
                        }
                      }, 1000);
                    }
                  }
                }
                addNextTag();
              }
            } else {
              resolve(false);
            }
          }, 1000);
        });
      },
      args: [noteData, noteData.productId || '']
    });

    // 等待发布完成
    publishState.currentAction = '等待发布完成';
    await new Promise(resolve => setTimeout(resolve, 30000));

    publishState.currentAction = '发布完成';

  } catch (error) {
    console.error('发布笔记失败:', error);
    publishState.currentAction = `发布失败: ${error.message}`;
    notifyPopup('ERROR', error.message);
    throw error;
  }
}

// 修改等待函数
async function wait(seconds) {
  for (let i = seconds; i > 0; i--) {
    if (!publishState.isPublishing) break;
    
    publishState.waitTime = i;
    publishState.currentAction = `等待 ${i} 秒后发布下一篇...`;
    
    // 发送倒计时状态更新
    notifyPopup('COUNTDOWN', {
      remainingTime: i,
      totalTime: seconds
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  publishState.waitTime = 0;
} 