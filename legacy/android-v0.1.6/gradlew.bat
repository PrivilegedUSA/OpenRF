@echo off
setlocal
rem OpenRF bootstrap: official Gradle v8.13.0 GitHub tag, SHA-256 verified.
set "APP_HOME=%~dp0"
set "JAR=%APP_HOME%.gradle\openrf-bootstrap\gradle-wrapper-8.13.jar"
if not exist "%APP_HOME%.gradle\openrf-bootstrap" mkdir "%APP_HOME%.gradle\openrf-bootstrap"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $jar='%JAR%'; $sha='81a82aaea5abcc8ff68b3dfcb58b3c3c429378efd98e7433460610fecd7ae45f'; if ((-not (Test-Path -LiteralPath $jar)) -or ((Get-FileHash -LiteralPath $jar -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha)) { $tmp=$jar+'.tmp'; try { Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/gradle/gradle/v8.13.0/gradle/wrapper/gradle-wrapper.jar' -OutFile $tmp -UseBasicParsing; if ((Get-FileHash -LiteralPath $tmp -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sha) { throw 'Gradle wrapper SHA-256 check failed' }; Move-Item -LiteralPath $tmp -Destination $jar -Force } finally { Remove-Item -LiteralPath $tmp -ErrorAction SilentlyContinue } }"
if errorlevel 1 (echo Could not download or verify Gradle wrapper jar. 1>&2 & exit /b 1)
if defined JAVA_HOME (set "JAVA_EXE=%JAVA_HOME%\bin\java.exe") else (set "JAVA_EXE=java.exe")
"%JAVA_EXE%" -Dorg.gradle.appname=gradlew -classpath "%JAR%" org.gradle.wrapper.GradleWrapperMain %*
exit /b %ERRORLEVEL%
