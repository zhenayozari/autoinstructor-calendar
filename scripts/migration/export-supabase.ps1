param(
  [Parameter(Mandatory = $true)]
  [string] $DatabaseUrl,

  [string] $OutputDir = "migration-output",

  [string] $PostgresBinDir = ""
)

$ErrorActionPreference = "Stop"

function Get-PostgresTool {
  param([Parameter(Mandatory = $true)][string] $Name)

  if ($PostgresBinDir) {
    $candidate = Join-Path $PostgresBinDir "$Name.exe"

    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  $command = Get-Command $Name -ErrorAction SilentlyContinue

  if ($command) {
    return $command.Source
  }

  $defaultCandidate = "D:\Programs\PostgreSQL\17\bin\$Name.exe"

  if (Test-Path -LiteralPath $defaultCandidate) {
    return $defaultCandidate
  }

  throw "PostgreSQL tool not found: $Name. Pass -PostgresBinDir or add PostgreSQL bin directory to PATH."
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock] $Command,

    [Parameter(Mandatory = $true)]
    [string] $Label
  )

  & $Command

  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

$pgDump = Get-PostgresTool "pg_dump"
$psql = Get-PostgresTool "psql"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$publicDump = Join-Path $OutputDir "supabase-public.dump"
$authUsers = Join-Path $OutputDir "auth-users.csv"
$counts = Join-Path $OutputDir "source-counts.txt"

Write-Host "Exporting public schema data from Supabase..."
Invoke-Checked -Label "pg_dump public data export" -Command {
  & $pgDump `
    --dbname $DatabaseUrl `
    --format custom `
    --data-only `
    --schema public `
    --file $publicDump
}

Write-Host "Exporting Supabase auth users for local app_users mapping..."
Invoke-Checked -Label "auth users export" -Command {
  & $psql $DatabaseUrl `
    --command "\copy (select id, email, raw_user_meta_data->>'name' as name, raw_user_meta_data->>'phone' as phone, created_at from auth.users order by created_at, id) to '$authUsers' with csv header"
}

Write-Host "Writing source row counts..."
Invoke-Checked -Label "source count export" -Command {
  & $psql $DatabaseUrl `
    --file "scripts/migration/validate-source-counts.sql" `
    --output $counts
}

Write-Host "Export complete."
Write-Host "Public dump: $publicDump"
Write-Host "Auth users: $authUsers"
Write-Host "Counts: $counts"
