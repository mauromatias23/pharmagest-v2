@echo off
title PharmaGest Angola - Inicializador de Sistema (64-bit)
cls
color 0A

:: 1. Entrar na pasta do projeto
echo [0/4] Localizando diretorio do sistema...
cd /d "%~dp0"

echo ============================================================
echo           PHARMAGEST ANGOLA - GESTAO FARMACEUTICA
echo             Ambiente de Producao Local (Offline)
echo ============================================================
echo.

:: 2. Verificação de Node.js
echo [1/4] Verificando motor Node.js...
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERRO CRITICO] Node.js nao detectado. 
    echo Por favor, instale a versao LTS em https://nodejs.org/
    pause
    exit
)

:: 3. Verificação de Dependências
if not exist "node_modules" (
    echo [2/4] Instalando bibliotecas necessarias pela primeira vez...
    echo Isto pode levar alguns minutos dependendo da sua internet...
    call npm install
    if %errorlevel% neq 0 (
        color 0C
        echo [ERRO] Falha ao instalar dependencias. Verifique sua conexao.
        pause
        exit
    )
) else (
    echo [2/4] Bibliotecas verificadas com sucesso.
)

:: 4. Execução do Servidor
echo [3/4] Preparando servidor Vite...
echo.
echo O sistema estara disponivel em: http://localhost:3000
echo.

:: Tenta abrir o navegador (o Vite tambem pode fazer isso, mas aqui garantimos)
start "" http://localhost:3000

:: Inicia o ambiente de desenvolvimento/execução
echo [4/4] Iniciando PharmaGest...
call npm run dev

:: Tratamento de Erro se o Vite fechar inesperadamente
if %errorlevel% neq 0 (
    color 0E
    echo.
    echo [AVISO] O servidor fechou com um erro. 
    echo Tentando limpar cache e reiniciar...
    rd /s /q "node_modules"
    call npm install
    call npm run dev
)

if %errorlevel% neq 0 (
    color 0C
    echo.
    echo [ERRO] Nao foi possivel iniciar o sistema.
    echo Tente executar: npm install manualmente no terminal.
    pause
)