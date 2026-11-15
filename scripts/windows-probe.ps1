# DJ HQ - Windows probe for Mixed In Key, Platinum Notes and rekordbox.
#
# READ-ONLY: it lists folders, reads the registry and a few settings files, and writes ONE text
# file to your Desktop (djhq-windows-probe.txt). It starts no program, changes no setting and
# touches no music file.
#
# How to run: right-click this file > "Run with PowerShell".
# If Windows refuses to run scripts, open PowerShell and type:
#     powershell -ExecutionPolicy Bypass -File "C:\path\to\windows-probe.ps1"
# It is most useful if Mixed In Key and Platinum Notes have each been used at least once.
# Skim the result before sending it: licence and e-mail values are masked, but have a look.

$ErrorActionPreference = 'SilentlyContinue'
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'djhq-windows-probe.txt'
$sb = New-Object System.Text.StringBuilder
function W([string]$s = '') { [void]$sb.AppendLine($s) }
function H([string]$s) { W; W ('=' * 78); W $s; W ('=' * 78) }
$NAME = 'mixed ?in ?key|mixedinkey|platinum ?notes|platinumnotes'
$SECRET = 'licen[sc]e|serial|e-?mail|token|password|activation|registration|username|user_?name|machine_?id|hwid'
function Mask([string]$line) {
  if ($line -match $SECRET) { return ($line -replace '(=|:|>)\s*.+$', '$1 <masked>') }
  return $line
}

H 'System'
W ("Windows:     " + [Environment]::OSVersion.VersionString)
W ("Caption:     " + (Get-CimInstance Win32_OperatingSystem).Caption)
W ("PowerShell:  " + $PSVersionTable.PSVersion.ToString())
W ("64-bit OS:   " + [Environment]::Is64BitOperatingSystem)
W ("Date:        " + (Get-Date -Format 'yyyy-MM-dd HH:mm'))

H 'Start Menu shortcuts'
$wsh = New-Object -ComObject WScript.Shell
$menus = @((Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'), (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs'))
foreach ($m in $menus) {
  Get-ChildItem -Path $m -Recurse -Filter *.lnk | Where-Object { $_.Name -match "$NAME|rekordbox" } | ForEach-Object {
    $l = $wsh.CreateShortcut($_.FullName)
    W $_.FullName
    W ("    target: " + $l.TargetPath)
    W ("    args:   " + $l.Arguments)
    W ("    start:  " + $l.WorkingDirectory)
  }
}

H 'Installed programs (registry Uninstall keys)'
$unins = @(
  'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*')
foreach ($u in $unins) {
  Get-ItemProperty $u | Where-Object { $_.DisplayName -match "$NAME|rekordbox" } | ForEach-Object {
    W ("[" + $_.PSPath.Replace('Microsoft.PowerShell.Core\Registry::', '') + "]")
    W ("    name:      " + $_.DisplayName)
    W ("    version:   " + $_.DisplayVersion)
    W ("    publisher: " + $_.Publisher)
    W ("    location:  " + $_.InstallLocation)
    W ("    icon:      " + $_.DisplayIcon)
    W ("    uninstall: " + $_.UninstallString)
  }
}

H 'App Paths (registry)'
foreach ($r in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\*', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\*') {
  Get-Item $r | Where-Object { $_.PSChildName -match "$NAME|rekordbox" } | ForEach-Object {
    W ($_.Name + "  ->  " + (Get-ItemProperty $_.PSPath).'(default)')
  }
}

H 'Install folders and executables'
$roots = @(
  (Join-Path $env:LOCALAPPDATA 'Programs'), $env:ProgramFiles, ${env:ProgramFiles(x86)},
  (Join-Path $env:ProgramFiles 'Pioneer'), (Join-Path $env:ProgramFiles 'rekordbox')) | Where-Object { $_ -and (Test-Path $_) }
$installDirs = @()
foreach ($r in $roots) {
  Get-ChildItem -Path $r -Directory | Where-Object { $_.Name -match "$NAME|rekordbox|pioneer" } | ForEach-Object { $installDirs += $_.FullName }
}
foreach ($d in ($installDirs | Sort-Object -Unique)) {
  W; W ("[" + $d + "]")
  Get-ChildItem -Path $d -Recurse -Filter *.exe -Depth 4 | ForEach-Object {
    $v = $_.VersionInfo
    W ("    " + $_.FullName.Substring($d.Length) + "   v" + $v.FileVersion + "   '" + $v.FileDescription + "'   " + [math]::Round($_.Length / 1MB, 1) + " MB")
  }
  if ($d -notmatch 'rekordbox|pioneer') {
    # which UI toolkit the app is built with (decides how a click on Start can be automated)
    $dlls = Get-ChildItem -Path $d -Recurse -Depth 3 -Include *.dll, *.config, *.json -File | Select-Object -ExpandProperty Name | Sort-Object -Unique
    $hint = $dlls | Where-Object { $_ -match '^Qt|PresentationFramework|WindowsBase|System\.Windows\.Forms|Avalonia|wx|libcef|electron|\.deps\.json$|\.exe\.config$|sqlite|taglib|Sentry' }
    W ("    toolkit hints: " + (($hint | Select-Object -First 40) -join ', '))
    W ("    dll count:     " + ($dlls | Where-Object { $_ -like '*.dll' }).Count)
  }
}

