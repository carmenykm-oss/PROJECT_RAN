# PROJECT RAN - local client reconnaissance (Windows PowerShell 5.1 compatible)
# This script ONLY reads EXE/DLL/OCX metadata and printable ASCII clues.
# It never modifies, copies, uploads, or transmits client binaries.
# Run:
# powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\Downloads\scan-ran-client.ps1" -RootPath "C:\Program Files (x86)\XtraVision\Ran2Online"

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
trap {
    Write-Host ""
    Write-Host "SCAN ERROR: $($_.Exception.GetType().FullName): $($_.Exception.Message)" -ForegroundColor Red
    if ($_.InvocationInfo) {
        Write-Host ("Script line {0}: {1}" -f $_.InvocationInfo.ScriptLineNumber, $_.InvocationInfo.Line) -ForegroundColor Yellow
    }
    Write-Host "Please copy the complete error details above." -ForegroundColor Yellow
    break
}

$resolved = Resolve-Path -LiteralPath $RootPath
$root = [string]$resolved.ProviderPath
if (-not (Test-Path -LiteralPath $root -PathType Container)) {
    throw "RootPath is not a folder: $root"
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $desktop = [Environment]::GetFolderPath("Desktop")
    $OutputPath = Join-Path $desktop ("PROJECT_RAN-scan-" + $stamp)
}
[void](New-Item -ItemType Directory -Force -Path $OutputPath)

$keywords = @("wld","wld0","land.man","serialfile","compbyte","decrypt","encrypt","compress","decompress","zlib","octree","dxland","dxstaticmesh","mapload","mapdata","terrain","staticmesh","ranonline")
$extensions = @(".exe", ".dll", ".ocx")
$records = @()
$files = @(Get-ChildItem -LiteralPath $root -Recurse -ErrorAction SilentlyContinue | Where-Object { -not $_.PSIsContainer -and $extensions -contains $_.Extension.ToLowerInvariant() })
$total = $files.Count
$index = 0

foreach ($file in $files) {
    $index++
    if ($total -gt 0) {
        $pct = [int](100.0 * $index / $total)
        Write-Progress -Activity "Scanning RAN client" -Status ("{0}/{1}: {2}" -f $index,$total,$file.Name) -PercentComplete $pct
    }

    $vi = $null
    try { $vi = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($file.FullName) } catch {}

    $clues = @()
    $scanStatus = "metadata-only"
    if ($file.Length -le 67108864) {
        $stream = $null
        try {
            $stream = [System.IO.File]::Open($file.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
            $count = [int][Math]::Min([int64]$stream.Length, [int64]67108864)
            $buffer = New-Object byte[] $count
            $read = $stream.Read($buffer, 0, $count)
            if ($read -lt $count) { $buffer = $buffer[0..([Math]::Max(0,$read - 1))] }
            # ASCII is sufficient for API names, file extensions and diagnostic strings.
            $ascii = [System.Text.Encoding]::ASCII.GetString($buffer)
            $seen = @{}
            foreach ($m in [regex]::Matches($ascii, '[\x20-\x7E]{5,}')) {
                $s = $m.Value.Trim()
                $low = $s.ToLowerInvariant()
                foreach ($kw in $keywords) {
                    if ($low.Contains($kw)) {
                        if (-not $seen.ContainsKey($s)) {
                            $seen[$s] = $true
                            $clues += $s.Substring(0, [Math]::Min(160, $s.Length))
                        }
                        break
                    }
                }
                if ($clues.Count -ge 20) { break }
            }
            $scanStatus = "scanned"
        } catch {
            $scanStatus = "read-error: " + $_.Exception.Message
        } finally {
            if ($stream) { $stream.Dispose() }
        }
    } else {
        $scanStatus = "skipped-over-64MB"
    }

    $relative = $file.FullName.Substring($root.TrimEnd('\').Length).TrimStart('\')
    $records += [pscustomobject]@{
        path = $relative
        extension = $file.Extension
        size_bytes = [int64]$file.Length
        file_version = if ($vi) { [string]$vi.FileVersion } else { "" }
        product_version = if ($vi) { [string]$vi.ProductVersion } else { "" }
        product_name = if ($vi) { [string]$vi.ProductName } else { "" }
        company_name = if ($vi) { [string]$vi.CompanyName } else { "" }
        file_description = if ($vi) { [string]$vi.FileDescription } else { "" }
        string_scan = $scanStatus
        keyword_strings = @($clues)
    }
}
Write-Progress -Activity "Scanning RAN client" -Completed

$report = [pscustomobject]@{
    report_type = "PROJECT_RAN local client scan"
    generated_utc = (Get-Date).ToUniversalTime().ToString("o")
    root_folder_name = (Split-Path $root -Leaf)
    files_scanned = $records.Count
    note = "Metadata and short ASCII clues only. No binaries copied, modified, uploaded or transmitted."
    files = @($records)
}
$jsonPath = Join-Path $OutputPath "ran-client-scan.json"
$txtPath = Join-Path $OutputPath "ran-client-scan.txt"
$report | ConvertTo-Json -Depth 6 | Out-File -LiteralPath $jsonPath -Encoding UTF8

$lines = @(
    "PROJECT RAN - LOCAL CLIENT SCAN",
    "Generated UTC: $($report.generated_utc)",
    "Root folder: $($report.root_folder_name)",
    "EXE/DLL/OCX files: $($records.Count)",
    ""
)
foreach ($r in $records) {
    $lines += "[$($r.extension)] $($r.path)"
    $lines += "  Size: $($r.size_bytes) | FileVersion: $($r.file_version) | ProductVersion: $($r.product_version)"
    $lines += "  Product: $($r.product_name) | Company: $($r.company_name) | Description: $($r.file_description)"
    $lines += "  String scan: $($r.string_scan)"
    foreach ($s in $r.keyword_strings) { $lines += "  clue: $s" }
    $lines += ""
}
$lines | Out-File -LiteralPath $txtPath -Encoding UTF8

Write-Host ""
Write-Host "SCAN COMPLETE" -ForegroundColor Green
Write-Host ("Files scanned: {0}" -f $records.Count)
Write-Host ("TXT : {0}" -f $txtPath)
Write-Host ("JSON: {0}" -f $jsonPath)
Write-Host "Upload only the JSON or TXT report to the PROJECT_RAN repository. Do NOT upload game binaries."
