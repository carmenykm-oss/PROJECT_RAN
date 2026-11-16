param(
    [string]$RootPath = "C:\Program Files (x86)\XtraVision\Ran2Online",
    [int]$MaxMatches = 120
)

$ErrorActionPreference = "SilentlyContinue"
if (-not (Test-Path -LiteralPath $RootPath)) {
    throw "RootPath not found: $RootPath"
}

Write-Host "PROJECT RAN - MAP ASSET INVENTORY"
Write-Host "Root: $RootPath"
Write-Host ""

$roots = @("RData","Data","Textures","Texture","GameData","Resource")
foreach ($name in $roots) {
    $p = Join-Path $RootPath $name
    if (Test-Path -LiteralPath $p) {
        Write-Host ("FOUND ROOT: " + $p)
    }
}

Write-Host "`n=== MAP / LEVEL FILES ==="
$mapFiles = Get-ChildItem -LiteralPath $RootPath -File -Recurse |
    Where-Object {
        $_.Extension -match '^(?i)\.(wld|wld0|glmap|lev|map|ini|pak|rcc)$' -or
        $_.Name -match '(?i)school|campus|sacred|mystic|phoenix'
    } |
    Select-Object -First $MaxMatches FullName,Length,Extension

if ($mapFiles) { $mapFiles | Format-Table -AutoSize } else { Write-Host "No matching map/level files found." }

Write-Host "`n=== ASSET EXTENSION COUNTS ==="
$files = Get-ChildItem -LiteralPath $RootPath -File -Recurse
$files |
    Group-Object { if ($_.Extension) { $_.Extension.ToLowerInvariant() } else { "[no extension]" } } |
    Sort-Object Count -Descending |
    Select-Object -First 25 @{N="Extension";E={$_.Name}},Count |
    Format-Table -AutoSize

Write-Host "`n=== IMPORTANT RESOURCE FOLDERS ==="
$folderNames = @("Map","GLMap","Tiles","StaticMesh","Object","Piece","Textures")
$foundFolders = Get-ChildItem -LiteralPath $RootPath -Directory -Recurse |
    Where-Object { $folderNames -contains $_.Name } |
    Select-Object -First 100 FullName
if ($foundFolders) { $foundFolders | Format-Table -AutoSize } else { Write-Host "No conventional resource folders found." }

Write-Host "`nInventory complete. No files were modified."
