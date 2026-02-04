# Flo Mossa 技术架构说明文档

## 1. 项目概述

Flo Mossa 是一个基于 Electron 的 macOS 桌面应用，提供悬浮式笔记收集功能。应用采用多进程架构，通过安全的 IPC 通信机制实现主进程与渲染进程之间的数据交互。

### 1.1 核心功能
- 悬浮式窗口界面（360×420，无边框，始终置顶）
- 笔记内容收集（标签、标题、来源、文本内容）
- 图片上传（拖拽、粘贴、文件选择）
- 本地缓存机制（JSON 格式）
- DOCX 文档生成（基于 docx 库）
- 系统托盘集成（菜单栏图标）

## 2. 技术栈

### 2.1 核心技术
- **Electron 39.1.2** - 跨平台桌面应用框架
- **Node.js** - 运行时环境（CommonJS 模块系统）
- **JavaScript (ES6+)** - 主要编程语言

### 2.2 核心依赖
- **docx 9.5.1** - Word 文档生成库
- **electron-builder 26.0.12** - 应用打包和分发工具

### 2.3 前端技术
- **HTML5** - 页面结构
- **CSS3** - 样式设计（毛玻璃效果、透明窗口）
- **Vanilla JavaScript** - 前端交互逻辑（无框架依赖）

### 2.4 目标平台
- **macOS** (Apple Silicon / Intel)
- 打包格式：`.dmg` 安装包和 `.app` 应用包

## 3. 架构设计

### 3.1 多进程架构

Electron 应用采用多进程架构，包含以下进程：

```
┌─────────────────────────────────────────┐
│          Electron 主进程                │
│  (main.js)                             │
│  - 窗口管理                            │
│  - 系统托盘                            │
│  - 文件系统操作                        │
│  - IPC 处理器                          │
│  - DOCX 生成                           │
└──────────────┬──────────────────────────┘
               │ IPC (Inter-Process Communication)
               │
┌──────────────▼──────────────────────────┐
│       Preload 脚本                      │
│  (preload.js)                           │
│  - Context Bridge                       │
│  - 安全 API 暴露                        │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│       渲染进程                          │
│  (renderer.js + index.html)             │
│  - UI 渲染                              │
│  - 用户交互                             │
│  - 通过 electronAPI 调用主进程          │
└─────────────────────────────────────────┘
```

### 3.2 安全架构

应用采用 Electron 推荐的安全最佳实践：

- **Context Isolation（上下文隔离）**: 启用，防止渲染进程直接访问 Node.js API
- **Node Integration（Node 集成）**: 禁用，渲染进程无法直接使用 `require`
- **Preload 脚本**: 通过 `contextBridge` 安全地暴露有限的 API 给渲染进程

```
渲染进程 (隔离环境)
    ↓
Preload 脚本 (contextBridge)
    ↓
IPC 通信 (ipcRenderer.invoke)
    ↓
主进程 (完整 Node.js 权限)
```

## 4. 核心模块

### 4.1 主进程模块 (main.js)

#### 4.1.1 窗口管理
- **createWindow()**: 创建主窗口
  - 尺寸：360×420
  - 特性：无边框、透明、始终置顶
  - 安全配置：启用 context isolation，禁用 node integration

#### 4.1.2 系统托盘
- **createTray()**: 创建菜单栏图标
- **updateTrayMenu()**: 动态更新托盘菜单
  - 显示/隐藏窗口
  - 退出应用

#### 4.1.3 文件系统操作
- **getCacheFilePath()**: 获取缓存文件路径
  - 位置：`~/Library/Application Support/flo_mossa/local-notes-cache/`
  - 格式：`session_{tag}_{title}.json`
- **getNotesDir()**: 获取笔记存储目录
  - 位置：`~/Library/Application Support/flo_mossa/local-notes/{tag}/`
- **ensureDir()**: 确保目录存在（递归创建）

#### 4.1.4 数据管理
- **saveNoteMetadata()**: 保存笔记元数据（JSON）
- **loadNoteMetadata()**: 加载笔记元数据
- **writeChunksToDocx()**: 将缓存数据转换为 DOCX 文档
  - 读取缓存 JSON
  - 合并到现有元数据
  - 生成 DOCX 文档
  - 保存元数据 JSON

#### 4.1.5 DOCX 生成
- **createDocFromMetadata()**: 从元数据创建文档对象
- **createDocParagraphs()**: 构建文档段落
  - 标题和元信息
  - 内容条目
  - 图片嵌入（320px 宽度）

#### 4.1.6 IPC 处理器

| IPC 通道 | 功能 | 参数 | 返回值 |
|---------|------|------|--------|
| `save-image` | 保存图片到本地 | `(imageData, filename)` | 文件路径 |
| `read-image-file` | 读取图片文件 | `(filePath)` | Base64 数据 |
| `save-chunk` | 保存笔记片段到缓存 | `(tag, title, chunk)` | `{success, filePath, count}` |
| `get-cache-count` | 获取缓存数量 | `(tag, title)` | 数量（数字） |
| `submit-chunks` | 提交缓存并生成 DOCX | `(tag, title, source)` | `{success, docxPath}` |
| `hide-window` | 隐藏窗口 | - | - |
| `close-window` | 关闭窗口 | - | - |

