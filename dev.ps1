$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Stop-StaleShopifyDev {
  $projectPattern = $projectRoot.Replace('\', '\\')
  $staleProcesses = Get-CimInstance Win32_Process |
    Where-Object {
      if (-not $_.CommandLine) {
        return $false
      }

      $commandLine = $_.CommandLine
      $_.ProcessId -ne $PID -and (
        $commandLine -like '*@shopify\cli\bin\run.js*app dev*' -or
        $commandLine -like '*@react-router\dev\bin.js* dev*' -or
        $commandLine -like '*npm*react-router*dev*' -or
        (
          $_.Name -eq 'cloudflared.exe' -and
          $commandLine -like '*localhost*'
        ) -or
        $commandLine -match $projectPattern
      )
    }

  if (-not $staleProcesses) {
    return
  }

  Write-Step "Stopping stale Shopify dev processes"

  foreach ($process in $staleProcesses) {
    Write-Host ("Stopping PID {0} ({1})" -f $process.ProcessId, $process.Name) -ForegroundColor Yellow
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
  }
}

Write-Step "Project root: $projectRoot"
Stop-StaleShopifyDev

Write-Step "Generating Prisma client"
& npm.cmd exec prisma generate

Write-Step "Starting Shopify app dev"
& shopify.cmd app dev
