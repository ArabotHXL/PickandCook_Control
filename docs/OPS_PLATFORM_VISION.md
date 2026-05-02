# Pick & Cook 内部运营平台 — All-in-One 规划

---
版本：1.0
日期：2026-05-02
状态：草稿，待你拍板
作者：Agent + 你
范围：在现有 `ops-dashboard` 基础上扩展为「监控 + 运营 + 操作 + 分析」四合一的内部平台
---

## 0. TL;DR（一页纸）

**问题**：当前 `ops-dashboard` 已经覆盖了 14 个页面（用户、库存、菜谱、Cook Sessions、Receipts、Households、AI Usage、Search/Recsys、Audit Log、System Flags 等），但仍是一个**只读 + 状态切换**为主的看板。要走到 "all-in-one" 还差三件事：

1. **能改内容**（菜谱图片、标题、食材、步骤的真编辑；图片上传通道）。
2. **能盯异常**（用户菜谱质量、举报趋势、AI 异常、数据漂移、SLO）。
3. **能干活**（批量导入、运营推送、A/B 切流、人群圈选、数据修正）。

**HMW**：我怎样让一个人（你）在一个屏幕里完成 95% 的产品监控 + 运营 + 操作 + 分析任务，而不再需要打开 SQL、Mixpanel、Linear、Figma、GCS 控制台来回切？

**北极星**：把单次"运营动作"（加菜、改菜、清数据、回答客服、发通知、切实验、查指标）的中位时间从 ~10 分钟压到 < 90 秒。

**下一阶段（4 周）做什么**：
- W1：菜谱**完整 CRUD + 图片上传管道**（最痛点，直接解决"加菜慢、不能改"）
- W2：**用户菜谱监控**（UGC 质量队列 + 举报趋势 + 一键回滚）
- W3：**实时监控**（错误墙、SLO、AI 成本告警、Push 状态）
- W4：**运营动作**（推送、人群、Flag rollout、数据修正/dry-run + apply）

---

## 1. 现状盘点（截至本次 deploy 前）

### 1.1 已有的能力

| 模块 | 状态 | 备注 |
|---|---|---|
| 登录 + admin gate | ✅ 已有，JWT + 强制 SESSION_SECRET ≥16 | `ops_token` localStorage |
| Overview 概览卡片 | ✅ DAU/WAU/库存/菜谱基本数 | 趋势对比待加 |
| Users | ✅ 列表 + 搜索 + 详情 | 没有「冒充登录」「重置密码」等运营动作 |
| Pantry / Inventory | ✅ 浏览 | 缺：可疑数据高亮、合并/拆分、批量打标 |
| Recipes (Catalog) | ✅ 列表 + 改 quality_tier | **缺：详情、内容编辑、图片管理、复制、版本** |
| Recipes (User Submissions) | ✅ 列表 + 通过/拒绝 | **缺：详情查看、内容预览、举报上下文** |
| Recipes (Reports) | ✅ 只读列表 | 缺：和 Moderation 合并、决策动作 |
| Cook Sessions | ✅ 含 review status、LATERAL 去重 | 缺：单 session 时间线（每一步耗时） |
| Receipts | ✅ 列表 + 提取明细 modal | 缺：原图预览、人工纠错通道 |
| Households | ✅ 含成员、过敏归一化 | 缺：消费画像、家庭健康摘要 |
| AI / LLM Usage | ✅ 30 天 by-model / by-endpoint | **缺：成本告警、单次调用 trace、prompt 回放** |
| Analytics → Search | ✅ Top queries、零结果率 | 缺：query intent 分布、长尾词聚类 |
| Analytics → Recommendations | ✅ surface / event / algo 维度 | 缺：CTR/CVR、A/B 对比、模型对比 |
| Notifications | ✅ 模板 + 投递日志（只读） | **缺：手动触发、模板编辑、节流配置、活动制作** |
| Moderation | ✅ 队列 + 决策 | 缺：被举报内容的具体渲染（图片、富文本） |
| Audit Log | ✅ 全部 admin 写操作均记录 | 缺：按 admin/按 target 的 timeline 视图 |
| Feature Flags | ✅ 全局/scope，乐观更新 | **缺：百分比灰度、人群定向、自动化实验** |
| System Health | ✅ 健康指标 + Job Runs | 缺：错误日志墙、tail logs、报警规则 |

