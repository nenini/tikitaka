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
| `PASSWORD_RESET_TOKEN_VALIDITY_SECONDS` | `900` | 비밀번호 재설정 토큰 유효시간(초) |
| `PASSWORD_RESET_URL` | `http://localhost:3000/password-reset` | 이메일에 포함할 프론트엔드 재설정 주소 |
| `MAIL_FROM` | `no-reply@date.local` | 발신 이메일 주소 |
| `MAIL_HOST` | `localhost` | SMTP 서버 주소 |
| `MAIL_PORT` | `1025` | SMTP 서버 포트 |
| `MAIL_USERNAME` | - | SMTP 사용자 이름 |
| `MAIL_PASSWORD` | - | SMTP 비밀번호 |
| `MAIL_SMTP_AUTH` | `false` | SMTP 인증 사용 여부 |
| `MAIL_SMTP_STARTTLS` | `false` | STARTTLS 사용 여부 |

`.env`에는 실제 비밀번호를 입력하고 Git에 추가하지 않습니다. `.env.example`에는 실제 비밀번호를 작성하지 않습니다.

## 프로파일 구성

| 파일 | 역할 |
| --- | --- |
| `application.yml` | 애플리케이션 이름과 기본 활성 프로파일 설정 |
| `application-local.yml` | 로컬 MySQL 및 JPA 설정 |
| `application-test.yml` | 테스트용 H2 및 JPA 설정 |

별도 지정이 없으면 `local` 프로파일이 활성화됩니다. 테스트는 `@ActiveProfiles("test")`를 통해 `test` 프로파일을 사용합니다.

공통 JPA 설정은 `application.yml`에서 관리합니다.

- OSIV 비활성화
- Hibernate SQL 포맷 적용
- 기본 batch fetch 크기 100
- JDBC 시간대 `Asia/Seoul`
- JPA Auditing 활성화

엔티티에서 생성·수정 시각이 필요하면 `BaseEntity`를 상속합니다.

```java
@Entity
public class Example extends BaseEntity {
    // fields
}
```

상속한 테이블에는 `created_at`, `updated_at` 컬럼이 필요합니다. 현재 로컬 설정은 `ddl-auto: validate`이므로 운영할 스키마나 마이그레이션에도 두 컬럼을 직접 반영해야 합니다.

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

### Docker 개발 모드: 코드 저장 시 자동 반영

개발 모드는 Compose Watch로 `src` 변경 파일을 백엔드 컨테이너에 동기화하고 Gradle 캐시는 Docker 볼륨에 보관합니다.
소스 저장을 감지하면 MySQL은 유지한 채 백엔드 컨테이너만 재시작하고 `bootRun`이 변경 코드를 다시 컴파일합니다.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml watch
```

실행 후 Java 또는 설정 파일을 저장하면 변경 사항이 자동 반영됩니다. `build.gradle`이나 `settings.gradle`을 변경하면 개발 이미지를 자동으로 다시 빌드합니다.
종료하려면 `Ctrl+C`를 누른 뒤 다음 명령을 실행합니다.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

MySQL의 `mysql-data` 볼륨은 삭제되지 않습니다. DB까지 초기화해야 할 때만 `down`에 `--volumes`를 추가합니다.

애플리케이션 상태 확인:

```bash
curl http://localhost:8080/actuator/health
```

Swagger UI와 OpenAPI 명세:

- Swagger UI: `http://localhost:8080/swagger-ui.html`
- OpenAPI JSON: `http://localhost:8080/v3/api-docs`

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

로컬 MySQL 스키마는 Flyway가 관리하고 JPA는 `ddl-auto: validate`로 Entity와 실제 테이블의 일치 여부만 검사합니다.

현재 마이그레이션:

```text
src/main/resources/db/migration/
├── V1__create_initial_schema.sql
└── V2__create_password_reset_tokens.sql
```

- 빈 DB에서는 V1과 V2가 순서대로 실행됩니다.
- 기존 ERD 테이블이 있는 DB에서는 첫 실행 시 V1 상태로 baseline을 등록하고 V2부터 실행합니다.
- 적용 결과는 DB의 `flyway_schema_history` 테이블에서 확인할 수 있습니다.

기존 DB를 처음 연결하기 전에는 반드시 백업하고, 현재 스키마가 V1 ERD와 일치하는지 확인해야 합니다. `baseline-on-migrate`는 기존 스키마가 올바르다고 간주할 뿐 V1과 전체 구조를 비교하지 않습니다.

### Flyway 관리 규칙

1. 이미 공유 DB에 적용된 migration 파일은 수정하거나 삭제하지 않습니다.
2. 스키마 변경마다 다음 버전의 새 파일을 추가합니다.
3. 파일명은 `V{버전}__{설명}.sql` 형식을 사용합니다.
4. Entity 변경과 이를 반영하는 migration을 같은 작업에 포함합니다.
5. migration은 로컬 DB와 테스트 DB에서 검증한 뒤 병합합니다.
6. 운영 데이터가 있는 컬럼 변경은 데이터 보존 SQL까지 함께 작성합니다.

예를 들어 사용자 테이블에 닉네임을 추가하면 기존 V1을 수정하지 않고 다음 파일을 만듭니다.

```text
V3__add_nickname_to_users.sql
```

```sql
ALTER TABLE `users`
    ADD COLUMN `nickname` VARCHAR(50) NULL;
```

