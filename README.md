# 宋代宰执拜罢查询系统

本项目将《宋代宰辅编年录》Excel 中“时间为行、人物为列”的宽表数据整理到 SQLite，提供 FastAPI 查询接口和本地 Web 检索页面，用于检索两宋宰辅及执政官员的任命、调整、罢免、死亡等记录，并追溯原文、批注和来源单元格。

## 主要功能

- 从 Excel 工作簿解析人物、时间、任免事件和单元格批注，并生成 SQLite 数据库。
- 按公元年、月份、人物、皇帝、年号、事件类型和原文关键词组合筛选。
- 提供北宋、南宋、任命和罢免快捷筛选，以及按年月汇总的事件分布。
- 支持结果分页，并在详情抽屉中查看完整原文、批注和 Excel 来源单元格。
- 提供人物、事件、筛选项和时间线等 REST API。
- 使用 Python 单元/接口测试、Node.js 前端状态测试和 Chrome 浏览器冒烟测试覆盖核心流程。

## 技术栈

- Python 3.11
- FastAPI + Uvicorn
- SQLite
- openpyxl
- 原生 HTML、CSS 和 JavaScript（ES Modules）
- pytest、Node.js Test Runner

## 项目结构

```text
.
├── song_chancellors/              # Python 核心包
│   ├── __init__.py                # 包声明
│   ├── api.py                     # FastAPI 应用工厂、API 路由及静态页面挂载
│   ├── db.py                      # SQLite 连接、重建和表结构初始化
│   ├── importer.py                # Excel 遍历、数据转换、入库及导入统计
│   ├── models.py                  # 解析阶段使用的数据模型
│   ├── parsing.py                 # 月份、人物姓名和事件类型解析规则
│   └── repository.py              # 数据查询、筛选、分页和详情读取
├── scripts/                       # 命令行辅助脚本
│   ├── import_excel.py            # 将工作簿导入 SQLite
│   └── inspect_excel.py           # 检查工作表规模、人物列、记录和批注数量
├── web/                           # 无构建步骤的原生 Web 前端
│   ├── index.html                 # 页面结构、筛选区、结果表格和详情抽屉
│   ├── styles.css                 # 页面布局、主题、响应式和无障碍样式
│   ├── app.js                     # API 请求、筛选、分页、时间线和详情交互
│   └── ui-state.mjs               # 可独立测试的查询参数和界面状态逻辑
├── tests/                         # 自动化测试
│   ├── conftest.py                # 临时数据库和示例工作簿夹具
│   ├── test_parsing.py            # 文本解析规则测试
│   ├── test_importer.py           # Excel 导入流程测试
│   ├── test_repository.py         # 数据查询层测试
│   ├── test_api.py                # FastAPI 接口测试
│   ├── test_web_ui.py             # 页面结构和样式约束测试
│   └── web/
│       ├── ui-state.test.mjs      # 前端状态函数测试
│       └── browser-smoke.ps1      # 基于 Chrome DevTools 的端到端冒烟测试
├── 宋代宰辅编年录.xlsx            # 原始数据工作簿
├── song_chancellors.db            # 默认 SQLite 数据库
├── requirements.txt               # Python 运行和测试依赖
├── start.ps1                      # Windows 快速启动脚本
└── README.md                      # 项目说明
```

### 核心目录与文件说明

#### `song_chancellors/`

项目的后端与数据处理核心。各模块按职责拆分：`parsing.py` 只负责规则解析，`importer.py` 负责读取和写入，`repository.py` 封装 SQL 查询，`api.py` 将查询能力暴露为 HTTP 接口。这样的分层便于独立测试和调整解析规则。

- `api.py`：通过 `create_app()` 创建 FastAPI 实例。默认读取项目根目录的 `song_chancellors.db`，挂载 `web/` 为 `/static`，并将首页发布在 `/`。
- `db.py`：启用 SQLite 外键约束，创建业务表和索引；`rebuild_database()` 会先删除已有目标数据库，再创建新库。
- `parsing.py`：把正月到十二月（含“闰”前缀）转换为月份序号；拆分人物规范名和括号内别名；按关键词将文本分为 `appointment`、`dismissal`、`death` 或 `tenure`。
- `importer.py`：读取工作簿第一个工作表。第 2 行第 E 列起被视为人物列，第 3 行起被视为数据行；公元年、皇帝和年号支持沿用上一非空单元格。`tenure` 表示仅延续在任状态，导入时不会写入事件表。
- `repository.py`：集中维护筛选 SQL，返回事件列表、事件详情、人物详情、筛选项和时间线数据。事件查询默认排除 `tenure` 类型。

