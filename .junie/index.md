# 仓库索引

> 面向 LLMs agent 的仓库结构速查。

## 根目录

| 路径 | 作用 |
| --- | --- |
| `.babelrc.js` | Babel 编译配置 |
| `.codex/` | Codex 本地配置目录 |
| `.dockerignore` | Docker 构建忽略规则 |
| `.editorconfig` | 编辑器基础格式约束 |
| `.git/` | Git 元数据目录 |
| `.github/` | GitHub 配置目录 |
| `.gitignore` | Git 忽略规则 |
| `.guard/` | 仓库守卫文件目录 |
| `.husky/` | Git hook 脚本目录 |
| `.idea/` | JetBrains 工程配置 |
| `.junie/` | LLMs agent 项目文档 |
| `.npmrc` | npm 行为配置 |
| `.prettierrc.json` | Prettier 格式配置 |
| `AGENTS.md` | 项目级 agent 协作约束 |
| `Dockerfile` | 容器镜像构建入口 |
| `README.md` | 项目简述与环境变量说明 |
| `dist/` | Rollup 构建产物目录 |
| `eslint.config.mjs` | ESLint 配置入口 |
| `node_modules/` | npm 依赖目录 |
| `package-lock.json` | npm 锁文件 |
| `package.json` | 包信息与脚本入口 |
| `rollup.config.js` | Rollup 打包配置 |
| `scripts/` | 部署辅助脚本目录 |
| `src/` | 业务源码目录 |
| `tmp/` | 临时脚本与临时产物 |
| `tsconfig.json` | TypeScript 编译配置 |

## `.junie/`

| 路径 | 作用 |
| --- | --- |
| `.junie/guidelines.md` | 项目的 LLM 协作约束 |
| `.junie/index.md` | 全仓库结构索引 |

## `.github/`

| 路径 | 作用 |
| --- | --- |
| `.github/workflows/` | GitHub Actions 工作流目录 |
| `.github/workflows/misaka-bot-AutoDeployTrigger-c8edf222-b7b5-40b6-82dd-9def6998775f.yml` | CI 构建并部署容器 |

## `scripts/`

| 路径 | 作用 |
| --- | --- |
| `scripts/docker/` | Docker 相关脚本目录 |
| `scripts/docker/ecosystem.example.config.js` | PM2 配置示例 |

## `src/`

| 路径 | 作用 |
| --- | --- |
| `src/data/` | 内置词表与静态数据 |
| `src/index.ts` | 进程入口与优雅退出 |
| `src/interface/` | 外部服务接口封装 |
| `src/modules/` | Telegram 功能模块集合 |
| `src/store/` | 运行期共享状态 |
| `src/utils/` | 通用工具与基础设施 |

### `src/modules/`

| 路径 | 作用 |
| --- | --- |
| `src/modules/index.ts` | 聚合并加载全部模块 |
| `src/modules/bili-live.ts` | B 站直播相关功能 |
| `src/modules/bluesky-forwarding.ts` | Bluesky 转发功能 |
| `src/modules/chat-bridge.ts` | 聊天桥接功能 |
| `src/modules/fetch-sticker.ts` | 抓取贴纸命令 |
| `src/modules/fetch-video.ts` | 抓取视频命令 |
| `src/modules/galnet.ts` | Galnet 内容功能 |
| `src/modules/galnet-status.ts` | 服务器状态通知 |
| `src/modules/get-user-info.ts` | 查询用户信息命令 |
| `src/modules/killall.ts` | 停止实例相关命令 |
| `src/modules/openrouter-monitor.ts` | OpenRouter 额度告警 |
| `src/modules/ping.ts` | Ping 命令 |
| `src/modules/repeater.ts` | 复读逻辑 |
| `src/modules/say.ts` | 代发消息命令 |
| `src/modules/start.ts` | Start 命令 |
| `src/modules/legacy/` | 历史模块目录 |
| `src/modules/legacy/send-message-on-http-request.ts` | 旧版 HTTP 发信模块 |
| `src/modules/legacy/ywwuyi-douyu-live.ts` | 旧版斗鱼直播模块 |
| `src/modules/wip/` | 实验中模块目录 |
| `src/modules/wip/bilibili-forwarding.ts` | 实验中的 B 站转发 |

### `src/interface/`

| 路径 | 作用 |
| --- | --- |
| `src/interface/bilibili.ts` | B 站接口封装 |
| `src/interface/bluesky.ts` | Bluesky 接口封装 |
| `src/interface/douyu.ts` | 斗鱼接口封装 |
| `src/interface/edsm.ts` | EDSM 状态接口 |
| `src/interface/galnet.ts` | Galnet 接口封装 |
| `src/interface/openrouter.ts` | OpenRouter 状态接口 |
| `src/interface/persistMemory.ts` | 持久化内存接口 |
| `src/interface/telegram.ts` | Telegram Bot 接口层 |
| `src/interface/translate.ts` | 翻译接口封装 |

### `src/data/`

| 路径 | 作用 |
| --- | --- |
| `src/data/galnetGlossary.ts` | Galnet 翻译术语表 |

### `src/store/`

| 路径 | 作用 |
| --- | --- |
| `src/store/runtime.ts` | 运行期共享状态存储 |

### `src/utils/`

| 路径 | 作用 |
| --- | --- |
| `src/utils/TypedEvent.ts` | 类型化事件工具 |
| `src/utils/actionFunctions.ts` | 动作函数工具 |
| `src/utils/errorMessages.ts` | 错误文案工具 |
| `src/utils/file.ts` | 文件工具 |
| `src/utils/lang.ts` | 语言工具 |
| `src/utils/persistConfig.ts` | 配置加载与持久化 |
| `src/utils/queue.ts` | 队列工具 |
| `src/utils/signing/` | 签名相关工具目录 |
| `src/utils/signing/bilibili.ts` | B 站签名工具 |
| `src/utils/telegram.ts` | Telegram 工具函数 |
| `src/utils/telemetry.ts` | 遥测上报工具 |
| `src/utils/telemetrySpam.ts` | 遥测限流工具 |
| `src/utils/type.ts` | 通用类型工具 |

## 额外说明

| 路径 | 作用 |
| --- | --- |
| `dist/index.js` | 主构建产物入口 |
| `dist/index-d449ba5f.js` | 拆分出的构建产物 |
| `dist/index-f9987708.js` | 拆分出的构建产物 |
| `dist/telegram-4f437cc8.js` | Telegram 相关构建产物 |
| `.husky/pre-commit` | 提交前执行 lint |
