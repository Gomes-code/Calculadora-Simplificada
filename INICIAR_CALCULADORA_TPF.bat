@echo off
setlocal
title Calculadora de Carbono TPF

cd /d "%~dp0"

echo ==========================================================
echo  Calculadora de Carbono Simplificada - TPF Engenharia
echo  Versao Flask + SQLite local
echo ==========================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Python nao encontrado.
    echo Instale o Python 3.10 ou superior e marque a opcao "Add Python to PATH".
    echo.
    pause
    exit /b 1
)

if not exist ".venv\Scripts\python.exe" (
    echo Criando ambiente virtual local...
    python -m venv .venv
    if errorlevel 1 (
        echo.
        echo [ERRO] Nao foi possivel criar o ambiente virtual.
        pause
        exit /b 1
    )
)

if not exist ".venv\.deps_ok" (
    echo Instalando dependencias da aplicacao...
    ".venv\Scripts\python.exe" -m pip install --upgrade pip
    ".venv\Scripts\python.exe" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo.
        echo [ERRO] Falha ao instalar dependencias.
        echo Verifique sua conexao com a internet e tente novamente.
        pause
        exit /b 1
    )
    echo ok > ".venv\.deps_ok"
)

echo.
echo Abrindo a Calculadora de Carbono TPF no navegador...
echo Endereco local: http://127.0.0.1:5000
echo.
echo Para encerrar a aplicacao, feche esta janela ou pressione CTRL+C.
echo.

set AUTO_OPEN_BROWSER=1
set TPF_CALC_HOST=127.0.0.1
set TPF_CALC_PORT=5000
".venv\Scripts\python.exe" app.py

pause