### 4.2 Preload 模块 (preload.js)

#### 4.2.1 Context Bridge
通过 `contextBridge.exposeInMainWorld()` 安全暴露 API：

```javascript
window.electronAPI = {
  hideWindow: () => void,
  closeWindow: () => void,
  saveImage: (imageData, filename) => Promise<string>,
  readImageFile: (filePath) => Promise<string>,
  saveChunk: (tag, title, chunk) => Promise<object>,
  submitChunks: (tag, title, source) => Promise<object>,
  getCacheCount: (tag, title) => Promise<number>
}
```

#### 4.2.2 错误处理
- 捕获暴露 API 时的错误
- 提供降级 API（避免渲染进程崩溃）

### 4.3 渲染进程模块 (renderer.js)

#### 4.3.1 UI 组件管理
- 标签选择器
- 标题输入框
- 来源输入框
- 内容文本域
- 图片上传区域
- 缓存/提交按钮

#### 4.3.2 图片处理
- **拖拽上传**: 监听 `dragover`、`dragleave`、`drop` 事件
- **文件选择**: 通过 `<input type="file">` 选择
- **粘贴上传**: 监听 `paste` 事件，处理剪贴板图片
- **缩略图显示**: 动态生成缩略图，显示成功提示

#### 4.3.3 数据缓存
- **saveNoteToCache()**: 保存当前输入到缓存
  - 构建 chunk 对象
  - 调用 `electronAPI.saveChunk()`
  - 更新缓存计数
  - 清空输入区域

#### 4.3.4 数据提交
- **submitCachedChunks()**: 提交缓存并生成 DOCX
  - 检查是否有未保存的输入
  - 调用 `electronAPI.submitChunks()`
  - 显示成功/失败提示

#### 4.3.5 状态管理
- **screenshots**: 存储当前会话的截图列表
- **updateCacheCount()**: 更新缓存数量显示
- **updateCacheCountFromFile()**: 从文件读取缓存数量

### 4.4 UI 模块 (index.html + main.css)

#### 4.4.1 布局结构
```
┌─────────────────────────┐
│  窗口控制按钮 (- ×)      │
├─────────────────────────┤
│  标签选择器 + 标题输入   │
├─────────────────────────┤
│  来源输入框              │
├─────────────────────────┤
│  内容文本域（可滚动）    │
├─────────────────────────┤
│  图片上传区域            │
├─────────────────────────┤
│  缩略图展示区            │
├─────────────────────────┤
│  缓存 | 提交 按钮        │
├─────────────────────────┤
│  缓存数量提示            │
└─────────────────────────┘
```

#### 4.4.2 样式特性
- 毛玻璃效果（glass morphism）
- 透明窗口背景
- 响应式交互反馈
- 拖拽区域高亮

## 5. 数据流

### 5.1 笔记缓存流程

```
用户输入
    ↓
渲染进程收集数据
    ↓
构建 chunk 对象
    ↓
electronAPI.saveChunk()
    ↓
IPC: save-chunk
    ↓
主进程处理
    ↓
读取现有缓存 JSON
    ↓
追加新 chunk
    ↓
保存到文件系统
    ↓
返回结果给渲染进程
    ↓
更新 UI（缓存计数）
```

### 5.2 图片上传流程

```
用户操作（拖拽/粘贴/选择）
    ↓
FileReader 读取文件
    ↓
转换为 Base64
    ↓
electronAPI.saveImage()
    ↓
IPC: save-image
    ↓
主进程处理
    ↓
解码 Base64
    ↓
保存到 images/ 目录
    ↓
返回文件路径
    ↓
添加到 screenshots 数组
    ↓
显示缩略图
```

### 5.3 DOCX 生成流程

```
用户点击提交
    ↓
检查未保存输入（如有则先缓存）
    ↓
electronAPI.submitChunks()
    ↓
IPC: submit-chunks
    ↓
主进程处理
    ↓
读取缓存 JSON
    ↓
加载/创建元数据
    ↓
合并缓存数据到元数据
    ↓
生成 DOCX 文档
    ↓
保存 DOCX 和元数据 JSON
    ↓
删除缓存文件
    ↓
返回结果
    ↓
显示成功提示
```

## 6. 文件结构

```
flo_mossa/
├── app/                          # 前端资源
│   ├── index.html                # 主页面
│   ├── scripts/
│   │   └── renderer.js           # 渲染进程逻辑
│   └── styles/
│       └── main.css              # 样式文件
├── images/                       # 图片存储目录
│   └── image_*.png              # 上传的图片文件
├── main.js                       # 主进程入口
├── preload.js                    # Preload 脚本
├── package.json                  # 项目配置
├── dist/                         # 构建输出
│   └── mac-arm64/
│       └── Flo Mossa.app/        # 打包后的应用
└── ~/Library/Application Support/flo_mossa/  # 用户数据目录
    ├── local-notes-cache/        # 缓存目录
    │   └── session_{tag}_{title}.json
    └── local-notes/              # 正式笔记目录
        └── {tag}/
            ├── {title}.docx      # Word 文档
            └── {title}.json      # 元数据
```

