# option-focus

期权持仓跟踪 + 行情监控工具。React + Firebase + TastyTrade API。

## 技术栈

- **前端**: React 19, Vite, TailwindCSS, Lucide React
- **数据库**: Firebase Firestore (`APP_ID = 'option-focus-v2'`)
- **行情**: TastyTrade REST API + dxFeed WebSocket (Greeks, OI)
- **部署**: Vercel (前端, option-focus.vercel.app) + Firebase Functions (后端)

## 常用命令

```bash
npm run dev        # 本地开发 http://localhost:5173
npm run build      # 生产构建
npm test           # Vitest 单元测试
vercel --prod      # 部署前端到 production
```

## 关键路径约定

```
src/components/   # UI 组件
src/hooks/        # React hooks (useOIWall, useOptionChain, useSkewHistory, useSkewAutoJob)
src/utils/        # apiClient, cacheUtils, dateUtils
src/data/         # defaultSymbols.js (153 symbols watchlist)
src/calc.js       # 核心计算 (calcNetBasis, calcFinalPnL)
firestore.rules   # Firestore 安全规则 (test + prod 都要更新)
```

## Firestore 结构

```
artifacts/option-focus-v2/
  users/{uid}/positions/{id}         # 持仓记录
  users/{uid}/config/tastytrade      # TastyTrade session
  skew/{symbol}/history/{date}       # Put Skew 历史
    → { fetchedAt, exps: { "2026-03-21": 0.0312, ... } }
  cache/{symbol}_{date}              # OI/IVR 当日缓存
```

## 重要代码规范

**Firestore nested map 更新必须用 dot notation:**
```js
// 正确 - 只更新单个字段，不覆盖其他
await updateDoc(ref, { [`exps.${expDate}`]: rr });

// 错误 - 会覆盖整个 exps map
await setDoc(ref, { exps: { [expDate]: rr } }, { merge: true });
```


**期权链 key 格式:** `String(parseFloat(strike['strike-price']))` (去掉 `.0` 后缀)

## 工作流程

**每次改动代码前，必须先用文字阐述计划（涉及哪些文件、改什么、为什么），等用户明确确认后才能开始写代码。**
不得跳过确认步骤，哪怕改动看起来很小。

**编程必须遵循 SOLID 原则。** 单一职责、开闭、里氏替换、接口隔离、依赖倒置——新增或修改代码时主动识别违反 SOLID 的设计并提出改进。

**编程必须保证网络安全。** 每次新增或修改代码时必须主动检查以下项目：
- 禁止将 token、session、API key、uid 等敏感数据暴露到客户端日志（console.log）或 URL 参数中
- 所有外部数据（API 响应、WebSocket 消息）在使用前必须做类型/边界校验，不得盲目信任
- 禁止使用 `eval()`、`innerHTML`、`dangerouslySetInnerHTML`（除非有明确说明）
- Firestore 规则变更必须同时更新 test 和 prod，不得留宽松规则上线
- 不得在代码中硬编码任何凭证或密钥

**commit 和 push 之前必须获得用户明确确认。** 不得在用户确认前自动执行 git commit 或 git push，哪怕任务看起来已完成。

## 回复偏好

- 回复用中文
- 不加 emoji
- 不写尾部总结（用户能看到 diff）
- 代码引用用 markdown 链接格式 `[file.ts](path/file.ts#L42)`
- 简洁直接，不重复用户说过的话
