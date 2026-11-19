param([string]$PythonPath = '')
$ErrorActionPreference = 'Stop'

# 虚拟环境必须在本机重新建立，不从其他路径复制。
$baseCommand = $null
$baseArgs = @()
if ($PythonPath) {
  if (-not (Test-Path -LiteralPath $PythonPath -PathType Leaf)) { throw '指定的 Python 路径不存在。' }
  $baseCommand = (Resolve-Path -LiteralPath $PythonPath).Path
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  $baseCommand = 'py'
  $baseArgs = @('-3.12')
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  $baseCommand = 'python'
} else {
  throw '没有找到 Python。请安装 Python 3.12（64 位），重开终端；也可使用 -PythonPath 指定 python.exe。'
}
& $baseCommand @baseArgs -c 'import sys; print(sys.version); sys.exit(0 if sys.version_info >= (3, 11) else 1)'
if ($LASTEXITCODE -ne 0) { throw '需要 Python 3.11 或以上，推荐 Python 3.12；py 启动器使用 -3.12。可用 -PythonPath 指定其他解释器。' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '没有找到 Node.js，请安装 Node.js LTS 并重开终端。' }

$venv = Join-Path $PSScriptRoot '.venv'
$python = Join-Path $venv 'Scripts\python.exe'
if (-not (Test-Path -LiteralPath $venv)) {
  & $baseCommand @baseArgs -m venv $venv
  if ($LASTEXITCODE -ne 0) { throw '创建 Python 虚拟环境失败。' }
}
& $python --version
if ($LASTEXITCODE -ne 0) { throw '本机虚拟环境不可用。请重新建立 tools/xhs/.venv，不要复制其他电脑的虚拟环境。' }
$cache = Join-Path $PSScriptRoot '.cache'
$temp = Join-Path $cache 'temp'
New-Item -ItemType Directory -Force -Path $temp | Out-Null
$oldTemp = $env:TEMP
$oldTmp = $env:TMP
try {
  $env:TEMP = $temp
  $env:TMP = $temp
  & $python -m pip install --timeout 120 --cache-dir (Join-Path $cache 'pip') -r (Join-Path $PSScriptRoot 'MediaCrawler\requirements.txt') -c (Join-Path $PSScriptRoot 'constraints-tested.txt')
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查上述下载或安装错误后重试。' }
  & $python -m pip check
  if ($LASTEXITCODE -ne 0) { throw '依赖版本检查失败。' }
  & (Join-Path $PSScriptRoot 'collect.ps1') -CheckOnly
  Write-Host '初始化完成。运行 tools/xhs/collect.ps1 开始采集。'
} finally {
  $env:TEMP = $oldTemp
  $env:TMP = $oldTmp
}