#### `scripts/`

- `inspect_excel.py` 只读取工作簿，适合在导入前核对工作表尺寸、人物列数、非空人物记录数和批注数。
- `import_excel.py` 是正式导入入口，支持自定义数据库路径和 `--rebuild` 重建模式，完成后会打印导入摘要。

#### `web/`

前端不依赖 npm 打包工具，由 FastAPI 直接提供静态文件。`app.js` 负责页面事件和网络请求；纯状态逻辑放在 `ui-state.mjs`，可通过 Node.js Test Runner 独立测试。页面包含组合筛选、快捷筛选、时间分布、分页、加载/错误状态和可键盘操作的详情抽屉。

#### `tests/`

测试按解析、导入、查询、接口和界面分层。Python 测试使用运行时创建的最小 Excel 文件和临时 SQLite 数据库，不会修改项目根目录中的正式数据文件。浏览器冒烟脚本要求本机安装 Google Chrome，并假定其位于默认 Windows 安装路径。

#### 根目录数据与配置

- `宋代宰辅编年录.xlsx` 是数据源；导入器只读取其中第一个工作表。
- `song_chancellors.db` 是应用默认使用的数据库，可从 Excel 重新生成。
- `requirements.txt` 同时包含运行依赖和 Python 测试依赖。
- `start.ps1` 使用当前已激活 Python 环境启动 Uvicorn；需要自定义端口或热重载时，建议直接使用下文的完整启动命令。

## 数据处理流程

```text
宋代宰辅编年录.xlsx
        │
        ├─ scripts/inspect_excel.py（可选：检查源文件）
        │
        ▼
scripts/import_excel.py
        │
        ▼
song_chancellors/importer.py
        ├─ parsing.py：规范化月份、人物和事件类型
        └─ db.py：创建表结构并写入数据
        │
        ▼
song_chancellors.db
        │
        ├─ repository.py：查询和筛选
        ├─ api.py：REST API
        └─ web/：浏览器检索界面
```

解析结果用于检索辅助，原始事件文本、批注和单元格坐标会保留在数据库中，方便回查数据源。

## 环境准备

项目约定使用 Conda 的 `document` 环境。在 PowerShell 中执行：

```powershell
& 'D:\Develop\Python\miniconda3\shell\condabin\conda-hook.ps1'
conda activate document
python -m pip install -r requirements.txt
```

也可以不激活环境，直接通过 Conda 执行：

```powershell
conda run -n document python -m pip install -r requirements.txt
```

## 检查并导入数据

先检查源工作簿（可选）：

```powershell
python scripts/inspect_excel.py "宋代宰辅编年录.xlsx"
```

从源文件重建默认数据库：

```powershell
$env:PYTHONIOENCODING = 'utf-8'
python scripts/import_excel.py "宋代宰辅编年录.xlsx" --db song_chancellors.db --rebuild
```

> **注意：** `--rebuild` 会先删除 `--db` 指定的已有数据库。执行前请确认目标路径；如需保留手工修改或旧版本数据，请先备份数据库，或输出到另一个文件名。

导入完成后，命令会输出源文件、行列数、人物数、事件数、批注数和警告数。事件分类由关键词规则自动完成；未识别为具体变化、仅表示持续在任的 `tenure` 文本不会进入事件表。

## 启动服务

在项目根目录执行：

```powershell
python -m uvicorn song_chancellors.api:create_app --factory --host 127.0.0.1 --port 8000
```

开发时可增加热重载：

```powershell
python -m uvicorn song_chancellors.api:create_app --factory --reload --port 8000
```

服务启动后可访问：

- Web 页面：<http://127.0.0.1:8000/>
- 健康检查：<http://127.0.0.1:8000/api/health>
- OpenAPI 文档：<http://127.0.0.1:8000/docs>

也可在已经激活依赖环境后运行：

```powershell
.\start.ps1
```

## API 概览

