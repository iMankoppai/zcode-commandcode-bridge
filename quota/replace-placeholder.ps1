<#
  Replace the <YOUR_HOME> placeholder in the deployed quota.md / SKILL.md with the
  current user's home directory (forward slashes), writing UTF-8 WITHOUT a BOM so
  ZCode's YAML frontmatter still parses (a BOM would land before the leading ---).

  Called by install-quota.cmd; can also be run by hand:

      powershell -NoProfile -ExecutionPolicy Bypass -File replace-placeholder.ps1 -Files <path> [<path> ...]

  Keep this file pure ASCII: Windows PowerShell 5.1 reads BOM-less .ps1 as ANSI,
  so non-ASCII text here would be garbled.
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string[]] $Files
)

$homeDir = $env:USERPROFILE
if (-not $homeDir) { $homeDir = $HOME }
$homeFwd = $homeDir.Replace('\', '/')

if (-not $Files -or $Files.Count -eq 0) {
  $zcode = Join-Path $homeDir '.zcode'
  $Files = @(
    (Join-Path $zcode 'commands\quota.md'),
    (Join-Path $zcode 'skills\commandcode-quota\SKILL.md')
  )
}

foreach ($f in $Files) {
  if (-not (Test-Path -LiteralPath $f)) {
    Write-Warning ("skip (missing): {0}" -f $f)
    continue
  }
  $text = Get-Content -LiteralPath $f -Raw -Encoding UTF8
  if ($text -notmatch '<YOUR_HOME>') {
    Write-Host ("already patched: {0}" -f $f)
    continue
  }
  $patched = $text.Replace('<YOUR_HOME>', $homeFwd)
  [IO.File]::WriteAllText($f, $patched, (New-Object Text.UTF8Encoding $false))
  Write-Host ("patched {0} -> {1}" -f $f, $homeFwd)
}
