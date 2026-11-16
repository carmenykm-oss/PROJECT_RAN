param(
    [Parameter(Mandatory=$true)]
    [string]$InstallRoot
)

$ErrorActionPreference = "Stop"
$generalMap = Join-Path $InstallRoot "General\RData\map"
$originalMap = Join-Path $InstallRoot "Original\RData\map"

foreach ($dir in @($generalMap, $originalMap)) {
    if (-not (Test-Path -LiteralPath $dir -PathType Container)) {
        Write-Error "Map folder not found: $dir"
        exit 2
    }
}

function Get-Sha256([string]$Path) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $bytes = $sha.ComputeHash($stream)
        return ([System.BitConverter]::ToString($bytes)).Replace("-", "")
    }
    finally {
        $stream.Dispose()
        $sha.Dispose()
    }
}

function Read-U32([byte[]]$Bytes, [int]$Offset) {
    if ($Bytes.Length -lt ($Offset + 4)) { return $null }
    return [System.BitConverter]::ToUInt32($Bytes, $Offset)
}

Write-Output "=== MAP TREE COUNTS ==="
$gFiles = Get-ChildItem -LiteralPath $generalMap -File
$oFiles = Get-ChildItem -LiteralPath $originalMap -File
Write-Output ("General map files:  {0}" -f $gFiles.Count)
Write-Output ("Original map files: {0}" -f $oFiles.Count)

Write-Output ""
Write-Output "=== SCHOOL / CAMPUS CANDIDATES ==="
$candidates = @($gFiles + $oFiles | Where-Object {
    $_.Name -match '(?i)school|campus|academy|college|4school'
} | Sort-Object FullName -Unique)
if ($candidates.Count -eq 0) {
    Write-Output "No filenames matched school/campus/academy/college/4school."
} else {
    $candidates | Select-Object FullName,Length,LastWriteTime | Format-Table -AutoSize
}

Write-Output ""
Write-Output "=== SAME-NAME FILE COMPARISON ==="
$origByName = @{}
foreach ($f in $oFiles) { $origByName[$f.Name.ToLowerInvariant()] = $f }
$common = @($gFiles | Where-Object { $origByName.ContainsKey($_.Name.ToLowerInvariant()) })
Write-Output ("Same-name files in both trees: {0}" -f $common.Count)

$comparison = foreach ($g in $common) {
    $o = $origByName[$g.Name.ToLowerInvariant()]
    $sameSize = ($g.Length -eq $o.Length)
    $sameHash = $false
    if ($sameSize) {
        $sameHash = ((Get-Sha256 $g.FullName) -eq (Get-Sha256 $o.FullName))
    }
    [pscustomobject]@{
        Name = $g.Name
        GeneralBytes = $g.Length
        OriginalBytes = $o.Length
        SameSize = $sameSize
        SameSHA256 = if ($sameSize) { $sameHash } else { $false }
    }
}
$comparison | Sort-Object Name | Format-Table Name,GeneralBytes,OriginalBytes,SameSize,SameSHA256 -AutoSize

Write-Output ""
Write-Output "=== SOURCE-LAYOUT HEADER CHECKS ==="
$headerFiles = @($gFiles + $oFiles | Where-Object {
    $_.Extension -in @(".wld", ".wld0")
} | Sort-Object FullName -Unique)

foreach ($f in $headerFiles) {
    $bytes = [System.IO.File]::ReadAllBytes($f.FullName)
    $type = [System.Text.Encoding]::ASCII.GetString($bytes,0,[Math]::Min(16,$bytes.Length)).Trim([char]0)
    if ($f.Extension -ieq ".wld" -and $bytes.Length -ge 292) {
        $ver = Read-U32 $bytes 128
        $markVer = Read-U32 $bytes 264
        $markSize = Read-U32 $bytes 268
        $octBool = Read-U32 $bytes 288
        "{0} | type={1} mapVer=0x{2:X} markVer=0x{3:X} markSize={4} octreeBool={5}" -f $f.FullName,$type,$ver,$markVer,$markSize,$octBool
    }
    elseif ($f.Extension -ieq ".wld0" -and $bytes.Length -ge 144) {
        $meshVer = Read-U32 $bytes 132
        $boundsSize = Read-U32 $bytes 136
        "{0} | type={1} meshVer=0x{2:X} boundsBlockSize={3}" -f $f.FullName,$type,$meshVer,$boundsSize
    }
}
Write-Output ""
Write-Output "Comparison complete. No files were modified."
