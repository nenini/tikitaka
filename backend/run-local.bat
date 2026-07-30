@echo off
rem ── 로컬 백엔드 실행 스크립트 (개인 설정 · 커밋 금지) ──────────────
rem  사용법: backend 폴더의 이 파일을 실행하면 백엔드가 :8080 으로 뜬다.
rem  JAVA_HOME 을 이미 시스템 환경변수로 잡아뒀다면 아래 JAVA_HOME 줄은 지워도 됨.

set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot"
set "DB_USERNAME=date"
set "DB_PASSWORD=date"

rem  ↓ 임시 우회: 현재 date DB 가 다른 브랜치(V14) 스키마라 Flyway/DDL 검증을 끈다.
rem  DB 를 이 브랜치 스키마로 초기화했다면 아래 2줄은 삭제할 것.
set "SPRING_FLYWAY_ENABLED=false"
set "SPRING_JPA_HIBERNATE_DDL_AUTO=none"

cd /d "%~dp0"
call gradlew.bat bootRun
