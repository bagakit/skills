# Bagakit 全 Skills 熵评估基线

## 结论

本轮对当前工作树下 31 个 installable skills 做了同口径评估。

结果分布：

- `E0`：1
- `E1`：8
- `E2`：12
- `E3`：10

处置分布：

- `retain`：9
- `reduce`：18
- `mixed`：4

这里的分数是**评审关注度**：

- `E0`：已检查，未发现实质可避免负担
- `E1`：局部、可控的摩擦
- `E2`：存在会影响任务、协作或维护的实质负担
- `E3`：负担已经支配默认路径、跨边界传播，或强迫无关证明

它不是质量、正确性、成熟度、能力或价值排名。同档 skill 不可据此排序，
family 之间也不计算平均分。

## 快照与方法

- 日期：`2026-08-25`（快照基线日期；后续库存刷新纳入当前工作树新增 skill）
- 模式：当前未提交工作树快照
- skills：31
- payload files：512
- corpus manifest SHA-256：
  `a26081732ab5f467199be0a8f3804de6bc5de232d0ab133faf1e3075a4af75bd`
- 共同证据窗：完整 `SKILL.md`、package inventory、frontdoor、skill CLI、
  默认路径需要的一跳 references、直接 validation/eval registration；只有当
  material finding 需要时才下钻脚本或 fixture
- 五维 profile：
  - `M`：meaning
  - `S`：structure
  - `C`：choice
  - `K`：coupling
  - `P`：proof
- 校准状态：`uncalibrated`

6 个预声明 overlap 样本得到 2 个 `aligned`、1 个 `mixed`、3 个
`disputed`；有争议时做了 bounded adjudication，并保留更接近最小安全动作的
正式记录。初评得到的 11 个 E3 全部进入独立风险复评；最终 10 个保留 E3，
`bagakit-supervisor` 降为 E2。

机器可读 SSOT：

- `cases/current-skill-corpus-baseline.json`
- `cases/current-skill-corpus-inventory.json`

本次库存刷新补入了当前工作树已有但原始基线遗漏的
`a2a/bagakit-agent-post`；该条目按同一 default-route frame 重新检查，保持
`uncalibrated`，不把一次补录当作独立复评或校准证据。

## E0：未发现实质减熵收益

### `human-improvement/bagakit-explain` — E0 / retain

- profile：`M0 S0 C0 K0 P0`
- 保留：全局结构图、因果与 changed-case 检验、static-first、motion necessity、
  reduced-motion、桌面与移动端证据，以及“不等于 mastery”的边界。
- 点评：静态验证与条件触发的 motion 复验保护不同 endpoint failure；本轮未找到
  在不损失结果的前提下更小的路径，应停止优化。

## E1：负担受控

### `a2a/bagakit-agent-messaging` — E1 / retain

- profile：`M0 S1 C1 K1 P0`
- 保留：prompt-like envelope、一次性 Agent Set、引用不等于认证、事件驱动报告，
  以及 Host 无原子校验时的 fail-stop validator。
- 点评：这些分支分别保护身份可见性、派生边界和失败不执行；不要为减少文本而
  合并，也不要新增启动确认、静态 roster 或定时状态仪式。

### `a2a/bagakit-agent-post` — E1 / retain

- profile：`M0 S1 C1 K1 P0`
- 保留：user principal bootstrap、token-gated identity tree、active display-name
  binding、ordered fail-stop send、sender relation、ancestor-only Set flow，以及
  deduplication、consumption 与 cascade-revoke receipts。
- 点评：registry 与 mail pipe 的新增分支都改变真实 authority 或 delivery state，
  但仍属于一条连贯的 Host-local route；Host 继续拥有 bootstrap、authentication、
  scheduling 与 effect，pipe 不声称认证人类或证明现实效果。当前应保留，不为减少
  局部字段而削弱 sender binding 或 fail-stop 顺序。

### `a2u/bagakit-user-communication` — E1 / retain