### 1.2 数据模型（关键表速查）

- 菜谱：`recipes`（官方，含 `cover_image_url` `source_url`）、`user_recipes`（UGC，含 `submission_status` `visibility_state` `report_count`，**无图片字段**）
- 食材/产品：`products`（含 `image_url`）、`pantry_items`、`pantry_deduction_reviews`
- 行为：`user_events`、`analytics_events`、`search_events`、`recommendation_events`、`recommendation_performance`、`cook_sessions`
- 内容运营：`recipe_reports`（菜谱专用）、`abuse_reports`（通用，`content_type/content_id`）、`recipe_saves`
- 系统：`job_runs`、`system_flags` (JSONB by scope)、`ops_audit_log`、`ai_interactions`、`llm_usage_daily`
- 用户域：`users`、`user_recipes`、`user_overrides`、`user_preferences`、`user_segments`、`user_settings`、`user_staples`、`households` + `household_members`、`receipts`

### 1.3 关键空白（决定下一步的 5 个事实）

1. **`user_recipes` 没有图片字段** — UGC 上图必须先建表 `user_recipe_images` 或加列。
2. **`recipes` 有 `cover_image_url` 但没图片管理 UI** — 当前 ops 改不了。
3. **没有 object storage 上传管道接入 ops** — 上传得走 GCS/Object Storage，ops 端缺 signed URL 或代理上传。
4. **没有 prompt/response trace 表** — AI Usage 只有聚合，单次调用查不到 prompt 文本，故障无法重放。
5. **没有 push 通知发送通道（仅有日志）** — Notifications 页是只读，发不出去。

---

## 2. 用户与场景（Personas + JTBD）

### 2.1 Persona

| 角色 | 现在 | 6 个月后 |
|---|---|---|
| **Founder（你）** | 既写 SQL 又做 PM 又看客服 | 用平台代替 95% 的脚本/SQL |
| **Content Ops VA** | 不存在 | 处理 UGC 审核、菜谱补图、修品类 |
| **Support** | 不存在 | 看用户事件流、回客服工单 |
| **Growth** | 不存在 | 配 push、配实验、看漏斗 |
| **数据分析** | 你写 SQL | 看 dashboard、保存查询、导 CSV |

→ 平台首要服务你；但 UI 要能让一个非工程的人 30 分钟内上手（这决定了"操作类"动作必须有完整的二次确认 + 可回滚）。

### 2.2 JTBD（顶层 5 条）

> When [情景], I want to [动作], so I can [结果]

1. When 我看到一篇用户菜谱被举报 3 次, I want to 在一个屏幕里看到原文 + 3 条举报理由 + 该用户历史 + 一键下架/允许, so I can 在 60 秒内做出决定并留下审计。
2. When 我想加 50 道清明节特色菜, I want to 上传 Excel + 拖拽 50 张图 + 让 AI 补全字段 + dry-run 预览 + 一键发布, so I can 5 分钟搞定原本 5 小时的活。
3. When 我看到 AI 成本周环比涨 40%, I want to 立刻看到是哪个 endpoint / 哪个 model / 哪个 prompt 引起的 + top 10 调用的 trace, so I can 改 prompt 或换 model。
4. When 我刚上一个 "今晚吃什么 v2" 推荐算法, I want to 切 10% 流量 + 看 v2 vs v1 的 CTR/CVR/留存差异 + 一键扩量到 100% 或回滚, so I can 安全推全。
5. When 一个用户在群里反馈"刷不出菜了", I want to 用 email 找到该用户 + 看他过去 30 分钟事件流 + 看他 pantry 状态 + 看他刚刚的 recommend trace + 重放他的请求, so I can 5 分钟定位问题。