적용된 migration을 수정하면 Flyway checksum 검증이 실패합니다. 수정이 필요하면 기존 파일 대신 새로운 migration에서 변경 사항을 추가합니다.

### 비밀번호 재설정 API

재설정 이메일 요청은 가입 여부와 관계없이 항상 동일한 `202 Accepted` 응답을 반환합니다.

```http
POST /api/v1/auth/password/reset-request
Content-Type: application/json

{
  "email": "user@example.com"
}
```

이메일 링크에서 받은 일회용 토큰과 새 비밀번호를 전달합니다.

```http
PATCH /api/v1/auth/password/reset
Content-Type: application/json

{
  "token": "one-time-reset-token",
  "newPassword": "newPassword123!"
}
```

비밀번호는 8~64자이며 영문, 숫자, 특수문자를 각각 하나 이상 포함해야 합니다. 재설정 성공 시 해당 사용자의 기존 Refresh Token이 모두 폐기됩니다.

### 회원 탈퇴 API

Access Token과 현재 비밀번호로 본인 여부를 다시 확인한 후 계정을 소프트 삭제합니다.

```http
DELETE /api/v1/auth/account
Authorization: Bearer {accessToken}
Content-Type: application/json

{
  "password": "currentPassword123!"
}
```

탈퇴 시 `accountStatus`를 `WITHDRAWN`으로 변경하고 `withdrawnAt`을 기록합니다. 사용자 레코드와 개인정보를 즉시 물리 삭제하지 않으며, 모든 Refresh Token과 미사용 비밀번호 재설정 토큰을 폐기합니다. 기존 Access Token도 계정 상태 검사로 보호 API에서 즉시 차단됩니다. 후속 개인정보 익명화·삭제 작업은 `UserWithdrawnEvent`를 구독해 연결합니다.

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
- [x] Swagger UI 및 OpenAPI 명세 구성
- [x] 성공·오류 공통 API 응답 구성
- [x] 검증·비즈니스·404·서버 오류 전역 예외 처리 구성
- [x] 공통 JPA 설정 및 Auditing 구성
- [x] 생성·수정 시각 공통 `BaseEntity` 구성
- [x] 이메일 기반 비밀번호 재설정 및 일회용 토큰 구성
- [x] 비밀번호 정책 검증 및 기존 Refresh Token 폐기
- [x] Flyway 초기 스키마 및 버전별 migration 구성
- [x] 비밀번호 재확인 기반 회원 탈퇴 및 인증 세션 무효화
- [x] 개인정보 후속 처리를 위한 탈퇴 이벤트 연결
- [ ] 도메인 엔티티 및 비즈니스 기능 구현
- [ ] 도메인별 API 명세 작성
- [ ] CI 환경의 빌드·테스트 자동화

## 현재 검증 결과

- JDK 21에서 Gradle 컴파일 성공
- `test` 프로파일과 H2를 사용한 `clean test` 성공
- Docker 관련 파일은 작성됐으나 현재 작성 환경에 Docker CLI가 없어 실제 이미지 빌드 및 컨테이너 실행은 아직 검증하지 못함

## Google·Naver OAuth2 로그인

OAuth2 로그인은 인가 코드 방식으로 동작합니다. 시작 API는 제공자의 로그인 화면으로 이동시키고, 콜백 API는 제공자 사용자 정보를 확인한 뒤 서비스 JWT를 반환합니다.

```text
GET /api/v1/auth/oauth2/google
GET /api/v1/auth/oauth2/google/callback
GET /api/v1/auth/oauth2/naver
GET /api/v1/auth/oauth2/naver/callback
```

Google Cloud Console과 Naver Developers에 다음 콜백 주소를 정확히 등록합니다.

```text
http://localhost:8080/api/v1/auth/oauth2/google/callback
http://localhost:8080/api/v1/auth/oauth2/naver/callback
```

`.env`에 각 제공자에서 발급받은 값을 입력합니다.

```env
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
NAVER_OAUTH_CLIENT_ID=
NAVER_OAUTH_CLIENT_SECRET=
FRONTEND_BASE_URL=http://localhost:5173
```

OAuth 성공 후 백엔드는 `OAUTH_SUCCESS_REDIRECT`로 이동시키며 URL fragment에
서비스 Access Token과 Refresh Token을 전달합니다. 프론트엔드는 해당 경로를
라우터에 등록하고 fragment의 토큰을 저장한 뒤 로그인 완료 화면으로 이동해야 합니다.

- Google 동의 항목: `openid`, `email`, `profile`
- Naver 제공 정보: 회원 고유 ID, 이메일, 이름
- OAuth 제공자의 Access Token은 저장하지 않습니다.
- 서비스 Access Token과 Refresh Token만 기존 인증 방식으로 발급합니다.
- 기존 이메일 회원과 동일한 검증 이메일이면 OAuth 계정을 기존 회원에게 연결합니다.
- OAuth 신규 회원은 생년월일이 없을 수 있으므로 이후 프로필 완성 단계에서 입력받아야 합니다.
- CSRF 방지를 위해 OAuth `state`와 HttpOnly, SameSite=Lax 쿠키를 함께 검증합니다.

OAuth 지원을 위한 스키마 변경은 다음 Flyway 파일에서 관리합니다.

```text
V3__prepare_oauth_accounts.sql
```
