param(
    [int]$Port = 8000,
    [string]$Workbook = "",
    [string]$Database = "data/song_chancellors.db",
    [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
$env:PYTHONIOENCODING = "utf-8"

Set-Location -Path $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($Workbook)) {
    $workbooks = Get-ChildItem -Path . -Filter "*.xlsx" -File
    if ($workbooks.Count -ne 1) {
        throw "Expected exactly one .xlsx workbook in project root, found $($workbooks.Count). Pass -Workbook explicitly."
    }
    $Workbook = $workbooks[0].FullName
}

Write-Host "Installing dependencies in conda environment 'document'..."
conda run -n document python -m pip install -r requirements.txt

$dbExists = Test-Path -LiteralPath $Database
if ($Rebuild -or -not $dbExists) {
    if (-not (Test-Path -LiteralPath $Workbook)) {
        throw "Workbook not found: $Workbook"
    }

    Write-Host "Importing workbook into SQLite database..."
    conda run -n document python scripts/import_excel.py $Workbook --db $Database --rebuild
}
else {
    Write-Host "Using existing database: $Database"
}

Write-Host "Starting server at http://localhost:$Port"
conda run -n document python -m uvicorn song_chancellors.api:create_app --factory --host 127.0.0.1 --port $Port
