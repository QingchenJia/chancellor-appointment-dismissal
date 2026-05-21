Write-Host ""
Write-Host "Server will be available at:"
Write-Host "  http://localhost:8000"
Write-Host ""
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

conda run -n document python -m uvicorn song_chancellors.api:create_app --factory --host 127.0.0.1 --port 8000