---

## 3. 三件最紧迫的事（你直接提到的）

### 3.1 图片管理（recipe & UGC）

**问题**：菜谱有 `cover_image_url` 但 ops 改不了；用户菜谱根本没图片字段；图片散落 GCS/attached_assets/外链。

**方案（分两层）**：

| 层 | 内容 |
|---|---|
| **底层（基础设施）** | (a) 引入 Replit Object Storage 一个 public bucket `pickncook-recipes/`；(b) 后端开 `POST /api/ops/uploads/sign` 返回临时 signed PUT URL（5 分钟有效）；(c) 上传成功后写入 DB；(d) 加 `user_recipe_images` 表（`id, user_recipe_id, url, position, source: 'admin'|'user'|'ai'`）。 |
| **UI 层** | 菜谱详情页加「图片」区：拖拽上传、裁剪 16:9、设置主图、删除（软删）；UGC 详情页同上 + 标记"该图被举报"。 |

**验收**：从 ops 后台拖一张本地图，5 秒内菜谱详情和 mobile App 都能看到。

### 3.2 菜谱完整 CRUD（不只 quality_tier）

**问题**：当前只能改 quality_tier，标题/描述/食材/步骤都得改 ts 文件 + 重启。

**方案**：
- 菜谱详情页（侧抽屉或独立 `/recipes/:id`）：
  - 字段表单：标题、菜系、难度、时长、人份、描述
  - 食材编辑器：行内增删改、单位下拉、关联 `products` 表（自动补图标）
  - 步骤编辑器：可拖拽排序、富文本（粗体 + 链接）、单步配图
  - 图片区（见 3.1）
  - **保存策略**：每次保存写一份 diff 到 `recipe_revisions` 表（30 天保留），支持「撤销到上个版本」
  - **副作用提醒**：保存时弹"该菜谱已被 X 个用户收藏，是否重算推荐？"复选框（默认勾，触发 `job_runs` 中的 `recommend_recompute`）
- 列表页加「复制为新菜谱」「批量打标」

**验收**：故事 1（Gherkin）

```gherkin
Given 我以管理员身份登录
When  我点开任意菜谱 → 改标题 + 加一张图 + 调整食材 → 保存
Then  数据库立即更新；revision 表多一条；mobile App 刷新可见；
And   audit_log 出现一条 action_type='recipe_edit'；
And   我可以一键回滚。
```

### 3.3 用户菜谱监控（UGC observability）

**问题**：UGC 已经有 submission_status，但 ops 端只能看列表 + approve/reject，看不到内容。要走到"监控"还要：

| 子能力 | 说明 |
|---|---|
| **UGC 详情页** | 显示完整菜谱（含图）、作者历史菜谱数、被举报次数、全文 diff（如果是修改） |
| **质量得分** | 后台离线给每篇 UGC 打分（标题长度、是否有图、食材是否对得上 products、步骤数是否合理、是否有 LLM 检测出的不合规词），> 0.7 自动通过、< 0.3 自动拒、中间进队列 |
| **举报趋势** | 折线图：每天/每周举报数、TOP 10 被举报作者、TOP 10 被举报菜谱 |
| **作者画像 mini-card** | 一进 UGC 详情就看到："作者注册 12 天，发了 8 篇，2 篇被拒，3 个举报，无 ban 记录" |
| **批量动作** | 选中 N 篇 → 一键设为 "需要补图"/"建议作者修订"（触发 push 给作者） |
| **回滚** | 一键把某条 UGC 还原到上一版本（依赖 3.2 的 revision 机制） |

**验收**：UGC 队列页打开后，30 秒内能看清楚"今天有几篇待审 + 谁是高风险作者 + 队列健康度"。

---

## 4. 发散：成为 All-in-One 平台的四根柱子

> 这一节是 brain-storm 模式 — 列出所有合理的功能，第 5 节再用 RICE 排优先级。

