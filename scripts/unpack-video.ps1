param([Parameter(Mandatory=$true)][string]$Archive,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$videoArchive = [System.IO.Compression.ZipFile]::OpenRead($Archive)
try {
  foreach ($videoEntry in $videoArchive.Entries) {
    if ($videoEntry.Name -in @('ffmpeg.exe','ffprobe.exe','LICENSE')) {
      $videoTarget = Join-Path $Destination $videoEntry.Name
      [System.IO.Compression.ZipFileExtensions]::ExtractToFile($videoEntry,$videoTarget,$true)
    }
  }
} finally { $videoArchive.Dispose() }
