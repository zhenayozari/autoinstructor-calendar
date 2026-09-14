param(
  [Parameter(Mandatory = $true)]
  [string] $DatabaseUrl,

  [string] $InputDir = "migration-output",

  [string] $PostgresBinDir = "",

  [switch] $SkipSchema
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

$psql = Get-PostgresTool "psql"
$pgRestore = Get-PostgresTool "pg_restore"

$publicDump = Join-Path $InputDir "supabase-public.dump"
$authUsers = Join-Path $InputDir "auth-users.csv"
$appUsersSql = Join-Path $InputDir "app-users.sql"
$temporaryPasswords = Join-Path $InputDir "temporary-passwords.csv"
$targetCounts = Join-Path $InputDir "target-counts.txt"

if (!(Test-Path -LiteralPath $publicDump)) {
  throw "Public dump not found: $publicDump"
}

if (!(Test-Path -LiteralPath $authUsers)) {
  throw "Auth users CSV not found: $authUsers"
}

if (!$SkipSchema) {
  $schemaMigrations = Get-ChildItem -LiteralPath "db/migrations" -Filter "*.sql" | Sort-Object Name

  foreach ($migration in $schemaMigrations) {
    Write-Host "Applying schema migration $($migration.Name)..."
    Invoke-Checked -Label "schema migration $($migration.Name)" -Command {
      & $psql $DatabaseUrl --file $migration.FullName
    }
  }
} else {
  Write-Host "Skipping schema creation."
}

Write-Host "Preparing app_users from exported Supabase auth users..."
node "scripts/migration/create-app-users.mjs" `
  --input $authUsers `
  --sql-output $appUsersSql `
  --password-output $temporaryPasswords

Write-Host "Importing app_users..."
Invoke-Checked -Label "app_users import" -Command {
  & $psql $DatabaseUrl --file $appUsersSql
}

Write-Host "Restoring public data with original UUIDs..."
Invoke-Checked -Label "public data restore" -Command {
  & $pgRestore `
    --dbname $DatabaseUrl `
    --data-only `
    --no-owner `
    --no-privileges `
    $publicDump
}

Write-Host "Writing target row counts..."
Invoke-Checked -Label "target count export" -Command {
  & $psql $DatabaseUrl `
    --file "scripts/migration/validate-counts.sql" `
    --output $targetCounts
}

Write-Host "Restore complete."
Write-Host "Temporary staff passwords: $temporaryPasswords"
Write-Host "Target counts: $targetCounts"
