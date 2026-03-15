# option-focus

期权持仓跟踪 + 行情监控工具。React + Firebase + TastyTrade API。

## 技术栈

- **前端**: React 19, Vite, TailwindCSS, Lucide React
- **数据库**: Firebase Firestore (`APP_ID = 'option-focus-v2'`)
- **行情**: TastyTrade REST API + dxFeed WebSocket (Greeks, OI)
- **部署**: Firebase Hosting (test: option-focus-test, prod: option-focus-prod)

## 常用命令

```bash
npm run dev        # 本地开发 http://localhost:5173
npm run build      # 生产构建
npm test           # Vitest 单元测试
firebase deploy --only hosting:test   # 部署 test
firebase deploy --only hosting:prod   # 部署 prod
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

**期权过期判断用 `isExpired`，不用 `isExpiredByTwoDays`**

**期权链 key 格式:** `String(parseFloat(strike['strike-price']))` (去掉 `.0` 后缀)

## 回复偏好

- 回复用中文
- 不加 emoji
- 不写尾部总结（用户能看到 diff）
- 代码引用用 markdown 链接格式 `[file.ts](path/file.ts#L42)`
- 简洁直接，不重复用户说过的话