### 4.1 Pillar A：产品监控（Monitoring / 盯）

目标：**任何产品异常 5 分钟内被你看到**

| 功能 | 一句话 |
|---|---|
| A1. 实时错误墙 | 后端 5xx、前端 JS 错误、Expo crash 按 fingerprint 聚合，状态：new / triaged / resolved |
| A2. SLO 板 | 关键 endpoint 的 P50/P95/P99、错误率、可用率，违反阈值闪红 |
| A3. AI 成本/质量告警 | 单日成本超 $X、单 endpoint token 超 Y、success rate 跌 Z%，邮件/push 推给你 |
| A4. Push 通知健康 | 发送数、deliver rate、open rate、APNs/FCM 失败原因分布 |
| A5. 数据漂移监控 | 关键 KPI（DAU、recipe_view、cook_complete）日环比异常 → 标红 |
| A6. 业务异常队列 | 比如同一用户 1h 内扫码 100 次、同一 receipt 上传 5 次、Pantry 一次性新增 200 项 — 自动入队 |
| A7. Single User Lookup | 输入 email → 一屏看到该用户 30 天事件流、设备、pantry、订单、AI 调用 trace |
| A8. Trace 重放 | 点开任一 AI 调用 → 看到完整 prompt + response + token 数 + 耗时 + 用了哪个 model |
| A9. Webhook / 第三方监控 | Stripe webhook 失败、GCS 写失败、Neon DB 慢查询 |
| A10. Status Page (内部) | 把 A2 + A4 + A9 汇成一张大屏，挂在墙上 |

### 4.2 Pillar B：产品运营（Operations / 内容 + 数据治理）

目标：**任何"加内容、清数据、改类目"动作 < 90 秒**

| 功能 | 一句话 |
|---|---|
| B1. 菜谱批量导入 | CSV/Excel 拖入 → 字段映射 → AI 补全（菜系、过敏原、营养）→ dry-run → 应用 |
| B2. 菜谱完整 CRUD（=3.2） | 上面已展开 |
| B3. 图片管理 + 裁剪（=3.1） | 上面已展开 |
| B4. 食材/产品库治理 | 合并重复 SKU、补品类、补图、改主单位、批量打标过敏原 |
| B5. UGC 队列（=3.3） | 上面已展开 |
| B6. Receipt 纠错通道 | 看原图 + 提取结果 → 改单价/单位/数量 → 自动反馈给 receipt_extract 模型做 fine-tune 数据 |
| B7. 数据清理面板 | 把 `/api/admin/cleanup` 拆成可视化的「保留天数 + dry-run + 二次确认 + 审计」 |
| B8. 翻译/多语 ops | 一键 LLM 翻译菜谱标题/步骤为 EN/JP/KR，保留校对队列 |
| B9. 类目/标签编辑器 | 拖拽合并 cuisine、调整层级（中餐 > 川菜 > 麻辣） |
| B10. 内容日历 | 节日推荐菜单（清明、端午、感恩节）排期，到时间自动 feature |
| B11. 数据字典 | 让 VA 能看懂"quality_tier 四档分别是什么意思"，每张表配人话注释 |
| B12. 模板编辑器 | 通知模板 / 邮件模板 / Push 文案的可视化编辑 + 预览 + A/B |

### 4.3 Pillar C：产品操作（Operations / 干预动作）

目标：**对线上跑着的产品做有控制的「改」**

