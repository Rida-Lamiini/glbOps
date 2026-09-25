# Backs up the glbOps Postgres database and uploaded files (the Docker "glbops_media" volume)
# into .\backups\<timestamp>\, keeping the newest $Keep backups.
#
#   powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
#
# Schedule it daily at 02:00:
#   schtasks /Create /SC DAILY /ST 02:00 /TN "glbOps backup" /TR "powershell -ExecutionPolicy Bypass -File C:\IT-sol\main\glbOps\scripts\backup.ps1"
param([int]$Keep = 14)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $root ("backups\" + (Get-Date -Format "yyyy-MM-dd_HHmm"))
New-Item -ItemType Directory -Force $dest | Out-Null

# -Fc: compressed custom format, restore with pg_restore. The dump runs inside the db container.
docker exec glbops-db-1 sh -c "pg_dump -U glbops -d glbops -Fc -f /tmp/glbops.dump"
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
docker cp glbops-db-1:/tmp/glbops.dump (Join-Path $dest "glbops.dump")
docker exec glbops-db-1 rm /tmp/glbops.dump

# Uploaded plans, photos and attachments.
docker cp glbops-backend-1:/app/media (Join-Path $dest "media")
if ($LASTEXITCODE -ne 0) { throw "media copy failed" }

Get-ChildItem (Join-Path $root "backups") -Directory | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item -Recurse -Force
Write-Host "Backup written to $dest"