- profile：`M0 S1 C1 K0 P0`
- 保留：四问消息准入、activity/progress/readiness/completion 区分、caller 与
  Host 的所有权边界。
- 点评：一位 reviewer 给 E0，正式记录给 E1；二者处置均为 retain，分歧只在
  局部选择摩擦，不值得再加规则。

### `harness/bagakit-consensus-ledger` — E1 / retain

- profile：`M0 S0 C1 K0 P0`
- 保留：epistemic class 与 lifecycle status 分离、优先嵌入 owner run、
  tool-neutral evidence requirement、compact excerpt、只推广 accepted snapshot。
- 点评：当前渐进披露足够。只有真实使用反复误选 ledger placement 时，才值得补
  一个 placement example。

### `harness/bagakit-entropy-review` — E1 / retain

- profile：`M0 S1 C0 K1 P1`
- 保留：purpose-conditioned frame、necessity floor、非聚合五维 profile、三个
  gate、验证决策链、最小反事实和一次性 self-pass。
- 点评：独立自评曾发现 frame 漏项和验证形状错位，均已修复；另一个 reviewer
  主张继续去重词表，但证据不足以证明两个不同消费者之间的重复已经达到 E2。
  当前应停止递归自评。

### `harness/bagakit-flow-runner` — E1 / retain

- profile：`M0 S1 C1 K1 P1`
- 保留：runner-local 与 tracker-owned truth 分离、fail-closed activation、
  next-action/resume projection、mutation/checkpoint receipts、archive authority。
- 点评：各层分别保护恢复、并发与所有权，没有发现可安全合并的默认路径。

### `harness/bagakit-project-chronicle` — E1 / retain

- profile：`M0 S1 C1 K1 P1`
- 保留：adapter-relative census、source-bound cards、lineage、functional cast、
  chronicle/evolution ledger 分离、矛盾与隐私边界。
- 点评：census → card → lineage → review 是一条连贯链；继续拆分反而会增加
  跳转和交接。

### `swe/bagakit-coding-agent-principles` — E1 / retain

- profile：`M0 S1 C1 K1 P0`
- 保留：单一 meta-principle、可压缩 gate、project-native proof-first ladder、
  风险触发 references/reviewers、最小充分 oracle。
- 点评：studies、scorecard 和双 reviewer 目前保持条件触发，不应升级为每个
  非平凡实现的默认仪式。

## E2：有实质减熵候选

### `harness/bagakit-feature-tracker` — E2 / reduce

- profile：`M0 S1 C1 K1 P2`
- 保留：JSON SSOT、reviewed-plan authority、workspace/Task transition、receipt
  freshness、并发序列化、guarded repair 和 lossless closeout。
- 最小动作：缩小 blocking layout suite，只证明 installable boundary 与注册；
  不再把 eval 结果目录脚手架和每个 validation implementation file 当 runtime
  layout 证据。

### `harness/bagakit-grill` — E2 / reduce

- profile：`M2 S1 C1 K2 P1`
- 保留：evidence route 分类、一次一个决策问题、可见替代项、protected goal 和
  user authority。
- 最小动作：只有需要可恢复 shared-understanding 时才启用 embedded consensus
  ledger；普通 Grill 以 run JSON 和生成 brief 为默认路径。

### `harness/bagakit-living-knowledge` — E2 / reduce

- profile：`M1 S2 C1 K1 P2`
- 保留：researcher/selector/evolver 分工、repo-relative 低泄漏发布、managed
  bootstrap、system pages 和 apply/recall/ingest/doctor runtime proof。
- 最小动作：从默认 layout gate 中退休 migration-specific 旧文件名黑名单；保留
  通用 install-boundary exclusions 和公共行为验证。

### `harness/bagakit-researcher` — E2 / mixed

- profile：`M1 S2 C1 K2 P1`
- 保留：charter → source → claim 链、provider/promotion 边界、route ladder、
  条件 wiki duty、warning-first doctor。
