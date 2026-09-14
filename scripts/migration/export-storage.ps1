param(
  [Parameter(Mandatory = $true)]
  [string] $SupabaseUrl,

  [Parameter(Mandatory = $true)]
  [string] $ServiceRoleKey,

  [string[]] $Buckets = @("instructor-photos", "public-site"),

  [string] $OutputDir = "migration-output/storage"
)

$ErrorActionPreference = "Stop"

function Get-StorageObjects {
  param(
    [string] $Bucket,
    [string] $Prefix
  )

  $headers = @{
    apikey = $ServiceRoleKey
    Authorization = "Bearer $ServiceRoleKey"
  }
  $body = @{
    prefix = $Prefix
    limit = 1000
    offset = 0
    sortBy = @{
      column = "name"
      order = "asc"
    }
  } | ConvertTo-Json -Depth 4
  $listUrl = "$SupabaseUrl/storage/v1/object/list/$Bucket"
  $items = Invoke-RestMethod `
    -Method Post `
    -Uri $listUrl `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $body

  foreach ($item in $items) {
    $objectPath = if ($Prefix) { "$Prefix/$($item.name)" } else { $item.name }

    if ($null -eq $item.id) {
      Get-StorageObjects -Bucket $Bucket -Prefix $objectPath
    } else {
      $objectPath
    }
  }
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$headers = @{
  apikey = $ServiceRoleKey
  Authorization = "Bearer $ServiceRoleKey"
}

foreach ($bucket in $Buckets) {
  Write-Host "Exporting storage bucket: $bucket"
  $objects = @(Get-StorageObjects -Bucket $bucket -Prefix "")

  foreach ($objectPath in $objects) {
    $relativePath = Join-Path $bucket $objectPath
    $targetPath = Join-Path $OutputDir $relativePath
    $targetDir = Split-Path -Parent $targetPath

    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null

    $encodedPath = ($objectPath -split "/" | ForEach-Object {
      [System.Uri]::EscapeDataString($_)
    }) -join "/"
    $downloadUrl = "$SupabaseUrl/storage/v1/object/$bucket/$encodedPath"

    Invoke-WebRequest `
      -Uri $downloadUrl `
      -Headers $headers `
      -OutFile $targetPath
  }

  Write-Host "Downloaded $($objects.Count) objects from $bucket."
}

Write-Host "Storage export complete: $OutputDir"

