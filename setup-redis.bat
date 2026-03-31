@echo off
REM Download and setup Redis for Windows

echo Downloading Redis...
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/microsoftarchive/redis/releases/download/win-3.2.100/Redis-x64-3.2.100.msi' -OutFile '%TEMP%\Redis-installer.msi'"

echo Installing Redis...
msiexec /i "%TEMP%\Redis-installer.msi" /qn

echo Redis installation complete!
echo Redis should now be running as a Windows service.
echo You can test it with: redis-cli ping