| 功能 | 一句话 |
|---|---|
| C1. 灰度 Flag（百分比） | system_flags 升级支持 `{strategy:'percentage', value: 10}` 和 `{strategy:'allowlist', user_ids:[...]}` |
| C2. 人群圈选 | 按 "注册 ≤7 天 + iOS + 没做菜 + 加过 ≥3 件 pantry" 筛人群，存为 `user_segments` |
| C3. Push 推送中心 | 选 segment + 模板 + 调度时间 + dry-run（看会触达多少人）+ 二次确认 + 节流（同人 24h 不超 1 次） |
| C4. A/B 实验后台 | 创建实验（control/variant + 分流%）、配 metric、看 lift + 显著性、一键 promote/rollback |
| C5. 用户操作（Impersonate） | 在严格审计下"以该用户身份"读 mobile App 一屏（只读），定位 bug |
| C6. 单点 Reset | 重置某用户密码、清掉某用户 pantry、删某用户 receipt — 都是高危操作，二次确认 + 审计 |
| C7. 推荐缓存失效 | 改了菜谱后一键失效该菜谱关联的 recommend cache |
| C8. 模型/Prompt 切换 | AI Usage 页加"切换主推 model"按钮，灰度 % 控制 |
| C9. 内容回滚 | 任何被改的菜谱/UGC 可以回到任意 revision（依赖 3.2） |
| C10. Job 重跑 | 失败的 job 一键 requeue，参数可改 |
| C11. SQL Console（受限） | 给你（仅 super-admin）一个只读 SQL editor，查询限时 30s + 结果脱敏 + 全部审计 |
| C12. 客服回复 | 把 mobile 的"反馈"入箱 → 你直接在后台回复 → 触发 push 给该用户 |

### 4.4 Pillar D：产品分析（Analytics / 看数）

目标：**任何业务问题 < 3 个点击有答案，不写 SQL**

| 功能 | 一句话 |
|---|---|
| D1. 漏斗分析（=原 prompt §3） | 注册 → 加 pantry → 看推荐 → 保存 → 开做菜 → 完成 → pantry 更新；每步留存 + 流失分布 |
| D2. 留存曲线 | D1/D7/D30、按注册周/平台/获客渠道分 cohort |
| D3. 行为事件浏览器 | 类似 Mixpanel：选事件 + 过滤 + groupBy + 折线/柱图 |
| D4. 用户事件 timeline | 单用户事件流（=A7） |
| D5. 菜谱热度 | 浏览/收藏/做完/被举报 → 各 top 50；按地区、季节维度 |
| D6. 推荐效果 | 各算法版本的 CTR/CVR/留存 lift，对比表 |
| D7. 搜索分析 | top queries、零结果率、点击率、长尾词、query 意图聚类（用 LLM） |
| D8. AI 经济性 | 每个 endpoint 的单次成本 vs 价值（被采纳率、被点击率） |
| D9. 家庭画像 | 按家庭聚合：饮食偏好、平均做菜频次、过敏覆盖、平均开销 |
| D10. 自定义看板 | 把任意 D1–D9 的图表拖到自定义页（每人一个 home） |
| D11. 数据导出 | 任意表 → CSV / GSheet 直推（带列权限） |
| D12. 周报自动生成 | 每周一邮件给你：上周 KPI、TOP 增/降事件、热门菜谱、AI 花费 |

---

## 5. RICE 优先级（Top 20）

