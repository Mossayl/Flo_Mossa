const { contextBridge, ipcRenderer } = require('electron');

// 暴露受保护的方法给渲染进程
try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // 隐藏窗口
    hideWindow: () => {
      ipcRenderer.send('hide-window');
    },
    
    // 关闭窗口（退出应用）
    closeWindow: () => {
      ipcRenderer.send('close-window');
    },
    
    // 保存图片到本地（通过 IPC 调用主进程）
    saveImage: async (imageData, filename) => {
      return await ipcRenderer.invoke('save-image', imageData, filename);
    },
    
    // 读取图片文件（通过 IPC 调用主进程）
    readImageFile: async (filePath) => {
      return await ipcRenderer.invoke('read-image-file', filePath);
    },
    
    // 保存笔记 chunk 到本地 JSON 文件（通过 IPC 调用主进程）
    saveChunk: async (tag, title, chunk) => {
      return await ipcRenderer.invoke('save-chunk', tag, title, chunk);
    },
    
    // 提交缓存并生成 Markdown
    submitChunks: async (tag, title, source) => {
      return await ipcRenderer.invoke('submit-chunks', tag, title, source);
    },
    
    // 获取缓存数量（通过 IPC 调用主进程）
    getCacheCount: async (tag, title) => {
      return await ipcRenderer.invoke('get-cache-count', tag, title);
    }
  });

  console.log('✅ electronAPI 已成功暴露到渲染进程');
} catch (error) {
  console.error('❌ 暴露 electronAPI 失败:', error);
  // 即使出错，也暴露一个基本的 API 对象，避免渲染进程报错
  contextBridge.exposeInMainWorld('electronAPI', {
    hideWindow: () => console.warn('electronAPI 不可用'),
    closeWindow: () => console.warn('electronAPI 不可用'),
    saveImage: async () => { throw new Error('electronAPI 不可用'); },
    saveChunk: async () => { throw new Error('electronAPI 不可用'); },
    submitChunks: async () => { throw new Error('electronAPI 不可用'); },
    getCacheCount: async () => 0
  });
}