- 最小动作：把完整命令手册移到已有 workspace reference 或 CLI help；
  `SKILL.md` 只保留 route ladder、语义流程、条件 closeout 和一个入口命令。
- 点评：两位 reviewer 对 E2/mixed 完全一致；长度只是线索，真正问题是常驻上下文
  和命令真相同步面。

### `harness/bagakit-set-loop-goal` — E2 / reduce

- profile：`M0 S1 C1 K1 P2`
- 保留：Feature Tracker ownership、terminal/frontier closure、最小 Feature、
  revision guard、owner receipt、host wrapper 和无独立 Goal runtime。
- 最小动作：删除 blocking contract checker 的 `SKILL.md` 行数上限；不以另一种
  prose-size gate 替代，保留结构化 owner/convergence/runtime proof。

### `harness/bagakit-skill-evolver` — E2 / reduce

- profile：`M1 S2 C2 K1 P1`
- 保留：长期 topic 门槛、`topic.json` SSOT、原子/idempotent mutation、显式
  route/acceptance/proof、fail-closed promotion/archive。
- 最小动作：把 intake、retry、bridge、promotion 细则集中到一个 operator
  protocol；常驻入口只留六步 steward 路径和异常路由。operator 不可用时 hand
  back，不允许直接改 JSON。

### `harness/bagakit-supervisor` — E2 / reduce

- profile：`M1 S2 C1 K1 P1`
- 保留：Owner authority、Worker method ownership、effect follow-through、
  exact-current-candidate proof，以及 Host mechanics 与 Supervisor delivery
  accountability 的区分。
- 最小动作：把重复的 readiness、one-control-question、evidence join 和 effect
  语义收敛为常驻路径上的一张 normative control card；长 observation reference
  只在多 Agent、assurance、repair 场景加载。
- 点评：初评为 E3；独立复评读取最新 232 行候选后降为 E2。E3 证据不足，采用
  风险复评结果。

### `human-improvement/bagakit-mastery-learning` — E2 / reduce

- profile：`M1 S2 C1 K2 P1`
- 保留：bounded mastery contract、首次盲诊断、source/capability coverage、
  transfer、delay re-entry 和诚实 mastery 状态。
- 最小动作：把 Writing Core → HITL design → webpage implementation →
  desktop/mobile verification 收敛为一个 recipe 或 `hitl-course-handoff`；入口只
  声明触发、唯一 packet 和 endpoint receipt。

### `media-production/bagakit-daily-media-production` — E2 / reduce

- profile：`M1 S2 C1 K2 P2`
- 保留：side-effect authorization、provenance、no-publish、secret guard、peer
  receipts、deployment/notification 独立状态。
- 最小动作：由 brief 激活 stage-specific validation；未启用 asset/web/deploy/
  notification 时记录一次 `not_applicable`，不制造 dummy file 或空 asset row。

### `paperwork/bagakit-writing-de-ai-tone` — E2 / reduce

- profile：`M0 S1 C0 K1 P2`
- 保留：detect/rewrite 区分、protected spans、scene exception、minimal edit、
  second-pass audit 和 runtime contract。
- 最小动作：从 non-gating eval 中移除 release validation 已证明的 CLI/code 与
  dispatch replay；保留 dataset integrity，并把预算用于真实 rewrite outcome。

### `paperwork/bagakit-writing-intake` — E2 / reduce

- profile：`M2 S2 C1 K2 P2`
- 保留：no-final-prose、privacy/retention、protected spans、evidence claims、
  confidence honesty 和 next-owner handoff。
- 最小动作：把 all-lanes packet 改成 route projection；固定小 envelope 只保留
  task/evidence/privacy/spans/handoff，其他 section 由选中的 intake lane 激活。

### `swe/bagakit-git-message-craft` — E2 / reduce

- profile：`M2 S2 C1 K2 P2`
- 保留：draft/commit/MR authority、intent-based splitting、credential/path
  hygiene、placeholder rejection 和 repo-local convention discovery。
