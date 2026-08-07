---
title: Markdown 转 PDF 示例报告
subtitle: 多语言渲染验证
customer: 示例客户
project: 文档自动化 PoC
brand: MongoDB
version: "1.0"
date: "2026-08-07"
language: zh-CN
audience: customer
copyright_year: "2026"
author:
  name: md2pdf Team
  title: Documentation Engineering
  org: MongoDB
  email: docs@example.com
participants:
  - name: 李明
    title: 平台工程师
    org: 示例客户
    email: liming@example.com
  - name: md2pdf Team
    title: Documentation Engineering
    org: MongoDB
    email: docs@example.com
---

# 1 摘要

本文档是用于验证文档自动化流程的简体中文示例。流程从一份 Markdown 原文同时生成
self-contained HTML 和 PDF，并检查封面元数据、标题层级、表格、代码块、提示框以及
任务清单在 PDF 中是否保持清晰可读。

> [!NOTE]
> 本文档中的客户名称和数值均为渲染示例使用的虚构内容。

# 2 主要观察

## 2.1 文档结构

文档先给出核心结论，再说明观察结果和执行顺序。即使较长的句子跨越页面边界，段落
间距和换行也应保持自然。

| 验证项目 | 当前状态 | 建议方向 |
| --- | --- | --- |
| 封面元数据 | 使用 YAML front matter | 保留必填字段 |
| 查询结果表 | 使用 GFM 表格 | 检查列宽和换行 |
| 代码示例 | 使用 JavaScript 语法高亮 | 保持文本可复制 |
| 多语言正文 | 包含简体中文字符 | 检查 PDF 是否缺字 |

下面是一个查询有效合同的 MongoDB 示例：

~~~javascript
db.contracts.find(
  { status: "ACTIVE", region: "CN" },
  { _id: 0, contract_id: 1, customer_name: 1 }
).sort({ updated_at: -1 });
~~~

## 2.2 验证结果

- [x] HTML 标题与封面标题一致
- [x] 表头和数据行在页面中清晰区分
- [x] 简体中文和数字在 PDF 中正常显示
- [ ] 基于真实生产数据的性能测试另行执行

# 3 建议实施顺序

1. 检查 Markdown front matter 和标题层级。
2. 先打开 HTML，确认链接、表格和代码块。
3. 按实际打印结果检查 PDF 的每一页。
4. 如果发现问题，修改 Markdown 或样式，而不是修改生成文件。

本示例用于说明四种语言的文档可以共享同一套渲染流程。
