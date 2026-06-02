$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BatPath = Join-Path $AppDir "INICIAR_CALCULADORA_TPF.bat"
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Calculadora de Carbono TPF.lnk"

if (-not (Test-Path $BatPath)) {
    Write-Host "Arquivo INICIAR_CALCULADORA_TPF.bat nao encontrado na pasta da aplicacao."
    Pause
    exit 1
}

$WScriptShell = New-Object -ComObject WScript.Shell
$Shortcut = $WScriptShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $BatPath
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.WindowStyle = 1
$Shortcut.Description = "Abrir Calculadora de Carbono Simplificada TPF"
$Shortcut.Save()

Write-Host ""
Write-Host "Atalho criado na Area de Trabalho:"
Write-Host $ShortcutPath
Write-Host ""
Pause