| # | 功能 | Reach | Impact | Conf. | Effort（人天） | RICE | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | 3.1 图片管道（含 user_recipe_images 表 + signed URL） | 100% 内容运营 | 3 | 0.9 | 5 | **54** | 一切内容操作的前置 |
| 2 | 3.2 菜谱完整 CRUD + revision 表 | 100% | 3 | 0.9 | 8 | **34** | 解决你最痛的"加菜慢" |
| 3 | 3.3 UGC 详情页（含作者画像 + 全文渲染） | 100% UGC ops | 3 | 0.9 | 4 | **68** | 解决你直接提的需求 |
| 4 | A8 AI Trace 重放（prompt + response 单次记录） | 100% AI debug | 3 | 0.8 | 4 | **60** | 故障定位刚需 |
| 5 | A1 错误墙 + A2 SLO 卡片 | 100% | 3 | 0.7 | 6 | **35** | 不出事 = 你睡得着觉 |
| 6 | C3 Push 推送中心（含 segment + dry-run + 节流） | 100% growth | 3 | 0.7 | 8 | **26** | 不做就只能用脚本发 |
| 7 | D1 漏斗 + D2 留存（核心 7 步） | 100% | 3 | 0.8 | 6 | **40** | 你看不到 = 不知道哪里漏 |
| 8 | A7 Single User Lookup | 100% support/debug | 3 | 0.8 | 5 | **48** | 出 bug 第一时间用 |
| 9 | B1 菜谱批量导入（Excel + AI 补全） | 内容运营 | 3 | 0.7 | 8 | **26** | 上量必备 |
| 10 | C1 百分比灰度 + C4 简化 A/B | 100% | 2 | 0.7 | 8 | **17.5** | 安全推全的前提 |
| 11 | A3 AI 成本告警 | 100% | 2 | 0.9 | 2 | **90** | 极便宜，价值大 |
| 12 | UGC 质量自动评分（≥0.7 自动过、≤0.3 自动拒） | UGC ops | 2 | 0.6 | 5 | **24** | 把队列减半 |
| 13 | B6 Receipt 纠错 → 反馈数据集 | OCR 优化 | 2 | 0.7 | 5 | **28** | 长期改善 OCR |
| 14 | C5 Impersonate（只读，严审计） | support | 2 | 0.5 | 5 | **20** | 但是要小心隐私 |
| 15 | D3 事件浏览器（custom group/filter） | 100% | 2 | 0.6 | 10 | **12** | 大但通用 |
| 16 | D11 一键导 CSV / GSheet | 100% | 2 | 0.9 | 2 | **90** | 极便宜 |
| 17 | C12 客服收件箱（连 mobile 反馈表） | support | 2 | 0.7 | 4 | **35** | 长期省时间 |
| 18 | B7 数据清理面板（替换 curl） | 你 | 1 | 0.95 | 2 | **47** | 直接干掉一类风险 |
| 19 | A4 Push 健康 + A9 Webhook 健康 | 100% | 2 | 0.7 | 4 | **35** | 出问题就抓瞎 |
| 20 | D12 周报自动邮件 | 你 | 2 | 0.8 | 3 | **53** | 强迫自己看数 |

> 排序口径：Reach 用 0/1/2/3 简化；Effort 单位是"理想工程日"（含设计 + 测试）。

---

## 6. Now / Next / Later 路线图

### Theme：把 ops-dashboard 从「看板」升级为「一个屏幕跑完所有运营」

### Now（4 周内做完，已承诺）

| 周 | 主线 | 副线 |
|---|---|---|
| W1 | **#1 图片管道**（含 user_recipe_images 表 + signed URL + 上传 UI）| #11 AI 成本告警（2d）+ #16 一键导 CSV（2d） |
| W2 | **#2 菜谱完整 CRUD + revision 表 + #3 UGC 详情页**（合一个 PR） | #18 数据清理面板（2d） |
| W3 | **#4 AI Trace + #8 Single User Lookup**（共用一个用户事件流组件） | #20 周报邮件（3d） |
| W4 | **#5 错误墙 + SLO + #19 Push 健康**（共用一个监控框架） | #17 客服收件箱（4d） |

→ 4 周末状态：图片能上、菜谱能改、UGC 能看、出错能查、用户能定位、AI 成本能盯、周报有了。

### Next（5–10 周）

- #6 Push 推送中心（segment + 模板 + dry-run）
- #7 漏斗 + 留存
- #9 菜谱批量导入（Excel + AI 补全）
- #12 UGC 质量自动评分
- #13 Receipt 纠错回流

### Later（方向，不承诺时间）

- #10 灰度 + A/B 实验后台（等流量上来再做）
- #15 事件浏览器（先用 D11 导 CSV 顶着）
- #14 Impersonate（先验证隐私合规）
- C11 受限 SQL Console
- B8 多语翻译 ops
- D10 自定义看板（业务稳定再做）

---

## 7. 关键开放问题（你拍板）

