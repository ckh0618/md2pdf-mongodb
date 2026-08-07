---
title: Markdown 轉 PDF 範例報告
subtitle: 多語言轉譯驗證
customer: 範例客戶
project: 文件自動化 PoC
brand: MongoDB
version: "1.0"
date: "2026-08-07"
language: zh-TW
audience: customer
copyright_year: "2026"
author:
  name: md2pdf Team
  title: Documentation Engineering
  org: MongoDB
  email: docs@example.com
participants:
  - name: 林怡君
    title: 平台工程師
    org: 範例客戶
    email: yijun@example.com
  - name: md2pdf Team
    title: Documentation Engineering
    org: MongoDB
    email: docs@example.com
---

# 1 摘要

本文件是用來驗證文件自動化流程的繁體中文範例。流程會從一份 Markdown 原文同時產生
self-contained HTML 與 PDF，並確認封面中繼資料、標題階層、表格、程式碼區塊、提示框
及工作清單在 PDF 中都能清楚閱讀。

> [!NOTE]
> 本文件中的客戶名稱與數值皆為轉譯範例使用的虛構內容。

# 2 主要觀察

## 2.1 文件結構

文件先呈現核心結論，再說明觀察結果與執行順序。即使較長的句子跨越頁面邊界，段落
間距與換行也應維持自然。

| 驗證項目 | 目前狀態 | 建議方向 |
| --- | --- | --- |
| 封面中繼資料 | 使用 YAML front matter | 保留必要欄位 |
| 查詢結果表 | 使用 GFM 表格 | 檢查欄寬與換行 |
| 程式碼範例 | 使用 JavaScript 語法醒目提示 | 保持文字可複製 |
| 多語言正文 | 包含繁體中文字元 | 檢查 PDF 是否缺字 |

以下是一個查詢有效合約的 MongoDB 範例：

~~~javascript
db.contracts.find(
  { status: "ACTIVE", region: "TW" },
  { _id: 0, contract_id: 1, customer_name: 1 }
).sort({ updated_at: -1 });
~~~

## 2.2 驗證結果

- [x] HTML 標題與封面標題一致
- [x] 表頭與資料列在頁面中清楚區分
- [x] 繁體中文與數字在 PDF 中正常顯示
- [ ] 以真實生產資料進行的效能測試另行執行

# 3 建議執行順序

1. 檢查 Markdown front matter 與標題階層。
2. 先開啟 HTML，確認連結、表格與程式碼區塊。
3. 依照實際列印結果檢查 PDF 的每一頁。
4. 若發現問題，修改 Markdown 或樣式，而不是修改產生檔案。

本範例用來說明四種語言的文件可以共用同一套轉譯流程。
