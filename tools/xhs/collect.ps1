param([string]$Keyword = '通勤穿搭', [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($Keyword) -or $Keyword -match '[,，、\r\n]') { throw '请输入一个关键词，不要使用逗号、顿号或换行。' }
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$crawlerRoot = Join-Path $PSScriptRoot 'MediaCrawler'
$python = Join-Path $PSScriptRoot '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw '请先运行 tools/xhs/install.ps1 初始化 Python 环境。' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '没有找到 Node.js，请安装后重开终端。' }
$browserPaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
)
if (-not ($browserPaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })) { throw '没有检测到 Chrome 或 Edge 浏览器，请先安装。' }
$oldEncoding = $env:PYTHONIOENCODING
Push-Location $crawlerRoot
try {
  $env:PYTHONIOENCODING = 'utf-8'
  & $python --version
  if ($LASTEXITCODE -ne 0) { throw 'Python 虚拟环境不可用，请在本机重新初始化。' }
  if ($CheckOnly) {
    & $python main.py --help
    if ($LASTEXITCODE -ne 0) { throw '采集工具启动检查未通过，请检查 Python 依赖。' }
    Write-Host '环境检查通过；本次没有访问小红书或执行采集。'
    return
  }
  $runName = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8)
  $runRoot = Join-Path $PSScriptRoot ('runs\' + $runName)
  $outputRoot = Join-Path $PSScriptRoot 'output'
  $runOutput = Join-Path $runRoot 'import.json'
  New-Item -ItemType Directory -Force -Path $runRoot, $outputRoot | Out-Null
  & $python main.py --platform xhs --lt qrcode --type search --keywords $Keyword --get_comment false --get_sub_comment false --get_media false --crawler_max_notes_count 5 --save_data_option json --save_data_path $runRoot
  if ($LASTEXITCODE -ne 0) { throw '采集未成功完成，请查看终端提示。本次未更新 output/latest.json。' }
  & $python (Join-Path $PSScriptRoot 'convert_xhs.py') $runRoot $runOutput
  if ($LASTEXITCODE -ne 0) { throw '没有生成可导入数据。本次未更新 output/latest.json。' }
  $latest = Join-Path $outputRoot 'latest.json'
  Copy-Item -LiteralPath $runOutput -Destination $latest -Force
  Write-Host "采集完成，请在话题追踪中导入：$latest"
  Write-Host "图片已保存到：$(Join-Path $projectRoot 'web\public\imported-media')"
} finally {
  Pop-Location
  $env:PYTHONIOENCODING = $oldEncoding
}
