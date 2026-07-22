@echo off
setlocal
title Worldline Connectivity Test

set "SCRIPT=%~dp0Worldline-Connectivity-Test.ps1"

if not exist "%SCRIPT%" (
  echo Het testbestand Worldline-Connectivity-Test.ps1 ontbreekt.
  echo Pak eerst het volledige ZIP-bestand uit en probeer het opnieuw.
  pause
  exit /b 1
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -File "%SCRIPT%"

if errorlevel 1 (
  echo.
  echo De Worldline Connectivity Test kon niet worden gestart.
  pause
)

endlocal
