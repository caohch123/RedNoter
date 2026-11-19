# 项目工具运行说明

## 目录

```text
RedNoter-main/
├─ tools/
│  ├─ README.md                 本说明
│  └─ xhs/
│     ├─ MediaCrawler/          采集源码，保留上游许可证和本地修改
│     ├─ install.ps1            首次建立 Python 环境并安装依赖
│     ├─ collect.ps1            扫码登录、关键词采集、转换结果
│     ├─ convert_xhs.py         清理正文、保存话题标签、下载图片
│     ├─ constraints-tested.txt 初次成功采集环境的依赖版本约束
│     ├─ UPSTREAM.txt           上游地址、版本和修改记录
│     ├─ .venv/                 初始化后生成，不随项目分发
│     ├─ runs/                  每次采集的原始数据与转换结果
│     └─ output/latest.json     最近一次成功采集的网页导入文件
└─ web/
   ├─ public/imported-media/   下载图片及磁盘清理的唯一目标目录
   └─ src/
      ├─ app/api/media/cleanup/route.ts  图片清理接口
      ├─ lib/delete-media.ts           删除磁盘图片的核心函数
      ├─ lib/media-cleanup.ts          根据帖子、收藏保护引用，发起清理
      └─ lib/imported-posts.ts         100 条上限及待清理队列
```

采集和图片删除均已在项目内。删除工具是网页的功能，不需要另装 Python 插件；它通过 Node.js 后端删除文件。它不是用于删除任意磁盘文件的独立命令。

## 运行环境

| 环境 | 用途 |
| --- | --- |
| Windows 10/11、PowerShell 5.1 或更高 | 运行配套安装和采集脚本 |
| Python 3.12（64 位，含 pip、venv） | 推荐的采集运行环境；上游最低要求为 3.11 |
| Node.js LTS（建议 24.x 或更新且符合 web/package.json 的要求）、npm | 启动网页、运行后端删除接口，采集依赖的 JavaScript 执行环境 |
| Chrome 或 Microsoft Edge 桌面版 | 采集使用本机浏览器 CDP 模式，无需额外运行 playwright install |
| 可联网的电脑、小红书账号 | 下载依赖和采集；扫码登录和页面验证由使用者本人完成 |

不需要数据库、Redis 服务、Docker 或 API Key。requirements.txt 中包含数据库相关 Python 库，因为上游存在这些模块，但当前采用 JSON 文件输出，不连接数据库服务。

Python 安装后需重开终端，使用 `py -3.12 --version` 或 `python --version` 检查。Node.js 使用 `node -v`、`npm.cmd -v` 检查。安装 Python 时勾选 Add Python to PATH。

## 第一次安装采集依赖

在项目根目录的 PowerShell 终端执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\xhs\install.ps1"
```

该脚本会在 tools/xhs/.venv 创建本项目专用 Python 环境，通过 pip 联网安装依赖，不修改其他 Python 项目。虚拟环境与登录资料不从原来的聊天工作目录复制。

如 Python 不在 PATH，使用自己的实际路径：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\xhs\install.ps1" -PythonPath "C:\实际安装目录\python.exe"
```

如果有 py 启动器，脚本默认选 Python 3.12；其他版本可通过 -PythonPath 指定。初始化后运行 `collect.ps1 -CheckOnly` 可以检查启动环境，不执行采集。

## 采集帖子

### 在网页中采集（推荐）

先运行一次 install.ps1 初始化项目内的 Python 环境，再启动网页并登录。话题追踪页面的“采集小红书帖子”区域提供：

- 按关键词搜索：填写一个关键词。
- 随机采集（首页推荐流）：读取登录账号首页实际展示的推荐帖子，不替换为随机关键词，也不是全平台均匀随机抽样。
- 最多 10 条或最多 100 条。详情失效、重复推荐、平台限制或加载结束时，实际数量可能不足目标。

点击“开始采集”会在运行网页服务的这台电脑上打开浏览器，请本人完成扫码和验证。任务在后台执行，页面每两秒读取进度；完成后自动下载图片、加入本浏览器的帖子列表并执行 100 条上限，通常不需要再手动导入 JSON。已有分类筛选保持不变。

运行中可以点击“停止采集”。同一项目一次只运行一个网页采集任务；刷新页面后会恢复查看当前任务。后台最长运行一小时。任务状态、原始数据、结果 JSON 和本机日志位于 tools/xhs/.runtime/任务ID/；日志可能含平台响应，不能作为普通源码提交或公开分享，目录已加入忽略规则。