| 方法  | 路径                      | 说明                                     |
| ----- | ------------------------- | ---------------------------------------- |
| `GET` | `/api/health`             | 检查默认数据库路径及文件是否存在         |
| `GET` | `/api/search/events`      | 组合筛选事件并返回分页结果               |
| `GET` | `/api/events/{event_id}`  | 获取事件原文、人物信息、解析信息和批注   |
| `GET` | `/api/people?q=...`       | 按规范名、原始名或别名搜索人物           |
| `GET` | `/api/people/{person_id}` | 获取人物及其全部事件                     |
| `GET` | `/api/facets`             | 获取皇帝、年号、月份、事件类型和年份范围 |
| `GET` | `/api/timeline`           | 按时间点汇总事件数量                     |

`/api/search/events` 支持以下查询参数：

| 参数                     | 含义                                     |
| ------------------------ | ---------------------------------------- |
| `year_from`、`year_to`   | 起止公元年                               |
| `month_from`、`month_to` | 与起止年配合使用的精确月份边界           |
| `month`                  | 指定月份序号或原始月份标签               |
| `person`                 | 人物规范名、原始名或别名的模糊匹配       |
| `event_type`             | `appointment`、`dismissal` 或 `death`    |
| `emperor`                | 皇帝名称模糊匹配；可重复传入以匹配多个值 |
| `era`                    | 年号模糊匹配                             |
| `keyword`                | 事件原文关键词                           |
| `limit`、`offset`        | 分页大小和偏移量                         |

示例：

```text
http://127.0.0.1:8000/api/search/events?person=赵普&year_from=960&year_to=976&limit=20
```

## 数据库结构

| 表                   | 用途                       | 重要字段                                                              |
| -------------------- | -------------------------- | --------------------------------------------------------------------- |
| `persons`            | 人物及别名                 | `canonical_name`、`raw_name`、`aliases`、`source_column`              |
| `time_points`        | 工作表中的年月节点         | `gregorian_year`、`month_index`、`emperor`、`era_name`、`source_row`  |
| `appointment_events` | 实际任命、罢免、死亡等事件 | `person_id`、`time_point_id`、`event_type`、`raw_text`、`source_cell` |
| `annotations`        | Excel 单元格批注           | `event_id`、`source_cell`、`comment_text`                             |
| `import_audit`       | 每次导入的摘要             | 源文件、导入时间、行列数、人物/事件/批注/警告数                       |

人物与事件通过 `person_id` 关联，事件与时间点通过 `time_point_id` 关联，批注通过 `event_id` 关联。常用人物、时间和事件类型字段已建立索引。

## 运行测试

运行全部 Python 测试：

```powershell
python -m pytest -q
```

运行前端状态测试（需要 Node.js）：

```powershell
node --test tests/web/ui-state.test.mjs
```

浏览器冒烟测试需要先启动服务，并安装在默认路径的 Google Chrome：

```powershell
powershell -ExecutionPolicy Bypass -File tests/web/browser-smoke.ps1 -Url http://127.0.0.1:8000
```

## 开发提示

- 调整事件关键词或月份解析时，修改 `song_chancellors/parsing.py`，并同步补充 `tests/test_parsing.py`。
- 修改表结构时，更新 `song_chancellors/db.py`；现有数据库不会自动迁移，开发阶段通常需要重新导入。
- 新增查询条件时，应依次更新 `repository.py`、`api.py`、`web/ui-state.mjs` 和 `web/app.js`，并补充对应测试。
- Web 前端没有构建步骤，修改 `web/` 下文件后刷新浏览器即可；使用 `--reload` 仅会监控 Python 应用重启。
- 自动解析不会覆盖源文本。遇到分类疑问时，应结合 `raw_text`、`source_cell` 和原始 Excel 复核。

## 常见问题

### 页面返回“Database not found”

确认项目根目录存在 `song_chancellors.db`，或按“检查并导入数据”一节重新生成。健康检查中的 `loaded` 应为 `true`。

### 中文输出乱码

PowerShell 中可先设置：

```powershell
$env:PYTHONIOENCODING = 'utf-8'
```

并确保终端和编辑器使用 UTF-8 打开文本文件。

### 修改 Excel 后如何更新数据库

重新执行带 `--rebuild` 的导入命令。该操作会替换目标数据库，请先确认数据库中没有需要单独保留的数据。
