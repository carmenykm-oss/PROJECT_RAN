# PROJECT RAN - local client reconnaissance
# Run:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\scan-ran-client.ps1 -RootPath "C:\Path\To\RAN"
# Output defaults to a timestamped folder on the current user's Desktop.
#
# Privacy: this script reads local EXE/DLL/OCX files, but does not modify,
# copy, upload, or transmit them. It writes a small TXT + JSON report only.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$RootPath,

    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path -LiteralPath $RootPath).Path

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = Join-Path ([Environment]::GetFolderPath("Desktop")) "PROJECT_RAN-scan-$stamp"
}
New-Item -ItemType Directory -Force -Path $OutputPath | Out-Null

$keywords = @(
    "wld", "wld0", "land.man", "serialfile", "compbyte",
    "decrypt", "encrypt", "compress", "decompress", "zlib",
    "octree", "dxland", "dxstaticmesh", "mapload", "mapdata",
    "terrain", "staticmesh", "ranonline"
)
$extensions = @(".exe", ".dll", ".ocx")
$records = New-Object System.Collections.Generic.List[object]
$maxScanBytes = 128MB
$maxMatchesPerFile = 24

function Get-PrintableStrings {
    param([byte[]]$Bytes)
    $found = New-Object System.Collections.Generic.List[string]
    $latin = [Text.Encoding]::GetEncoding(28591).GetString($Bytes)
    foreach ($m in [regex]::Matches($latin, '[\x20-\x7E]{5,}')) {
        $s = $m.Value.Trim()
        if ($s.Length -gt 180) { $s = $s.Substring(0, 180) }
        if ($s) { $found.Add($s) }
    }
    $unicode = [Text.Encoding]::Unicode.GetString($Bytes)
    foreach ($m in [regex]::Matches($unicode, '[\x20-\x7E]{5,}')) {
        $s = $m.Value.Trim()
        if ($s.Length -gt 180) { $s = $s.Substring(0, 180) }
        if ($s) { $found.Add($s) }
    }
    return $found
}

$files = Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() }

$total = @($files).Count
$index = 0
foreach ($file in $files) {
    $index++
    Write-Progress -Activity "Scanning RAN client metadata" -Status "$index / $total : $($file.Name)" -PercentComplete ([int](100 * $index / [Math]::Max(1, $total)))

    $versionInfo = $null
    try { $versionInfo = [Diagnostics.FileVersionInfo]::GetVersionInfo($file.FullName) } catch {}

    $matches = New-Object System.Collections.Generic.List[string]
    $scanStatus = "metadata-only"
    if ($file.Length -le $maxScanBytes) {
        try {
            $bytes = [IO.File]::ReadAllBytes($file.FullName)
            $strings = Get-PrintableStrings -Bytes $bytes
            foreach ($s in $strings) {
                $lower = $s.ToLowerInvariant()
                foreach ($kw in $keywords) {
                    if ($lower.Contains($kw)) {
                        if (-not $matches.Contains($s)) { $matches.Add($s) }
                        break
                    }
                }
                if ($matches.Count -ge $maxMatchesPerFile) { break }
            }
            $scanStatus = "scanned"
            $bytes = $null
        } catch {
            $scanStatus = "read-error: $($_.Exception.Message)"
        }
    } else {
        $scanStatus = "skipped-over-128MB"
    }

    $relative = $file.FullName.Substring($Root.TrimEnd('\').Length).TrimStart('\')
    $records.Add([pscustomobject]@{
        path = $relative
        extension = $file.Extension
        size_bytes = $file.Length
        last_write_utc = $file.LastWriteTimeUtc.ToString("o")
        file_version = if ($versionInfo) { $versionInfo.FileVersion } else { "" }
        product_version = if ($versionInfo) { $versionInfo.ProductVersion } else { "" }
        product_name = if ($versionInfo) { $versionInfo.ProductName } else { "" }
        company_name = if ($versionInfo) { $versionInfo.CompanyName } else { "" }
        file_description = if ($versionInfo) { $versionInfo.FileDescription } else { "" }
        string_scan = $scanStatus
        keyword_strings = @($matches)
    })
}
Write-Progress -Activity "Scanning RAN client metadata" -Completed

$report = [pscustomobject]@{
    report_type = "PROJECT_RAN local client scan"
    generated_utc = (Get-Date).ToUniversalTime().ToString("o")
    root_folder_name = (Split-Path $Root -Leaf)
    files_scanned = $records.Count
    note = "No binaries were copied or uploaded. Keyword strings are short clues, not proof of encryption or file format."
    files = @($records)
}
$jsonPath = Join-Path $OutputPath "ran-client-scan.json"
$txtPath = Join-Path $OutputPath "ran-client-scan.txt"
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add("PROJECT RAN - LOCAL CLIENT SCAN")
$lines.Add("Generated UTC: $($report.generated_utc)")
$lines.Add("Root folder: $($report.root_folder_name)")
$lines.Add("EXE/DLL/OCX files: $($records.Count)")
$lines.Add("")
foreach ($r in $records) {
    $lines.Add("[$($r.extension)] $($r.path)")
    $lines.Add("  Size: $($r.size_bytes) | FileVersion: $($r.file_version) | ProductVersion: $($r.product_version)")
    if ($r.product_name -or $r.file_description) {
        $lines.Add("  Product: $($r.product_name) | Description: $($r.file_description)")
    }
    $lines.Add("  String scan: $($r.string_scan)")
    foreach ($s in $r.keyword_strings) { $lines.Add("  clue: $s") }
    $lines.Add("")
}
$lines | Set-Content -LiteralPath $txtPath -Encoding UTF8

Write-Host ""
Write-Host "Scan complete." -ForegroundColor Green
Write-Host "TXT : $txtPath"
Write-Host "JSON: $jsonPath"
Write-Host "Files scanned: $($records.Count)"
Write-Host "Only upload ran-client-scan.json or ran-client-scan.txt to PROJECT_RAN; do NOT upload the client binaries."