运行采集期间图片清理暂缓，以保护尚未加入列表的新图片。采集完成后会重新清理无引用的淘汰图片；失败可手动重试。网页接口仅允许本机开发服务器、有效网页登录和同源请求。部署到服务器或启用 API_PROXY_TARGET 后，需由团队后端接入任务接口，不能直接沿用本机扫码流程。

### 通过命令行采集

在项目根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ".\tools\xhs\collect.ps1" -Keyword "通勤穿搭"
```

浏览器弹出后完成小红书登录。每次最多请求 5 篇帖子详情，关闭评论和视频下载；转换脚本负责下载帖子图片（视频帖子可包含封面）。成功后在话题追踪选择 `tools/xhs/output/latest.json` 导入。

图片进入 `web/public/imported-media`，JSON 中使用网页相对路径。新脚本和转换器按自身位置寻找项目，不依赖 C 盘聊天目录或固定 E 盘路径。只移动脚本、而不保留上述目录关系则无法使用。

当前下载单图最大 20 MB；下载失败会输出提示，其他帖子内容继续转换。latest.json 只在成功生成新结果后更新；运行失败时不要把旧文件误当成本次结果。

## 启动网页与清理磁盘图片

另开一个终端，项目根目录执行：

```powershell
cd web
npm.cmd install
npm.cmd run dev -- --hostname 127.0.0.1
```

已有 node_modules 时通常不必重复 npm install。打开终端给出的本机地址并登录。

导入超过 100 条帖子时，保留最新加入的 100 条；淘汰图片先进入队列。自动清理会保护当前浏览器仍在展示或已收藏的图片，随后调用本地图片删除接口。失败可在话题追踪点击“清理淘汰图片”。

清理接口仅支持 localhost/127.0.0.1 的开发服务器、同源请求和有效登录；不能直接双击 TypeScript 文件运行。它只处理队列中符合采集命名规则的普通图片文件，不递归删除目录，不扫描原始采集 JSON。每次最多处理 500 张，剩余可继续点击清理。

目前收藏保存在浏览器而非数据库，引用检查覆盖当前网站地址下的这个浏览器存储；其他浏览器、端口和电脑的收藏不参与保护。此前已被移除且不在待清理队列的图片不会被全盘扫描。API_PROXY_TARGET 启用时 /api 会转发到团队后端，届时需由后端接入相同清理接口，或调整该路径的转发配置。

## 小组迁移与提交

分享 tools 下源码和脚本、web 源码；每台电脑重新初始化 .venv 和 node_modules，并自行登录。项目根目录的 .gitignore 已排除本地账号、采集结果、下载图片、登录资料、个人 .env、依赖和开发缓存。浏览器里的帖子、收藏和自定义分类也不会随源码复制。原始采集结果与图片如需用于作业展示，应单独检查后分享。

### 首次提交 GitHub

在包含 web 和 tools 的项目根目录执行（不要只上传 web）：

```powershell
git init
git branch -M main
git add .
git status --short
git diff --cached --name-only
```

提交清单中应包含源码、package-lock.json、采集工具源码和许可证；不应包含 web/.mock、web/public/imported-media、tools/xhs/.runtime、runs、output、MediaCrawler/browser_data、.env.local、node_modules、.venv、.vs 等目录或文件。确认后提交：

```powershell
git commit -m "Initial project source"
```

在 GitHub 创建一个空仓库，然后将下面的占位地址换成自己的仓库地址：

```powershell
git remote add origin https://github.com/YOUR_NAME/YOUR_REPO.git
git push -u origin main
```

Git 提交本身会记录提交者姓名和邮箱。需要隐藏真实邮箱时，在 GitHub 的 Settings → Emails 开启邮箱隐私，复制页面显示的 noreply 邮箱，在首次提交前对本项目设置 git config user.email；提交者姓名可用 GitHub 昵称。

.gitignore 只影响尚未被 Git 跟踪的文件。如果此前已提交过个人数据，需要另外取消跟踪，并检查历史提交。普通 ZIP 打包和 GitHub 网页拖拽上传不会自动遵守 .gitignore，不要把整个正在运行的项目目录直接打包上传。

MediaCrawler 上游：https://github.com/NanmiCoder/MediaCrawler 。来源版本和本地修改见 xhs/UPSTREAM.txt。采集源码适用 xhs/MediaCrawler/LICENSE 中的非商业学习许可证，提交课程作业时保留原版权声明与许可证。
