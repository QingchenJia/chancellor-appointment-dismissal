# 宋代宰辅任免查询系统

本项目将 `宋代宰辅编年录.xlsx` 中“时间为行、人物为列”的宽表数据导入 SQLite，并提供本地 FastAPI + Web 页面，用于查询两宋宰相与执政官员的任命、罢免、调整等职务变动记录。

## 功能

- 从 Excel 一键重建 SQLite 数据库。
- 按公元年、月份、人名、皇帝、年号、事件类型和原文关键词查询。
- 查看单条记录的完整原文、批注和 Excel 源单元格。
- 结果分页和 CSV 导出。

## 环境

项目使用 conda 的 `document` 环境：

```powershell
conda run -n document python -m pip install -r requirements.txt
```

## 导入数据

```powershell
$env:PYTHONIOENCODING='utf-8'
conda run -n document python scripts/import_excel.py 宋代宰辅编年录.xlsx --db song_chancellors.db --rebuild
```

导入完成后会输出行列数、人物数量、记录数量和批注数量。当前原始文件的预期统计约为：

- `person_count: 495`
- `record_count: 1943`
- `comment_count: 113`

## 启动服务

```powershell
conda run -n document python -m uvicorn song_chancellors.api:create_app --factory --port 8000
```

打开：

```text
http://localhost:8000
```

健康检查：

```text
http://localhost:8000/api/health
```

## 运行测试

```powershell
conda run -n document python -m pytest -q
```

## 数据设计

主要表：

- `persons`：人物及别名。
- `time_points`：公元年、月份、皇帝、年号和原始行号。
- `appointment_events`：任免、调整、死亡等职务变动事件，保留原文和源单元格；仅表示延续在任的任期状态记录不入库。
- `annotations`：Excel 批注。
- `import_audit`：导入审计统计。

自动解析只用于辅助检索，不覆盖原始文本。
