param(
  [Parameter(Mandatory = $true)]
  [string]$ArchivePath,
  [string]$ProjectPath = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$ArchivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
$ProjectPath = (Resolve-Path -LiteralPath $ProjectPath).Path
$Extractor = Join-Path $ProjectPath "scripts\extract-ran2-animation-clips.py"
$Skeleton = Join-Path $ProjectPath "public\models\ran-female.glb"
$Output = Join-Path $ProjectPath "public\animations"

if (-not (Test-Path -LiteralPath $Extractor)) { throw "找不到動畫解析器：$Extractor" }
if (-not (Test-Path -LiteralPath $Skeleton)) { throw "找不到女角色骨骼模型：$Skeleton" }
if (-not (Get-Command python -ErrorAction SilentlyContinue)) { throw "找不到 Python 3。請先安裝 Python 3，並勾選 Add Python to PATH。" }

New-Item -ItemType Directory -Force -Path $Output | Out-Null
Write-Host "正在解碼 RAN2 BIN，並比對女角色 67 骨骼……" -ForegroundColor Cyan
& python $Extractor $ArchivePath --output-dir $Output --match "a_x01bs_lv1_wait.bin" --match "a_x01bs_lv1_walk.bin" --match "a_x01bs_lv1_run.bin" --skeleton-glb $Skeleton --strict-skeleton --write-manifest
if ($LASTEXITCODE -ne 0) {
  throw "原版動畫解析未通過。請把 public\animations\extraction-report.json 傳回來，我會按實際錯誤修正解析器。"
}

$Manifest = Get-Content -Raw -LiteralPath (Join-Path $Output "manifest.json") | ConvertFrom-Json
if ($Manifest.status -ne "ready") { throw "三組原版動畫未全部通過檢查，不能啟用。" }
Write-Host "成功：原版待機、行走、跑步 BIN 已解碼，並通過女角色骨骼名稱比對。" -ForegroundColor Green
Write-Host "輸出位置：$Output"
Write-Host "下一步：把整個 public\animations 資料夾提交到 PROJECT_RAN，然後重新部署預覽。"