## 7. 数据存储

### 7.1 缓存文件格式

位置：`~/Library/Application Support/flo_mossa/local-notes-cache/session_{tag}_{title}.json`

```json
[
  {
    "type": "text",
    "content": "笔记内容",
    "source": "来源信息",
    "screenshots": [
      {
        "filename": "image_1234567890.png",
        "url": "data:image/png;base64,..."
      }
    ],
    "timestamp": 1234567890123
  }
]
```

### 7.2 元数据文件格式

位置：`~/Library/Application Support/flo_mossa/local-notes/{tag}/{title}.json`

```json
{
  "tag": "product",
  "title": "笔记标题",
  "createdAt": 1234567890123,
  "updatedAt": 1234567890123,
  "entries": [
    {
      "source": "来源",
      "text": "笔记文本内容",
      "images": ["image_1234567890.png"],
      "createdAt": 1234567890123
    }
  ]
}
```

### 7.3 图片存储

- 位置：项目根目录 `images/` 文件夹
- 命名规则：`image_{timestamp}.{ext}`
- 格式：PNG、JPG 等常见图片格式

## 8. 安全机制

### 8.1 进程隔离
- 渲染进程运行在隔离的上下文中
- 无法直接访问 Node.js API
- 无法直接访问文件系统

### 8.2 API 暴露
- 通过 `contextBridge` 安全暴露 API
- 仅暴露必要的功能接口
- 所有文件操作都在主进程执行

### 8.3 输入验证
- `sanitize()` 函数清理文件名中的特殊字符
- 防止路径遍历攻击
- JSON 解析错误处理

## 9. 打包和分发

### 9.1 构建配置

使用 `electron-builder` 进行打包：

```json
{
  "build": {
    "productName": "Flo Mossa",
    "appId": "com.wangye.flo-mossa",
    "mac": {
      "category": "public.app-category.productivity",
      "target": ["dmg"]
    }
  }
}
```

### 9.2 打包命令

- `npm run pack`: 生成 `.app` 应用包（快速测试）
- `npm run build:mac`: 生成 `.dmg` 安装包（分发）

### 9.3 文件包含规则

包含：
- `app/**/*` - 前端资源
- `images/**/*` - 图片文件
- `main.js`, `preload.js` - 核心文件
- `package.json` - 配置信息

排除：
- `local-notes-cache/**/*` - 用户缓存
- `local-notes/**/*` - 用户笔记
- `**/*.md` - Markdown 文档

## 10. 性能优化

### 10.1 文件操作
- 使用同步文件操作（适合小文件）
- 缓存目录自动创建
- 错误处理和降级策略

### 10.2 UI 响应
- 异步 IPC 调用（不阻塞 UI）
- 按钮状态反馈（防止重复点击）
- 消息提示系统（Toast）

### 10.3 内存管理
- 图片以 Base64 形式临时存储
- 提交后清理缓存文件
- 窗口隐藏而非关闭（保持状态）

## 11. 扩展性

### 11.1 标签系统
- 当前硬编码在 HTML 中
- 可扩展为动态标签管理
- 支持自定义标签

### 11.2 导出格式
- 当前支持 DOCX
- 可扩展支持 Markdown、PDF 等格式
- 模板系统可定制

### 11.3 平台支持
- 当前仅支持 macOS
- 可扩展支持 Windows、Linux
- 需要调整窗口样式和托盘实现

## 12. 开发调试

### 12.1 开发模式
- 自动打开 DevTools
- 控制台日志输出
- 热重载支持（需要额外配置）

### 12.2 调试技巧
- 主进程日志：终端输出
- 渲染进程日志：DevTools Console
- IPC 通信：通过日志追踪数据流

## 13. 已知限制

1. **代码签名**: 当前构建未签名，首次打开会触发 Gatekeeper 警告
2. **图标**: 使用默认 Electron 图标，需要自定义 `.icns` 文件
3. **标签管理**: 标签列表硬编码，不支持动态添加
4. **平台限制**: 仅支持 macOS，未测试其他平台

## 14. 未来改进方向

1. **标签管理**: 实现标签的增删改查
2. **笔记编辑**: 支持编辑已保存的笔记
3. **搜索功能**: 全文搜索笔记内容
4. **同步功能**: 支持云同步（可选）
5. **主题定制**: 支持深色/浅色主题切换
6. **快捷键**: 全局快捷键支持
7. **多窗口**: 支持同时打开多个笔记窗口

---

**文档版本**: 1.0  
**最后更新**: 2024  
**维护者**: Flo Mossa 开发团队