- 最小动作：把 `Principle`、固定 GFM heading、逐条 `path:line`、固定
  delta/fact shape 从通用 hard gate 降为可选 provenance profile；hard lint 只守
  subject、unfinished state 和敏感信息边界。

## E3：优先减熵队列

下面 10 个最终 E3 都经过第二位 reviewer。除 HITL 为 `medium` 外，其余对 E3
的支持为 `robust`。

### `design/bagakit-codex-webpage-design` — E3 / mixed

- profile：`M2 S3 C2 K3 P3`
- 保留：reference provenance、host-stack reuse、asset fallback、desktop/mobile
  browser evidence、interaction、accessibility 和 visual acceptance。
- 最小动作：普通 high-craft route 只产一个 pre-implementation design packet 和
  一个 browser acceptance packet；asset/spatial/mobile/accessibility/reviewer
  证据按真实风险激活，由 workflow contract 统一拥有 artifact requirements。

### `design/bagakit-design-core` — E3 / reduce

- profile：`M1 S3 C2 K2 P3`
- 保留：evidence-before-taste、target register、条件 product model、design packet
  SSOT，以及完整 program 的三 checkpoint。
- 最小动作：draft-only、plan-only、result-only 只要求各自 active checkpoint；
  仅端到端 design program 强制三 checkpoint 全链。

### `design/bagakit-hitl-webutil-design` — E3 / mixed

- profile：`M1 S3 C2 K2 P2`
- 保留：built page、desktop/mobile endpoint evidence、stable continuation、
  reveal policy、privacy/provenance 和“不等于 mastery”。
- 最小动作：一个 crosswalk-selected design packet 成为唯一默认 handoff；其内
  派生 scene/mechanism/style/artifact/component/hardening，判断、continuity 和
  browser proof 保持条件化。
- 限制：缺少 live route cost 与变更历史，支持为 medium。

### `gamemaker/topdown-image2-sprite-pipeline` — E3 / reduce

- profile：`M2 S3 C2 K2 P1`
- 保留：image2 provenance、隔离、可恢复 receipt、structural/motion/visual 独立
  证据和 integration 前的人类处置。
- 最小动作：把 Round 5–15 实验史与冻结 model/guide/committee 协议迁到版本化
  experiment reference + manifest；默认入口只保留通用 sprite path 和进入
  structural-control 的触发表。

### `harness/bagakit-brainstorm` — E3 / reduce

- profile：`M2 S3 C3 K3 P3`
- 保留：原始讨论与派生结论分层、真正不同的方案、争议收敛、执行前批准和可追溯
  handoff。
- 最小动作：expert forum、逐专家检索/评分、逐轮 raw log 由高风险、实质争议或
  显式用户请求触发；默认只留 focused intake、选项和一个 decision handoff。

### `harness/bagakit-skill-selector` — E3 / mixed

- profile：`M2 S3 C2 K3 P2`
- 保留：mandatory preflight、`direct_execute` receipt-only fast path、候选
  visible/available/selected、transaction safety、显式 composition、无自动
  Evolver。
- 最小动作：常驻入口只留 preflight + close；command cookbook、recipes、
  telemetry、ranking、Evolver bridge 进入条件 references/CLI help；同时修复
  policy contract 与 task record 的 preflight route token 断裂。
- 点评：两位 reviewer 都确认 E3，但对 `mixed`/`reduce` 有分歧；正式记录覆盖了
  额外的 route-token 语义问题，故保留 `mixed`。

### `harness/bagakit-spark` — E3 / reduce

- profile：`M2 S3 C3 K3 P3`
- 保留：decision-changing questions、evidence routing、用户目标与接受权、必要
  research 和可恢复 consensus。
- 最小动作：stress test、MVP/thought experiment、quiet room、独立复评、skill
  evolution 进入风险触发的高保证 reference；默认只留 Frame → route → Ask →
  Reflect → Synthesize、stop 和一跳 handoff。