H 'Data folders (AppData)'
$dataDirs = @()
foreach ($base in $env:LOCALAPPDATA, $env:APPDATA, $env:ProgramData, (Join-Path $env:USERPROFILE 'Documents'), (Join-Path $env:USERPROFILE 'Music')) {
  Get-ChildItem -Path $base -Directory | Where-Object { $_.Name -match $NAME } | ForEach-Object { $dataDirs += $_.FullName }
}
foreach ($d in ($dataDirs | Sort-Object -Unique)) {
  W; W ("[" + $d + "]")
  $items = Get-ChildItem -Path $d -Recurse -Depth 5 -Force
  W ("    entries: " + $items.Count)
  $items | Where-Object { -not $_.PSIsContainer } | Sort-Object LastWriteTime -Descending | Select-Object -First 80 | ForEach-Object {
    W ("    " + $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm') + "  " + ('{0,12:N0}' -f $_.Length) + "  " + $_.FullName.Substring($d.Length))
  }
}

H 'SQLite databases (Mixed In Key collection) - schema only, no song data'
$enc = [System.Text.Encoding]::GetEncoding(28591)
foreach ($d in ($dataDirs | Sort-Object -Unique)) {
  Get-ChildItem -Path $d -Recurse -Depth 5 -File -Force | Where-Object { $_.Length -gt 100 -and $_.Name -notmatch '-(wal|shm|journal)$' } | ForEach-Object {
    $f = $_
    try {
      $fs = [System.IO.File]::Open($f.FullName, 'Open', 'Read', 'ReadWrite')
      $buf = New-Object byte[] ([Math]::Min(8MB, $f.Length))
      $n = $fs.Read($buf, 0, $buf.Length); $fs.Close()
    } catch { return }
    if ($n -lt 16 -or $enc.GetString($buf, 0, 15) -ne 'SQLite format 3') { return }
    W; W ("[" + $f.FullName + "]  " + [math]::Round($f.Length / 1MB, 1) + " MB, modified " + $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))
    W ("    -wal present: " + (Test-Path ($f.FullName + '-wal')) + "   -shm present: " + (Test-Path ($f.FullName + '-shm')))
    W ("    journal mode byte (2 = WAL): " + $buf[18])
    $text = $enc.GetString($buf, 0, $n)
    $seen = @{}
    foreach ($m in [regex]::Matches($text, 'CREATE (TABLE|INDEX|UNIQUE INDEX) [^\x00]{1,3000}?\)(?=[^\x20-\x7e]|$)')) {
      $s = ($m.Value -replace '\s+', ' ')
      if (-not $seen[$s]) { $seen[$s] = 1; W ("    " + $s) }
    }
    if ($seen.Count -eq 0) { W '    (no table definitions found in the first 8 MB)' }
  }
}

