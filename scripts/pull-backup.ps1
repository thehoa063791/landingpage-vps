# Weekly off-server copy of the newest daily database backup (deploy/backup-db.sh) into
# <project>\backups\db\ on this computer (git-ignored: the dumps hold customer data).
# Keeps the newest 8 copies. Runs from Windows Task Scheduler ("PTB database backup pull")
# with the ptb-prod SSH key from the Windows ssh-agent. Log: backups\db\pull.log
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dir = Join-Path $root 'backups\db'
$log = Join-Path $dir 'pull.log'
$keep = 8
$ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'
$scp = 'C:\Windows\System32\OpenSSH\scp.exe'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
try {
  $name = (& $ssh -o BatchMode=yes ptb-prod 'ls -1t /opt/event-landingpage-backups/daily/db-*.dump | head -1 | xargs -r basename').Trim()
  if (-not $name) { throw 'No daily backup on the server.' }
  $target = Join-Path $dir $name
  if (Test-Path $target) { Add-Content $log "$(Get-Date -Format s) already have $name"; exit 0 }
  & $scp -o BatchMode=yes "ptb-prod:/opt/event-landingpage-backups/daily/$name" "$target.part"
  if ($LASTEXITCODE -ne 0) { throw "scp failed ($LASTEXITCODE)" }
  Move-Item "$target.part" $target
  Get-ChildItem $dir -Filter 'db-*.dump' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $keep | Remove-Item
  Add-Content $log "$(Get-Date -Format s) OK $name $([math]::Round((Get-Item $target).Length / 1MB, 1)) MB"
} catch {
  Add-Content $log "$(Get-Date -Format s) FAILED $($_.Exception.Message)"
  exit 1
}
