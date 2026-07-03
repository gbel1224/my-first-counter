@echo off
title Palm City Updater
echo.
echo  PALM CITY UPDATER
echo  -----------------
echo.
if not exist "Assets" echo  Oops: put this file INSIDE your Unity project folder (next to the "Assets" folder), then double-click it again. && echo. && pause && exit /b 1
echo  Downloading the latest Palm City code from GitHub...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $ErrorActionPreference='Stop'; $zip=Join-Path $env:TEMP 'palmcity.zip'; $dst=Join-Path $env:TEMP 'palmcity_upd'; Invoke-WebRequest 'https://github.com/gbel1224/my-first-counter/archive/refs/heads/claude/palm-city-mobile-game-9e91yk.zip' -OutFile $zip; if(Test-Path $dst){Remove-Item $dst -Recurse -Force}; Expand-Archive $zip $dst -Force; $repo=(Get-ChildItem $dst -Directory | Select-Object -First 1).FullName; $code=Join-Path $repo 'unity\Assets\PalmCity'; Get-ChildItem $code -Recurse -File | ForEach-Object { $rel=$_.FullName.Substring($code.Length+1); $out=Join-Path 'Assets\PalmCity' $rel; $dir=Split-Path $out; if($dir){ New-Item -ItemType Directory -Force -Path $dir | Out-Null }; if($_.Extension -ne '.meta' -or -not (Test-Path $out)) { Copy-Item $_.FullName $out -Force } }; Write-Host ''; Write-Host '  DONE! Palm City is up to date.' -ForegroundColor Green; Write-Host '  Switch back to Unity - it reloads the new code automatically.' }"
if errorlevel 1 echo  Update failed - check your internet connection and try again.
echo.
pause
