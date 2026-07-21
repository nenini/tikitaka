# Backend

Spring Boot 기반 백엔드 애플리케이션입니다.

## 기술 스택

- Java 21
- Spring Boot 4.1.0
- Gradle 9.5.1 Wrapper
- Spring Web MVC
- Spring Data JPA
- MySQL 8.4
- H2(test)
- Docker Compose

## 사전 요구사항

### 로컬 직접 실행

- JDK 21
- MySQL 8.x

Gradle은 프로젝트에 포함된 Wrapper를 사용하므로 별도로 설치할 필요가 없습니다.

### Docker 실행

- Docker Desktop 또는 Docker Engine
- Docker Compose v2

## 환경변수

Docker Compose 실행 전에 예제 파일을 복사해 `.env`를 만듭니다.

```powershell
Copy-Item .env.example .env
```

Linux/macOS에서는 다음 명령을 사용합니다.

```bash
cp .env.example .env
```

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `BACKEND_PORT` | `8080` | 호스트에 공개할 백엔드 포트 |
| `SPRING_PROFILES_ACTIVE` | `local` | 활성화할 Spring 프로파일 |
| `MYSQL_PORT` | `3306` | 호스트에 공개할 MySQL 포트 |
| `MYSQL_DATABASE` | `date` | 생성할 데이터베이스 이름 |
| `MYSQL_USER` | `date` | 애플리케이션 DB 사용자 |
| `MYSQL_PASSWORD` | - | 애플리케이션 DB 비밀번호 |
| `MYSQL_ROOT_PASSWORD` | - | MySQL root 비밀번호 |

`.env`에는 실제 비밀번호를 입력하고 Git에 추가하지 않습니다. `.env.example`에는 실제 비밀번호를 작성하지 않습니다.

## 프로파일 구성

| 파일 | 역할 |
| --- | --- |
| `application.yml` | 애플리케이션 이름과 기본 활성 프로파일 설정 |
| `application-local.yml` | 로컬 MySQL 및 JPA 설정 |
| `application-test.yml` | 테스트용 H2 및 JPA 설정 |

별도 지정이 없으면 `local` 프로파일이 활성화됩니다. 테스트는 `@ActiveProfiles("test")`를 통해 `test` 프로파일을 사용합니다.

## Docker Compose로 전체 실행

백엔드와 MySQL을 함께 빌드하고 실행합니다.

```bash
docker compose up --build
```

백그라운드 실행:

```bash
docker compose up --build -d
```

실행 상태와 로그 확인:

```bash
docker compose ps
docker compose logs -f backend
```

기본 접속 주소는 `http://localhost:8080`입니다. MySQL health check가 통과한 후 백엔드가 시작됩니다.

애플리케이션 상태 확인:

```bash
curl http://localhost:8080/actuator/health
```

컨테이너 종료:

```bash
docker compose down
```

MySQL 데이터를 포함해 초기화하려면 다음 명령을 사용합니다. 이 명령은 Docker 볼륨의 DB 데이터를 삭제합니다.

```bash
docker compose down -v
```

## 로컬에서 직접 실행

먼저 MySQL에 `date` 데이터베이스를 준비합니다. Docker의 MySQL만 사용할 수도 있습니다.

```bash
docker compose up -d mysql
```

PowerShell에서 DB 접속 정보를 설정하고 실행합니다.

```powershell
$env:SPRING_PROFILES_ACTIVE = "local"
$env:DB_URL = "jdbc:mysql://localhost:3306/date?serverTimezone=Asia/Seoul&characterEncoding=UTF-8"
$env:DB_USERNAME = "date"
$env:DB_PASSWORD = "date"
.\gradlew.bat bootRun
```

Linux/macOS에서는 다음과 같이 실행합니다.

```bash
export SPRING_PROFILES_ACTIVE=local
export DB_URL='jdbc:mysql://localhost:3306/date?serverTimezone=Asia/Seoul&characterEncoding=UTF-8'
export DB_USERNAME=date
export DB_PASSWORD=date
./gradlew bootRun
```

`.env`는 Docker Compose가 자동으로 읽지만, `bootRun`으로 직접 실행할 때는 운영체제 환경변수로 별도 설정해야 합니다.

현재 로컬 JPA 설정은 `ddl-auto: validate`입니다. 애플리케이션이 엔티티에 필요한 테이블을 자동 생성하지 않으므로 DB 스키마가 코드와 일치해야 합니다.

## 테스트

테스트는 외부 MySQL이 아닌 인메모리 H2를 사용합니다.

Windows:

```powershell
.\gradlew.bat clean test
```

Linux/macOS:

```bash
./gradlew clean test
```

## 현재 진행 상황

- [x] Spring Boot 및 Gradle 초기 구성
- [x] Java 21 Toolchain 설정
- [x] 공통/local/test 프로파일 분리
- [x] 로컬 MySQL 연결 환경변수화
- [x] H2 기반 독립 테스트 환경 구성
- [x] 기본 애플리케이션 컨텍스트 테스트 통과
- [x] 백엔드 및 MySQL Docker Compose 구성
- [x] Docker 빌드 컨텍스트 제외 설정
- [x] `.env` 및 `.env.example` 구성
- [x] 로컬 생성 파일과 비밀정보 Git 제외 설정
- [x] UTF-8 인코딩과 graceful shutdown 공통 설정
- [x] Actuator health/info 상태 확인 엔드포인트 구성
- [x] EditorConfig 코드 스타일 기본 규칙 구성
- [ ] 도메인 엔티티 및 비즈니스 기능 구현
- [ ] DB 마이그레이션 도구(Flyway 또는 Liquibase) 도입
- [ ] API 문서화 구성
- [ ] CI 환경의 빌드·테스트 자동화

## 현재 검증 결과

- JDK 21에서 Gradle 컴파일 성공
- `test` 프로파일과 H2를 사용한 `clean test` 성공
- Docker 관련 파일은 작성됐으나 현재 작성 환경에 Docker CLI가 없어 실제 이미지 빌드 및 컨테이너 실행은 아직 검증하지 못함
