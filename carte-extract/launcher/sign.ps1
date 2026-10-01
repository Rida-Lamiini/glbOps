# Authenticode-signs a file with a .pfx code-signing certificate (no Windows SDK needed).
#   $env:CARTE_SIGN_PFX       path to the .pfx
#   $env:CARTE_SIGN_PASSWORD  its password
# Usage: powershell -File launcher\sign.ps1 <file>
param([Parameter(Mandatory = $true)][string]$File)

if (-not $env:CARTE_SIGN_PFX) { Write-Host "CARTE_SIGN_PFX not set: skipping signature of $File"; exit 0 }
$pwd = ConvertTo-SecureString $env:CARTE_SIGN_PASSWORD -AsPlainText -Force
$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($env:CARTE_SIGN_PFX, $pwd)
$result = Set-AuthenticodeSignature -FilePath $File -Certificate $cert -HashAlgorithm SHA256 -TimestampServer "http://timestamp.digicert.com"
Write-Host "$File : $($result.Status) - $($result.StatusMessage)"
if ($result.Status -eq "HashMismatch" -or $result.Status -eq "NotSigned") { exit 1 }