### `paperwork/bagakit-paperwork-technical-writing` — E3 / reduce

- profile：`M2 S3 C2 K3 P3`
- 保留：publish narrative / execution appendix 边界、placeholder 与 internal
  instruction hygiene、source/counterevidence、关键 evidence obligations。
- 最小动作：hard gate 只守完成态、发布边界和明确证据义务；word/case/diagram、
  H2、short claim、anchor loop、长句、short-break、45% 压缩等变为 reader/risk
  触发的 advisory review。

### `paperwork/bagakit-writing-core` — E3 / reduce

- profile：`M2 S3 C2 K1 P3`
- 保留：route-before-draft、foundation sufficiency、evidence/sample boundary、
  no-regression、protected spans、script diagnostics 与 human judgment 分离。
- 最小动作：blind review 和三角色 audience panel 改为风险触发；普通 longform
  用一个 integrated review packet，只有 publication/acceptance/high-stakes claim
  能被改变时才打开独立 panel。
- 点评：两位 reviewer 都确认 E3；`reduce`/`mixed` 有争议。正式动作更小，只调整
  panel 准入，故保留 `reduce`。

### `paperwork/qihan-writing` — E3 / reduce

- profile：`M1 S2 C2 K2 P3`
- 保留：qihan voice、author intent/evidence、information-loss protection、低成本
  lint 和高风险 publication 的独立 review。
- 最小动作：普通 review 使用 advisory lint + 一次 audience check；只有公开、
  高风险或 Owner 明确要求时，才启用 warn-blocking lint、三 reviewer panel 和
  comparison article。

## 跨 Skill 的五个主要模式

1. **高保证路线变成默认路线。**
   - expert forum、quiet room、多人 panel、三 checkpoint、独立 review、完整
     publication protocol 在低风险任务也强制运行。
   - 优化方向：先定义 assurance tier 和触发条件，而不是删掉高保证能力。

2. **条件细节常驻激活上下文。**
   - 大命令手册、实验轮次历史、rare route、bridge 与 telemetry 进入每次加载。
   - 优化方向：保留一条 default route，把条件细节移到一跳 reference 或 CLI
     help，并验证 discoverability。

3. **同一真相跨多个 owner 手工同步。**
   - route token、policy vocabulary、artifact list、stage requirement 在 SKILL、
     prose spec、metadata、script 和 gate 中重复。
   - 优化方向：结构化 SSOT + 派生 projection；不要再加 wording sync gate。

4. **证明实现形状而非行为。**
   - 行数上限、目录脚手架、固定 heading、关键词数组、相同 fixture replay 成为
     blocking proof。
   - 优化方向：映射 `check → evidence → decision`，保留 boundary/endpoint proof，
     将 advisory 与 correlated replay 降级或退休。

5. **all-lanes packet 强迫未激活字段。**
   - 不同 route 共用一个全字段完成契约，导致 dummy artifact、空行、无关 review。
   - 优化方向：固定最小 envelope；route-specific projection 只要求已激活内容。

## 必须保护的复杂度

减熵不能删除：

- Owner authority、用户接受、safety、security、irreversibility、compliance
- 真正改变动作的 research/evidence/learning/design/execution 状态
- independent endpoint proof、provenance、observability、containment、recovery、
  no-regression evidence
- 当渐进披露与专业 peer boundary 确实降低总负担时，它们本身

## 证据边界

- 这是第一轮、当前工作树、default-route 的 uncalibrated baseline。
- 评分是诊断 attention，不是 capability claim。
- 15 个对象没有第二位 reviewer；全部最终 E3 和 6 个 overlap 样本有独立复评。
- agreement 只表示 reviewer 是否收敛，不证明 construct validity。
- 本轮没有执行每个 skill 的真实用户任务，也没有观察优化后的行为结果。
- 任一 skill 接受减熵修改后，都应在相同 frame 下做 before/after profile，并证明
  protected outcomes 没有退化。
