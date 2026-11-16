#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$RootPath
)
$ErrorActionPreference = 'Stop'

function Get-U32([byte[]]$Bytes, [int]$Offset) {
    if ($Offset -lt 0 -or ($Offset + 4) -gt $Bytes.Length) { return [uint32]0 }
    return [BitConverter]::ToUInt32($Bytes, $Offset)
}

function Get-TypeName([byte[]]$Bytes) {
    $n = [Array]::IndexOf($Bytes, [byte]0, 0, [Math]::Min(128, $Bytes.Length))
    if ($n -lt 0) { $n = [Math]::Min(128, $Bytes.Length) }
    return [Text.Encoding]::ASCII.GetString($Bytes, 0, $n)
}

function Invoke-ByteTransform([byte[]]$InputBytes, [int]$Start, [string]$Kind) {
    $b = [byte[]]$InputBytes.Clone()
    for ($i = $Start; $i -lt $b.Length; $i++) {
        $v = [int]$b[$i]
        if ($Kind -eq 'WLD') { $v = (($v - 16) -band 255) -bxor 16 }
        elseif ($Kind -eq 'RCC') { $v = (($v - 6) -band 255) -bxor 223 }
        $b[$i] = [byte]$v
    }
    return ,$b
}

function Get-Candidates([byte[]]$Raw) {
    $list = @()
    $list += [pscustomobject]@{ Name='RAW'; Bytes=$Raw }
    $list += [pscustomobject]@{ Name='WLD-body'; Bytes=(Invoke-ByteTransform $Raw 132 'WLD') }
    $rcc = Invoke-ByteTransform $Raw 0 'RCC'
    $list += [pscustomobject]@{ Name='RCC-whole'; Bytes=$rcc }
    $list += [pscustomobject]@{ Name='RCC-whole+WLD-body'; Bytes=(Invoke-ByteTransform $rcc 132 'WLD') }
    return $list
}

if (-not (Test-Path -LiteralPath $RootPath -PathType Container)) { throw "Folder not found: $RootPath" }
$files = Get-ChildItem -LiteralPath $RootPath -Recurse -File | Where-Object { $_.Extension -in '.wld','.wld0' }
$results = New-Object System.Collections.Generic.List[object]

foreach ($file in $files) {
    $raw = [IO.File]::ReadAllBytes($file.FullName)
    if ($raw.Length -lt 136) { continue }
    $rawType = Get-TypeName $raw
    foreach ($candidate in (Get-Candidates $raw)) {
        $b = [byte[]]$candidate.Bytes
        if ($file.Extension -ieq '.wld') {
            $ver = Get-U32 $b 264
            $size = Get-U32 $b 268
            $marks = @((Get-U32 $b 272),(Get-U32 $b 276),(Get-U32 $b 280),(Get-U32 $b 284))
            $bool = [int]$b[288]
            $inRange = @($marks | Where-Object { $_ -gt 0 -and $_ -lt ($b.Length - 132) }).Count
            $score = 0
            if ($ver -eq 0x0100) { $score += 4 }
            if ($size -eq 16) { $score += 2 }
            if ($bool -le 1) { $score += 1 }
            $score += $inRange
            $valid = ($ver -eq 0x0100 -and $size -eq 16 -and $bool -le 1 -and $inRange -ge 2)
            $results.Add([pscustomobject]@{ File=$file.Name; Type=$rawType; Candidate=$candidate.Name; Score=$score; Valid=$valid; MarkVer=('0x{0:X8}' -f $ver); MarkSize=$size; RootBool=$bool; MarksInRange=$inRange })
        } else {
            $ver = Get-U32 $b 132
            $results.Add([pscustomobject]@{ File=$file.Name; Type=$rawType; Candidate=$candidate.Name; Score=$(if ($ver -eq 0x0102) { 10 } else { 0 }); Valid=($ver -eq 0x0102); MeshVer=('0x{0:X8}' -f $ver); FileBytes=$b.Length })
        }
    }
}

Write-Host "Scanned $($files.Count) WLD/WLD0 files under $RootPath"
$valid = @($results | Where-Object Valid)
if ($valid.Count -gt 0) {
    Write-Host "`nVALID CANDIDATES" -ForegroundColor Green
    $valid | Format-Table -AutoSize
} else {
    Write-Host "`nNo candidate passed the source-layout checks." -ForegroundColor Yellow
}
Write-Host "`nBest candidate per file (highest structural score):"
$results | Group-Object File | ForEach-Object { $_.Group | Sort-Object Score -Descending | Select-Object -First 1 } | Format-Table -AutoSize
Write-Host "`nNote: diagnostic only. It does not overwrite or modify any game file."