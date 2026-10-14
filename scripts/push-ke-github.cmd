@echo off
REM DCU Active - send the code to GitHub (first time: approve the GitHub sign-in in the browser).
REM Double-click this file in Windows Explorer.
cd /d "%~dp0.."
echo.
echo ============================================================
echo  Kirim kode ke GitHub (riswara76/dcu-active)
echo  Bila muncul jendela "Connect to GitHub", pilih
echo  "Sign in with your browser", login sebagai riswara76,
echo  lalu klik "Authorize".
echo ============================================================
echo.
git push -u origin main
echo.
echo ============================================================
echo  Bila ada tulisan "main -> main", berhasil. Tutup jendela ini.
echo ============================================================
pause