H 'Settings files (small text files in the data and install folders)'
foreach ($d in (($dataDirs + $installDirs) | Where-Object { $_ -notmatch 'rekordbox|pioneer' } | Sort-Object -Unique)) {
  Get-ChildItem -Path $d -Recurse -Depth 5 -File -Force -Include *.config, *.json, *.xml, *.ini, *.settings, *.plist, *.cfg, *.txt |
    Where-Object { $_.Length -lt 40KB -and $_.Name -notmatch 'licen[sc]e|third|notice|readme|\.deps\.json|runtimeconfig' } | Select-Object -First 25 | ForEach-Object {
      W; W ("--- " + $_.FullName + "  (" + $_.Length + " bytes, " + $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm') + ")")
      Get-Content -LiteralPath $_.FullName -TotalCount 250 | ForEach-Object { W ("    " + (Mask $_)) }
    }
}

H 'Registry settings (HKCU\Software)'
Get-ChildItem 'HKCU:\Software' | Where-Object { $_.PSChildName -match $NAME } | ForEach-Object {
  $rootKey = $_
  @($rootKey) + @(Get-ChildItem $rootKey.PSPath -Recurse) | ForEach-Object {
    W ("[" + $_.Name + "]")
    $k = $_
    foreach ($vn in $k.GetValueNames()) {
      $val = $k.GetValue($vn)
      if ($val -is [byte[]]) { $val = "<binary, " + $val.Length + " bytes>" }
      $s = "$val"; if ($s.Length -gt 300) { $s = $s.Substring(0, 300) + '...' }
      W ("    " + (Mask ($vn + " = " + $s)))
    }
  }
}

H 'Platinum Notes logs (newest three: first and last lines)'
foreach ($d in ($dataDirs | Sort-Object -Unique)) {
  Get-ChildItem -Path $d -Recurse -Depth 5 -File -Include *.log, *.txt | Where-Object { $_.FullName -match 'log' } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 3 | ForEach-Object {
      W; W ("--- " + $_.FullName + "  (" + $_.Length + " bytes, " + $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm') + ")")
      $lines = Get-Content -LiteralPath $_.FullName
      $lines | Select-Object -First 40 | ForEach-Object { W ("    " + (Mask $_)) }
      if ($lines.Count -gt 60) { W '    ...'; $lines | Select-Object -Last 20 | ForEach-Object { W ("    " + (Mask $_)) } }
    }
}

H 'rekordbox'
foreach ($d in (Get-ChildItem -Path (Join-Path $env:APPDATA 'Pioneer') -Directory)) {
  W ("[" + $d.FullName + "]")
  Get-ChildItem $d.FullName -File | ForEach-Object { W ("    " + $_.Name + "  " + $_.Length + " bytes") }
  $set = Join-Path $d.FullName 'rekordbox3.settings'
  if (Test-Path $set) {
    Select-String -LiteralPath $set -Pattern 'xml|bridge|Analysis|KeyString|writeKey|AutoExport' | ForEach-Object { W ("    settings: " + $_.Line.Trim()) }
  }
}
foreach ($p in (Join-Path $env:USERPROFILE 'Documents\rekordbox.xml'), (Join-Path $env:USERPROFILE 'Documents\rekordbox\rekordbox.xml'), (Join-Path $env:USERPROFILE 'Music\rekordbox.xml')) {
  if (Test-Path $p) {
    $i = Get-Item $p
    W ("xml found: " + $p + "  " + $i.Length + " bytes, " + $i.LastWriteTime.ToString('yyyy-MM-dd HH:mm'))
    $loc = Select-String -LiteralPath $p -Pattern 'Location="([^"]{1,200})' | Select-Object -First 3
    foreach ($l in $loc) { W ("    sample Location: " + $l.Matches[0].Groups[1].Value) }
    $ton = Select-String -LiteralPath $p -Pattern 'Tonality="([^"]+)"' | Select-Object -First 3
    foreach ($t in $ton) { W ("    sample Tonality: " + $t.Matches[0].Groups[1].Value) }
  }
}

H 'File type handlers (which program opens audio files)'
foreach ($ext in '.wav', '.mp3', '.aiff', '.flac') {
  $prog = (Get-ItemProperty ("HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\" + $ext + "\UserChoice")).ProgId
  W ($ext + "  ->  " + $prog)
  $owl = (Get-Item ("HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\" + $ext + "\OpenWithList"))
  if ($owl) { W ("    open-with list: " + (($owl.GetValueNames() | Where-Object { $_ -ne 'MRUList' } | ForEach-Object { $owl.GetValue($_) }) -join ', ')) }
}

H 'Running right now (not started by this script)'
Get-Process | Where-Object { $_.ProcessName -match "$NAME|rekordbox" } | ForEach-Object {
  W ($_.ProcessName + "  pid " + $_.Id + "  window: '" + $_.MainWindowTitle + "'  path: " + $_.Path)
}

H 'Music and cloud folders (names only)'
foreach ($p in 'Music', 'Desktop', 'Downloads', 'OneDrive', 'Dropbox', 'iCloudDrive', 'Google Drive', 'My Drive') {
  $full = Join-Path $env:USERPROFILE $p
  if (Test-Path $full) { W ("exists: " + $full) }
}
Get-PSDrive -PSProvider FileSystem | ForEach-Object { W ("drive " + $_.Name + ":  " + $_.Description + "  root " + $_.Root) }

[System.IO.File]::WriteAllText($out, $sb.ToString(), (New-Object System.Text.UTF8Encoding($true)))
Write-Host ""
Write-Host "Done. The result is on your Desktop:" -ForegroundColor Green
Write-Host "  $out"
Write-Host "Have a quick look through it, then send it over."
Write-Host ""
Read-Host "Press Enter to close"