1. **图片存储**：用 Replit Object Storage 还是接 GCS？前者零配置，后者已有部分图。建议**统一到 Replit Object Storage 一个 public bucket**，把 GCS 上现有图迁过来。
2. **revision 保留期**：30 天够吗？还是 90？关系到存储成本和你回滚的"安心范围"。
3. **UGC 质量自动决策的红线**：≥0.7 自动通过会不会太激进？建议**初期只自动拒（≤0.2），不自动通过**，所有 ≥0.2 仍进队列。
4. **Push 推送的"安全网"**：默认每人 24h 不超 1 条够吗？要不要按时区限制（不在 22:00–8:00 发）？
5. **Impersonate 的隐私边界**：做不做？如果做，要不要让被 impersonate 的用户在 App 里能看到"过去 30 天 admin 看过你账号 X 次"？（推荐做，建立信任。）
6. **第二个 admin**：Content Ops VA 什么时候招？决定了哪些操作需要分级权限（你 = super-admin、VA = content-ops，没有 cleanup/flag/SQL 权限）。
7. **告警通道**：邮件够还是要接 Slack/钉钉/Telegram bot？
8. **生产分析数据保留**：90 天 raw events + 永久聚合？这影响 D2 留存能算多远。

---

## 8. 北极星 + 验收指标

| 指标 | 现状 | 4 周目标 | 12 周目标 |
|---|---|---|---|
| 单次运营动作中位时长 | ~10 min（写脚本/SQL） | < 2 min | < 90 s |
| 加 1 道菜的时间 | ~10 min | < 2 min | < 60 s（含上图）|
| UGC 一条审核中位时长 | 不可知 | < 30 s | < 15 s |
| 故障从发生到你"看到"的时间 | 偶发被你撞到 | < 5 min（A3 告警） | < 1 min |
| 故障从看到到根因的时间 | ~30 min（翻日志/SQL） | < 10 min | < 3 min（A8 trace + A7 lookup） |
| 每周打开 Mixpanel/外部工具的次数 | 多次 | < 2 | 0 |
| Admin 写操作 100% 进 audit_log | ✅ 已经做到 | 维持 | 维持 |

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 一个屏幕功能太多，自己也学不会 | 高 | 每加一个模块带 30 秒新手提示；侧边栏分组（已做），常用动作快捷键 |
| 写操作误删生产数据 | 高 | 所有写动作：dry-run + 二次确认 + audit + revision，能回滚 |
| Impersonate 被滥用/隐私问题 | 高 | 默认关闭；启用后只读 + 用户可见 admin 访问记录 |
| 灰度/AB 实验配错把全量用户搞挂 | 高 | 灰度上限默认 10%，超过要二次确认；自动 kill switch（指标跌穿阈值自动回滚） |
| Push 推送扰民 | 中 | 24h/人节流 + 时区窗 + 双签发送 + 历史记录可撤回 |
| 大表查询慢拖累 mobile App | 中 | ops 路由独立 rate-limit；慢查询 > 500ms 自动 alert；只读 SQL Console 限时 30s |
| 图片存储费用增长 | 低-中 | 统一 bucket；超过 30 天的 UGC 图自动转 cold tier |

---

## 10. 与原《ADMIN_WEB_PLAN》的差异

原 plan（2026-04-24）锁定 4 个模块：菜谱管理 / 数据管理 / API 检测 / 分析看板。本 plan 在此基础上：

- **保留**菜谱管理和分析看板（现在已部分做了，4 周内完工核心）
- **降权**「API 检测」（你已有 curl + Postman，价值 < 想象，丢到 Later）
- **新增** Pillar A 监控（这是你原 plan 里没有但实际最痛的部分）和 Pillar C 操作（push、灰度、A/B、impersonate）
- **沿用** Non-goals：不做权限分级（暂时）、不做手机适配、不做对外 SaaS、不做工作流审批

---

## 变更记录

| 版本 | 日期 | 作者 | 变更 |
|---|---|---|---|
| 1.0 | 2026-05-02 | Agent + 你 | 在已有 14 模块 ops-dashboard 上的 12 周扩展规划；新增图片/CRUD/UGC/监控/操作四大方向 |
