# Refined Technical Brief Template

Use this shape for the `distill` route. Remove empty sections; keep prose
neutral until a user-requested style overlay is applied.

```markdown
# <对象>：<干货清单 / 实践指南 / 排障记录>

> <一句话导读：是什么、覆盖什么范围、面向谁、要支持什么动作>

## 结论速览

- **<结论 1>**：<证据或边界>
- **<结论 2>**：<证据或边界>

## <核心主题 1>

### <条目名>

- **是什么**：<一句话定义>
- **关键点**：<数据、判断、步骤或边界>
- **链接 / 命令**：`<exact command or URL>`

## <核心主题 2>

<Repeat the smallest useful pattern. Use a table only when fields really
compare.>

## 踩坑与避坑指南

| 现象 / 报错 | 根本原因 | 修复方案 | 边界 / 残留风险 |
| --- | --- | --- | --- |
| <source-backed symptom> | <source-backed cause> | <source-backed fix> | <known caveat> |

## 待确认与缺口

- <decision-relevant unresolved item and the evidence needed>

## 附录：来源与局限

- **来源**：<logical source names or repo-relative pointers>
- **范围**：<date range>, <count> source items when known
- **去重 / 排除**：<method and excluded material>
- **时效**：<as-of date or validity unknown>
- **局限**：<not covered, conflicting, or stale areas>
```

The appendix is part of the fidelity contract. Even one short pasted block
should state what was and was not available.
