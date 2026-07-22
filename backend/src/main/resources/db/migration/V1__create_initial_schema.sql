CREATE TABLE `chatbot_messages` (
	`chatbotMessageId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`chatbotConversationId`	BIGINT	NOT NULL	COMMENT '챗봇이 속한 대화방',
	`senderType`	VARCHAR(20)	NOT NULL	COMMENT '메시지 보낸 주체',
	`messageText`	TEXT	NOT NULL	COMMENT '실제 메시지 본문',
	`isProactive`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '챗봇이 보낸 선톡인지',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '메시지가 생성된 시각'
);

CREATE TABLE `face_tag_examples` (
	`faceTagExampleId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`faceTagId`	BIGINT	NOT NULL	COMMENT 'FK',
	`celebrityName`	VARCHAR(100)	NOT NULL	COMMENT '태그 설명을 위해 보여줄 연예인',
	`displayOrder`	SMALLINT	NOT NULL	DEFAULT 1	COMMENT '예시 연예인 중 화면에 표시하는 순서',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '현재 사용자 화면에 표시할 인물인지'
);

CREATE TABLE `chatbot_conversations` (
	`chatbotConversationId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT '챗봇 사용자',
	`chatbotPersonaId`	BIGINT	NOT NULL	COMMENT '적용된 페르소나',
	`conversationStage`	VARCHAR(20)	NOT NULL	COMMENT '소개팅 전인지 후인지',
	`status`	VARCHAR(20)	NOT NULL	DEFAULT 'ACTIVE'	COMMENT '현재 진행중인지',
	`lastUserMessageAt`	DATETIME	NULL	COMMENT '마지막 메시지 보낸 시각',
	`proactiveMessageSentAt`	DATETIME	NULL	COMMENT '12시간 무응답 선톡 보낸 시각',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '대화방 생성 시각',
	`closedAt`	DATETIME	NULL	COMMENT '종료 시각'
);

CREATE TABLE `contact_exchange_requests` (
	`contactExchangeRequestId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`sessionId`	BIGINT	NOT NULL	COMMENT '세션',
	`requesterUserId`	BIGINT	NOT NULL	COMMENT '연락처 교환 요청한 사용자',
	`targetUserId`	BIGINT	NOT NULL	COMMENT '요청 받을 상대',
	`requesterAgreed`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '요청자가 연락처 교환에 동의 했는지',
	`targetAgreed`	BOOLEAN	NULL	COMMENT '상대방 동의 여부',
	`status`	VARCHAR(20)	NOT NULL	COMMENT '연락처 교환 요청 상태',
	`extensionAgreed`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '5분 연장에 동의 했는지',
	`requestedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '연락처 교환 요청 시각',
	`respondedAt`	DATETIME	NULL	COMMENT '상대방 수락 or 거절 시각',
	`disclosedAt`	DATETIME	NULL	COMMENT '연락처 공개 시각'
);

CREATE TABLE `match_responses` (
	`match_response_id`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`match_pair_id`	BIGINT	NOT NULL	COMMENT 'FK',
	`user_id`	BIGINT	NOT NULL	COMMENT 'FK',
	`response`	VARCHAR(20)	NOT NULL	COMMENT '사용자의 응답 상태(수락 거절)',
	`responded_at`	DATETIME	NULL	COMMENT '수락 또는 거절 시각'
);

CREATE TABLE `user_availability_slots` (
	`availabilitySlotId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT 'FK',
	`dayOfWeek`	TINYINT	NOT NULL	COMMENT '1=월요일 ... 7=일요일',
	`startTime`	TIME	NOT NULL	COMMENT '가능한 시간대 시작시간',
	`endTime`	TIME	NOT NULL	COMMENT '가능한 시간대 종료시간',
	`timezone`	VARCHAR(50)	NOT NULL	DEFAULT 'Asia/Seoul'	COMMENT '사용자의 시간대 Asia/Seoul',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '현재 매칭에 사용하는 시간대인지',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '가능 시간대 등록 시각',
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '가능 시간대 수정 시각'
);

CREATE TABLE `user_traits` (
	`userTraitId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT 'FK',
	`traitId`	BIGINT	NOT NULL	COMMENT 'FK',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성 시각'
);

CREATE TABLE `match_pairs` (
	`matchPairId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`requesterAId`	BIGINT	NOT NULL	COMMENT 'A 사용자 매칭 요청 ID',
	`requesterBId`	BIGINT	NOT NULL	COMMENT 'B 사용자 매칭 요청 ID',
	`userAId`	BIGINT	NOT NULL	COMMENT '매칭된 A 사용자',
	`userBId`	BIGINT	NOT NULL	COMMENT '매칭된 B 사용자',
	`totalScore`	DECIMAL(6, 3)	NULL	COMMENT '최종 매칭 점수',
	`goalScore`	DECIMAL(6, 3)	NULL	COMMENT '두 사용자의 연습 목표 유사도 점수',
	`conversationScore`	DECIMAL(6, 3)	NULL	COMMENT '두 사용자의 대화 성향 보완성 점수',
	`scheduleScore`	DECIMAL(6, 3)	NULL	COMMENT '가능 시간대와 희망 일정의 적합도 점수',
	`preferenceScore`	DECIMAL(6, 3)	NULL	COMMENT '얼굴상, 키 분위기 등 선호 적합도 점수',
	`status`	VARCHAR(20)	NOT NULL	COMMENT '매칭 제안 상태',
	`acceptDeadlineAt`	DATETIME	NULL	COMMENT '매칭 수락 제한 시간',
	`matchedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '매칭 후보 생성 시각'
);

CREATE TABLE `safety_events` (
	`safetyEventId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`sessionId`	BIGINT	NOT NULL	COMMENT '세션',
	`userId`	BIGINT	NOT NULL	COMMENT '문제가 감지된 발화자',
	`category`	VARCHAR(50)	NOT NULL	COMMENT '부적절 표현 종류',
	`severity`	VARCHAR(20)	NOT NULL	COMMENT '표현 심각도',
	`sourceType`	VARCHAR(20)	NOT NULL	COMMENT '룰기반인지, LLM 탐지인지',
	`eventTimeSec`	INT	NOT NULL	COMMENT '세션 시작 후 몇 초에 해당 발언 했는지',
	`contextSummary`	VARCHAR(1000)	NULL	COMMENT '해당 발언 전후 대화 맥락 요약',
	`evidenceExcerpt`	TEXT	NULL	COMMENT '이슈 주변 발화 일부만 저장',
	`alternativeExpression`	VARCHAR(1000)	NULL	COMMENT '부담스러운 표현 대체 문장',
	`temperaturePenalty`	DECIMAL(6, 2)	NOT NULL	DEFAULT 0	COMMENT '적용된 매너 감점 수치(온도에서 감점)',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '이벤트 저장 시각'
);

CREATE TABLE `room_themes` (
	`room_theme_id`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`name`	VARCHAR(100)	NOT NULL	COMMENT '화면 테마 이름',
	`placeType`	VARCHAR(30)	NOT NULL	COMMENT '테마 종류(내부 분류)',
	`backgroundUrl`	VARCHAR(1000)	NULL	COMMENT '베경 이미지 url',
	`ambienceAudioUrl`	VARCHAR(1000)	NULL	COMMENT '환경음 url',
	`startTime`	TIME	NULL	COMMENT '테마 자동 배정 시작 시간',
	`endTime`	TIME	NULL	COMMENT '테마 자동 배정 종료 시간',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '현재 사용할 테마인지'
);

CREATE TABLE `session_goals` (
	`session_goal_id`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`session_id`	BIGINT	NOT NULL	COMMENT '적용 세션',
	`user_id`	BIGINT	NOT NULL	COMMENT '사용자',
	`practice_goal_id`	BIGINT	NULL	COMMENT '선택한 목표',
	`custom_goal`	VARCHAR(255)	NULL	COMMENT '사용자가 직접 입력한 목표'
);

CREATE TABLE `session_reports` (
	`sessionReportId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`sessionId`	BIGINT	NOT NULL	COMMENT '세션',
	`userId`	BIGINT	NOT NULL	COMMENT '리포트를 제공받는 사용자',
	`reportStatus`	VARCHAR(20)	NOT NULL	COMMENT '리포트 생성 상태(제작중, 완성 .. 등)',
	`aiFlowScore`	DECIMAL(5, 2)	NULL	COMMENT 'AI 가 분석한 대화 흐름 점수',
	`aiQuestionScore`	DECIMAL(5, 2)	NULL	COMMENT '질문 횟수 및 후속 질문 분석한 질문 점수',
	`aiListeningScore`	DECIMAL(5, 2)	NULL	COMMENT '끼어들기 및 반응 기반 경청 점수',
	`aiReactionScore`	DECIMAL(5, 2)	NULL	COMMENT '리액션 점수',
	`aiMannerScore`	DECIMAL(5, 2)	NULL	COMMENT '표현, 대화 태도 기반 매너 점수',
	`aiNonverbalScore`	DECIMAL(5, 2)	NULL	COMMENT '비언어 행동 점수',
	`peerAverageScore`	DECIMAL(5, 2)	NULL	COMMENT '상대방이 평가한 점수',
	`strengthsJson`	JSON	NULL	COMMENT '잘한 점 목록',
	`improvementsJson`	JSON	NULL	COMMENT '개선점 목록',
	`nextMissionsJson`	JSON	NULL	COMMENT '다음 세션 실천 미션',
	`topicSummaryJson`	JSON	NULL	COMMENT '주제별 체류시간·빈도',
	`summaryText`	TEXT	NULL	COMMENT '전체 세션에 대한 AI 종합 요약 문장',
	`generatedAt`	DATETIME	NULL	COMMENT '리포트 생성 완료 시각',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE `user_badges` (
	`userBadgeId`	BIGINT	NOT NULL AUTO_INCREMENT,
	`userId`	BIGINT	NOT NULL	COMMENT '사용자 PK',
	`badgeId`	BIGINT	NOT NULL	COMMENT '뱃지 획득 사용자',
	`awardedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '뱃지 획득 시각',
	`isDisplayed`	Boolean	NOT NULL	DEFAULT 0	COMMENT '뱃지 노출할지'
);

CREATE TABLE `notifications` (
	`notificationId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT '알림 받을 사용자',
	`notificationType`	VARCHAR(50)	NOT NULL	COMMENT '세부 알림 종류',
	`title`	VARCHAR(200)	NOT NULL	COMMENT '알림 제목',
	`content`	VARCHAR(1000)	NOT NULL	COMMENT '알림 본문',
	`relatedType`	VARCHAR(30)	NULL	COMMENT '알림과 관련된 도메인 종류',
	`relatedId`	BIGINT	NULL	COMMENT '관련 매칭, 세션, 리포트 ID',
	`isRead`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '알림 읽었는지',
	`sentAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '알림 발송 시각',
	`readAt`	DATETIME	NULL	COMMENT '알림을 읽은 시각'
);

CREATE TABLE `peer_evaluations` (
	`peerEvaluationId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`sessionId`	BIGINT	NOT NULL	COMMENT '세션',
	`evaluatorUserId`	BIGINT	NOT NULL	COMMENT '평가 작성자',
	`evaluateeUserId`	BIGINT	NOT NULL	COMMENT '평가 대상',
	`comfortScore`	TINYINT	NOT NULL	COMMENT '편안함 점수',
	`questionConnectionScore`	TINYINT	NOT NULL	COMMENT '질문 자연스러움 점수',
	`listeningScore`	TINYINT	NOT NULL	COMMENT '경청 점수',
	`reactionScore`	TINYINT	NOT NULL	COMMENT '리액션 점수',
	`balanceScore`	TINYINT	NOT NULL	COMMENT '발화 점수',
	`mannerScore`	TINYINT	NOT NULL	COMMENT '대화 매너 점수',
	`goodBehaviorText`	VARCHAR(1000)	NULL	COMMENT '좋았던 점',
	`improvementText`	VARCHAR(1000)	NULL	COMMENT '개선 점',
	`submittedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '평가 제출 시각'
);

CREATE TABLE `refresh_tokens` (
	`refreshTokenId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'Refresh Token PK',
	`userId`	BIGINT	NOT NULL	COMMENT '사용자 PK',
	`tokenHash`	VARCHAR(255)	NOT NULL	COMMENT 'Refresh Token 해시값',
	`expiresAt`	DATETIME	NOT NULL	COMMENT '토큰 만료 시각',
	`revokedAt`	DATETIME	NULL	COMMENT '토큰 폐기 시각',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '토큰 발급 시각',
	`lastUsedAt`	DATETIME	NULL	COMMENT '마지막 사용 시각'
);

CREATE TABLE `user_consents` (
	`userConsentId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT 'FK',
	`consentTypeId`	BIGINT	NOT NULL	COMMENT 'FK',
	`consented`	BOOLEAN	NOT NULL	COMMENT '동의 여부',
	`consentedAt`	DATETIME	NULL	COMMENT '동의 시각',
	`withdrawnAt`	DATETIME	NULL	COMMENT '철회 시각',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '최초 생성 시각',
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '마지막 수정 시각'
);

CREATE TABLE `oauth_accounts` (
	`oauthAccountId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'OAuth 사용자 PK',
	`userId`	BIGINT	NOT NULL	COMMENT 'USER FK',
	`provider`	VARCHAR(20)	NOT NULL	COMMENT 'GOOGLE,NAVER',
	`providerUserId`	VARCHAR(255)	NOT NULL	COMMENT 'OAuth 사용자 ID',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성일시'
);

CREATE TABLE `reports` (
	`reportId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`sessionId`	BIGINT	NULL	COMMENT '세션 중 신고 -> 세션 ID',
	`reporterUserId`	BIGINT	NOT NULL	COMMENT '신고를 제출한 사용자',
	`reportedUserId`	BIGINT	NOT NULL	COMMENT '신고당한 사용자',
	`reportType`	VARCHAR(50)	NOT NULL	COMMENT '신고 유형',
	`description`	VARCHAR(2000)	NULL	COMMENT '신고자가 작성한 상세 설명',
	`status`	VARCHAR(20)	NOT NULL	DEFAULT 'RECEIVED'	COMMENT '관리자의 신고 처리 상태',
	`reportedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '신고 접수 시각',
	`resolvedAt`	DATETIME	NULL	COMMENT '신고 처리 완료 시각'
);

CREATE TABLE `users` (
	`userId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT '사용자 PK',
	`email`	VARCHAR(255)	NOT NULL UNIQUE	COMMENT '로그인 이메일',
	`passwordHash`	VARCHAR(255)	NULL	COMMENT '소셜 로그인 사용자는 NULL 가능',
	`realName`	VARCHAR(50)	NOT NULL	COMMENT '운영 목적으로만 사용하는 실명',
	`phoneNumber`	VARCHAR(30)	NULL	COMMENT '운영 전용으로만 사용하는 전화번호',
	`birthDate`	DATE	NOT NULL	COMMENT '성인 여부 확인용 생년월일',
	`accountStatus`	VARCHAR(20)	NOT NULL	DEFAULT 'ACTIVE'	COMMENT '정상, 정지, 탈퇴 상태',
	`role`	VARCHAR(20)	NOT NULL	DEFAULT 'USER'	COMMENT 'USER,ADMIN',
	`adultVerifiedAt`	DATETIME	NULL	COMMENT '성인 확인',
	`lastLoginAt`	DATETIME	NULL	COMMENT '최근로그인',
	`withdrawnAt`	DATETIME	NULL	COMMENT '회원 탈퇴 시각',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '최초 생성 시각',
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '마지막 수정 시각'
);

CREATE TABLE `user_love_temperatures` (
	`userId`	BIGINT	NOT NULL	COMMENT 'PK, FK',
	`currentTemperature`	INT	NOT NULL	DEFAULT 0	COMMENT '현재 사랑 온도',
	`completedSessionCount`	INT	NOT NULL	DEFAULT 0	COMMENT '완료한 소개팅 수',
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '마지막 변경 시각'
);

CREATE TABLE `session_participants` (
	`session_participant_id`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`session_id`	BIGINT	NOT NULL	COMMENT '창가 세션',
	`user_id`	BIGINT	NOT NULL	COMMENT '참가 사용자',
	`participant_role`	VARCHAR(10)	NOT NULL	COMMENT 'A or B',
	`participation_status`	VARCHAR(20)	NOT NULL	COMMENT '세션 참가 상태',
	`joined_at`	DATETIME	NULL	COMMENT '세션 입장 시각',
	`left_at`	DATETIME	NULL	COMMENT '세션 퇴장 시각',
	`expression_analysis_enabled`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '표정, 시선 분석 허용 여부',
	`voice_analysis_enabled`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '음성, 대화 분석 허용 여부'
);

CREATE TABLE `sessions` (
	`sessionId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`matchPairId`	BIGINT	NULL	COMMENT '실사용자 세션인 경우',
	`roomThemeId`	BIGINT	NULL	COMMENT '대기방 테마',
	`sessionType`	VARCHAR(20)	NOT NULL	COMMENT '세션 종류 (일단 실제 사용자 세션만)',
	`status`	VARCHAR(30)	NOT NULL	COMMENT '세션의 현재 진행 상태',
	`scheduledStartAt`	DATETIME	NOT NULL	COMMENT '세션 예정 시작 시각',
	`actualStartAt`	DATETIME	NULL	COMMENT '양측이 입장하고 실제 세션 시작 시각',
	`actualEndAt`	DATETIME	NULL	COMMENT '실제 세션 종료 시각',
	`plannedDurationSec`	INT	NOT NULL	DEFAULT 1800	COMMENT '기본 세션 예정시간 (30분)',
	`extensionDurationSec`	INT	NOT NULL	DEFAULT 0	COMMENT '양측 동의 후 5분 연장',
	`terminationReason`	VARCHAR(500)	NULL	COMMENT '세션 취소 및 조기 종료 사유',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '세션 생성 시각',
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '세션 변경 시각'
);

CREATE TABLE `consent_types` (
	`consentTypeId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`code`	VARCHAR(50)	NOT NULL	COMMENT '동의 약관 항목 코드',
	`name`	VARCHAR(100)	NOT NULL	COMMENT '동의 약관 항목 이름',
	`version`	VARCHAR(20)	NOT NULL	COMMENT '약관 버전',
	`isRequired`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '필수 동의',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '사용 중',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '동의 약관 항목 등록 시간'
);

CREATE TABLE `face_tag_catalog` (
	`face_tag_id`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`code`	VARCHAR(50)	NOT NULL	COMMENT '얼굴 상 태그 코드',
	`name`	VARCHAR(50)	NOT NULL	COMMENT '사용자에게 표시할 태그 이름',
	`description`	VARCHAR(500)	NULL	COMMENT '얼굴상 분위기 설명 문장',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '현재 매칭 및 분석에서 사용하는 태그인지',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '등록된 시각'
);

CREATE TABLE `chatbot_personas` (
	`chatbotPersonaId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`name`	VARCHAR(100)	NOT NULL	COMMENT '페르소나 이름',
	`speechStyle`	VARCHAR(100)	NOT NULL	COMMENT '말투 (다정, 편안)',
	`difficulty`	VARCHAR(20)	NOT NULL	COMMENT '대화 난이도',
	`personality`	VARCHAR(30)	NOT NULL	COMMENT '챗봇의 기본 성격',
	`reactionLevel`	VARCHAR(20)	NOT NULL	COMMENT '사용자에게 얼마나 호의적으로 반응할지',
	`systemPrompt`	TEXT	NOT NULL	COMMENT 'LLM에 전달할 지시문',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성된 시각'
);

CREATE TABLE `session_metric_summaries` (
	`sessionMetricSummaryId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`sessionId`	BIGINT	NOT NULL	COMMENT '세션',
	`userId`	BIGINT	NOT NULL	COMMENT '사용자',
	`speakingRatio`	DECIMAL(5, 2)	NULL	COMMENT '본인 발화 비율(%)',
	`questionCount`	INT	NOT NULL	DEFAULT 0	COMMENT '사용자의 질문 총횟수',
	`followupQuestionCount`	INT	NOT NULL	DEFAULT 0	COMMENT '상대 답변에 이어한 추가 질문 횟수',
	`interruptionCount`	INT	NOT NULL	DEFAULT 0	COMMENT '상대의 말에 끼어든 횟수',
	`overlapCount`	INT	NOT NULL	DEFAULT 0	COMMENT '두 사용자가 동시에 발화한 구간 횟수',
	`averageUtteranceSec`	DECIMAL(8, 2)	NULL	COMMENT '한번 이야기 할때 평균 발화 길이',
	`silenceTotalSec`	INT	NOT NULL	DEFAULT 0	COMMENT '대화 중 발생한 평균 발화 길이',
	`fillerWordCount`	INT	NOT NULL	DEFAULT 0	COMMENT '어, 음, 그러니까 같은 필러워드 사용횟수',
	`speakingSpeedWpm`	DECIMAL(8, 2)	NULL	COMMENT '분당 단어수 (말하기 속도)',
	`gazeRatio`	DECIMAL(5, 2)	NULL	COMMENT '상대방을 바라본 비율',
	`smileRatio`	DECIMAL(5, 2)	NULL	COMMENT '미소 감지 비율',
	`nodCount`	INT	NOT NULL	DEFAULT 0	COMMENT '고개 끄덕인 횟수(리액션)',
	`faceAbsenceSec`	INT	NOT NULL	DEFAULT 0	COMMENT '얼굴이 화면에서 이탈한 총시간',
	`negativeExpressionCount`	INT	NOT NULL	DEFAULT 0	COMMENT '부정적, 단정적 표현 감지 횟수',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '분석 집계 결과 생성된 시각'
);

CREATE TABLE `badge_catalog` (
	`badgeId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`code`	VARCHAR(50)	NOT NULL	COMMENT '뱃지 이름 코드',
	`name`	VARCHAR(100)	NOT NULL	COMMENT '표시되는 뱃지 이름',
	`description`	VARCHAR(500)	NULL	COMMENT '획득 조건',
	`conditionType`	VARCHAR(500)	NULL	COMMENT '뱃지 지급 기준 데이터',
	`thresholdCount`	INT	NULL	COMMENT '획득에 필요한 횟수',
	`iconUrl`	VARCHAR(100)	NULL	COMMENT '이미지 url',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '획득 가능한 뱃지인지',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '등록시각',
	`updatedAt`	DATETIME	NULL	COMMENT '마지막 수정 시각',
	`displayOrder`	INT	NULL	COMMENT '뱃지 목록 순서'
);

CREATE TABLE `trait_catalog` (
	`traitId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`traitType`	VARCHAR(30)	NOT NULL	COMMENT '자기 이미지인지 상대 이미지 인지',
	`code`	VARCHAR(50)	NOT NULL	COMMENT '조용한, 차분한, 발랄한 등등',
	`name`	VARCHAR(50)	NOT NULL	COMMENT '사용자 화면에 표시되는 성향 이름',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '현재 설문에서 사용되는 항목인지'
);

CREATE TABLE `practice_goal_catalog` (
	`practiceGoalId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`code`	VARCHAR(50)	NOT NULL	COMMENT '목표 코드',
	`name`	VARCHAR(100)	NOT NULL	COMMENT '목표 이름',
	`description`	VARCHAR(500)	NULL	COMMENT '목표에 대한 상세 설명',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '선택가능한 목표인지'
);

CREATE TABLE `match_requests` (
	`matchRequestId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT 'FK',
	`status`	VARCHAR(20)	NOT NULL	COMMENT '매칭 요청 상태 : WAITING,MATCHED,CANCELLED,EXPIRED',
	`preferredStartAt`	DATETIME	NULL	COMMENT '사용자 희망 세션 시작 범위의 시작 시각',
	`preferredEndAt`	DATETIME	NULL	COMMENT '사용자 희망 세션 시작 범위의 종료 시',
	`requestedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '매칭 요청 시각',
	`cancelledAt`	DATETIME	NULL	COMMENT '매칭 요청 취소 시각'
);

CREATE TABLE `coaching_events` (
	`coachingEventId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`sessionId`	BIGINT	NOT NULL	COMMENT '코칭 발생한 세션',
	`targetUserId`	BIGINT	NOT NULL	COMMENT '코칭 메시지 받은 사용자',
	`eventType`	VARCHAR(40)	NOT NULL	COMMENT '어떤 행동때문에 생겼는지',
	`severity`	VARCHAR(20)	NOT NULL	DEFAULT 'INFO'	COMMENT '메시지 중요도, 심각도',
	`eventTimeSec`	INT	NOT NULL	COMMENT '세션 시작 기준 초',
	`message`	VARCHAR(500)	NOT NULL	COMMENT '실제 코칭 문구',
	`displayedAt`	DATETIME	NULL	COMMENT '메시지가 화면에 표시된 시각',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '코칭 이벤트가 서버에 생성된 시각',
	`feedbackType`	Boolean	NULL	COMMENT '코칭이 긍정인지 부정인지'
);

CREATE TABLE `contact_profiles` (
	`userId`	BIGINT	NOT NULL	COMMENT 'PK, FK',
	`instagraId`	VARCHAR(100)	NULL	COMMENT '인스타 ID',
	`kakaoId`	VARCHAR(100)	NULL	COMMENT '카카오 ID',
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '마지막 수정 시각'
);

CREATE TABLE `attendance_penalties` (
	`attendancePenaltyId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT '패널티 받은 사용자',
	`sessionId`	BIGINT	NULL	COMMENT '패널티 발생한 세션',
	`penaltyType`	VARCHAR(20)	NOT NULL	COMMENT '취소 OR 노쇼 종류',
	`temperatureDelta`	INT	NOT NULL	DEFAULT 0	COMMENT '온도 감소량',
	`noShowCountDelta`	INT	NOT NULL	DEFAULT 0	COMMENT '노쇼 누적 횟수에 더할 값',
	`expiresAt`	DATETIME	NULL	COMMENT '6개월 후 소멸 정책',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '패널티 생성 시각'
);

CREATE TABLE `user_profiles` (
	`userId`	BIGINT	NOT NULL	COMMENT '사용자 PK, FK',
	`nickname`	VARCHAR(30)	NOT NULL	COMMENT '닉네임',
	`gender`	VARCHAR(20)	NULL	COMMENT '성별, 서비스 정책에 따라 선택',
	`heightCm`	SMALLINT	NULL	COMMENT '키',
	`regionCity`	VARCHAR(50)	NULL	COMMENT '시, 도 단위 거주지',
	`regionDistrict`	VARCHAR(50)	NULL	COMMENT '구, 군 단위 거주지',
	`minPreferredAge`	SMALLINT	NULL	COMMENT '상대 최소 나이',
	`maxPreferredAge`	SMALLINT	NULL	COMMENT '상대 최대 나이',
	`conversationType`	VARCHAR(20)	NULL	COMMENT '대화 성향 결과',
	`faceTagsVisible`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '얼굴상 공개 여부',
	`onboardingCompleted`	BOOLEAN	NOT NULL	DEFAULT FALSE	COMMENT '프로필 설문 및 온보딩 완료 여부',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '생성 일자',
	`updatedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정 일자'
);

CREATE TABLE `user_practice_goals` (
	`userPracticeGoalId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT 'FK',
	`practiceGoalId`	BIGINT	NULL	COMMENT '목표 사전에서 선택한 목표',
	`customGoal`	VARCHAR(255)	NULL	COMMENT '직접 입력한 목표',
	`isActive`	BOOLEAN	NOT NULL	DEFAULT TRUE	COMMENT '사용중인 목표인지?',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '목표 등록 시간'
);

CREATE TABLE `user_face_tags` (
	`userFaceTagId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT 'FK',
	`faceTagId`	BIGINT	NOT NULL	COMMENT 'FK',
	`confidenceScore`	DECIMAL(5, 4)	NULL	COMMENT '모델이 해당 태그로 판단한 신뢰도',
	`rankOrder`	SMALLINT	NOT NULL	COMMENT '최대 2개 태그 순위(신뢰도 높은 순위)',
	`analyzedAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '분석 수행 시각'
);

CREATE TABLE `user_blocks` (
	`userBlockId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`blockerUserId`	BIGINT	NOT NULL	COMMENT '차단한 사용자',
	`blockedUserId`	BIGINT	NOT NULL	COMMENT '차단 당한 사용자',
	`reason`	VARCHAR(500)	NULL	COMMENT '차단한 이유',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '차단한 시각'
);

CREATE TABLE `love_temperature_histories` (
	`loveTemperatureHistoryId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT 'FK',
	`sessionId`	BIGINT	NULL	COMMENT 'FK, 세션 결과로 변경된 경우',
	`changeType`	VARCHAR(30)	NOT NULL	COMMENT '변경 원인',
	`temperatureDelta`	INT	NOT NULL	DEFAULT 0	COMMENT '온도 증감량',
	`temperatureBefore`	INT	NOT NULL	COMMENT '변경 전 온도',
	`temperatureAfter`	INT	NOT NULL	COMMENT '변경 후 온도',
	`reason`	VARCHAR(500)	NULL	COMMENT '변경 구체적 이유',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '변경이 발생한 시각'
);

CREATE TABLE `sanctions` (
	`sanctionId`	BIGINT	NOT NULL AUTO_INCREMENT	COMMENT 'PK',
	`userId`	BIGINT	NOT NULL	COMMENT '제재 받은 사용자',
	`reportId`	BIGINT	NULL	COMMENT '제재의 원인이 된 신고',
	`sanctionType`	VARCHAR(30)	NOT NULL	COMMENT '제재 종류',
	`reason`	VARCHAR(1000)	NOT NULL	COMMENT '제재를 적용한 이유',
	`startsAt`	DATETIME	NOT NULL	COMMENT '제재 시작 시각',
	`endsAt`	DATETIME	NULL	COMMENT '제재 종료 시각',
	`createdBy`	BIGINT	NULL	COMMENT '관리자 user_id',
	`createdAt`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '제재 기록 생성 시각'
);

ALTER TABLE `chatbot_messages` ADD CONSTRAINT `PK_CHATBOT_MESSAGES` PRIMARY KEY (
	`chatbotMessageId`
);

ALTER TABLE `face_tag_examples` ADD CONSTRAINT `PK_FACE_TAG_EXAMPLES` PRIMARY KEY (
	`faceTagExampleId`
);

ALTER TABLE `chatbot_conversations` ADD CONSTRAINT `PK_CHATBOT_CONVERSATIONS` PRIMARY KEY (
	`chatbotConversationId`
);

ALTER TABLE `contact_exchange_requests` ADD CONSTRAINT `PK_CONTACT_EXCHANGE_REQUESTS` PRIMARY KEY (
	`contactExchangeRequestId`
);

ALTER TABLE `match_responses` ADD CONSTRAINT `PK_MATCH_RESPONSES` PRIMARY KEY (
	`match_response_id`
);

ALTER TABLE `user_availability_slots` ADD CONSTRAINT `PK_USER_AVAILABILITY_SLOTS` PRIMARY KEY (
	`availabilitySlotId`
);

ALTER TABLE `user_traits` ADD CONSTRAINT `PK_USER_TRAITS` PRIMARY KEY (
	`userTraitId`
);

ALTER TABLE `match_pairs` ADD CONSTRAINT `PK_MATCH_PAIRS` PRIMARY KEY (
	`matchPairId`
);

ALTER TABLE `safety_events` ADD CONSTRAINT `PK_SAFETY_EVENTS` PRIMARY KEY (
	`safetyEventId`
);

ALTER TABLE `room_themes` ADD CONSTRAINT `PK_ROOM_THEMES` PRIMARY KEY (
	`room_theme_id`
);

ALTER TABLE `session_goals` ADD CONSTRAINT `PK_SESSION_GOALS` PRIMARY KEY (
	`session_goal_id`
);

ALTER TABLE `session_reports` ADD CONSTRAINT `PK_SESSION_REPORTS` PRIMARY KEY (
	`sessionReportId`
);

ALTER TABLE `user_badges` ADD CONSTRAINT `PK_USER_BADGES` PRIMARY KEY (
	`userBadgeId`
);

ALTER TABLE `notifications` ADD CONSTRAINT `PK_NOTIFICATIONS` PRIMARY KEY (
	`notificationId`
);

ALTER TABLE `peer_evaluations` ADD CONSTRAINT `PK_PEER_EVALUATIONS` PRIMARY KEY (
	`peerEvaluationId`
);

ALTER TABLE `refresh_tokens` ADD CONSTRAINT `PK_REFRESH_TOKENS` PRIMARY KEY (
	`refreshTokenId`
);

ALTER TABLE `user_consents` ADD CONSTRAINT `PK_USER_CONSENTS` PRIMARY KEY (
	`userConsentId`
);

ALTER TABLE `oauth_accounts` ADD CONSTRAINT `PK_OAUTH_ACCOUNTS` PRIMARY KEY (
	`oauthAccountId`
);

ALTER TABLE `reports` ADD CONSTRAINT `PK_REPORTS` PRIMARY KEY (
	`reportId`
);

ALTER TABLE `users` ADD CONSTRAINT `PK_USERS` PRIMARY KEY (
	`userId`
);

ALTER TABLE `user_love_temperatures` ADD CONSTRAINT `PK_USER_LOVE_TEMPERATURES` PRIMARY KEY (
	`userId`
);

ALTER TABLE `session_participants` ADD CONSTRAINT `PK_SESSION_PARTICIPANTS` PRIMARY KEY (
	`session_participant_id`
);

ALTER TABLE `sessions` ADD CONSTRAINT `PK_SESSIONS` PRIMARY KEY (
	`sessionId`
);

ALTER TABLE `consent_types` ADD CONSTRAINT `PK_CONSENT_TYPES` PRIMARY KEY (
	`consentTypeId`
);

ALTER TABLE `face_tag_catalog` ADD CONSTRAINT `PK_FACE_TAG_CATALOG` PRIMARY KEY (
	`face_tag_id`
);

ALTER TABLE `chatbot_personas` ADD CONSTRAINT `PK_CHATBOT_PERSONAS` PRIMARY KEY (
	`chatbotPersonaId`
);

ALTER TABLE `session_metric_summaries` ADD CONSTRAINT `PK_SESSION_METRIC_SUMMARIES` PRIMARY KEY (
	`sessionMetricSummaryId`
);

ALTER TABLE `badge_catalog` ADD CONSTRAINT `PK_BADGE_CATALOG` PRIMARY KEY (
	`badgeId`
);

ALTER TABLE `trait_catalog` ADD CONSTRAINT `PK_TRAIT_CATALOG` PRIMARY KEY (
	`traitId`
);

ALTER TABLE `practice_goal_catalog` ADD CONSTRAINT `PK_PRACTICE_GOAL_CATALOG` PRIMARY KEY (
	`practiceGoalId`
);

ALTER TABLE `match_requests` ADD CONSTRAINT `PK_MATCH_REQUESTS` PRIMARY KEY (
	`matchRequestId`
);

ALTER TABLE `coaching_events` ADD CONSTRAINT `PK_COACHING_EVENTS` PRIMARY KEY (
	`coachingEventId`
);

ALTER TABLE `contact_profiles` ADD CONSTRAINT `PK_CONTACT_PROFILES` PRIMARY KEY (
	`userId`
);

ALTER TABLE `attendance_penalties` ADD CONSTRAINT `PK_ATTENDANCE_PENALTIES` PRIMARY KEY (
	`attendancePenaltyId`
);

ALTER TABLE `user_profiles` ADD CONSTRAINT `PK_USER_PROFILES` PRIMARY KEY (
	`userId`
);

ALTER TABLE `user_practice_goals` ADD CONSTRAINT `PK_USER_PRACTICE_GOALS` PRIMARY KEY (
	`userPracticeGoalId`
);

ALTER TABLE `user_face_tags` ADD CONSTRAINT `PK_USER_FACE_TAGS` PRIMARY KEY (
	`userFaceTagId`
);

ALTER TABLE `user_blocks` ADD CONSTRAINT `PK_USER_BLOCKS` PRIMARY KEY (
	`userBlockId`
);

ALTER TABLE `love_temperature_histories` ADD CONSTRAINT `PK_LOVE_TEMPERATURE_HISTORIES` PRIMARY KEY (
	`loveTemperatureHistoryId`
);

ALTER TABLE `sanctions` ADD CONSTRAINT `PK_SANCTIONS` PRIMARY KEY (
	`sanctionId`
);

ALTER TABLE `chatbot_messages` ADD CONSTRAINT `FK_chatbot_conversations_TO_chatbot_messages_1` FOREIGN KEY (
	`chatbotConversationId`
)
REFERENCES `chatbot_conversations` (
	`chatbotConversationId`
);

ALTER TABLE `face_tag_examples` ADD CONSTRAINT `FK_face_tag_catalog_TO_face_tag_examples_1` FOREIGN KEY (
	`faceTagId`
)
REFERENCES `face_tag_catalog` (
	`face_tag_id`
);

ALTER TABLE `chatbot_conversations` ADD CONSTRAINT `FK_users_TO_chatbot_conversations_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `chatbot_conversations` ADD CONSTRAINT `FK_chatbot_personas_TO_chatbot_conversations_1` FOREIGN KEY (
	`chatbotPersonaId`
)
REFERENCES `chatbot_personas` (
	`chatbotPersonaId`
);

ALTER TABLE `contact_exchange_requests` ADD CONSTRAINT `FK_sessions_TO_contact_exchange_requests_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `contact_exchange_requests` ADD CONSTRAINT `FK_users_TO_contact_exchange_requests_1` FOREIGN KEY (
	`requesterUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `contact_exchange_requests` ADD CONSTRAINT `FK_users_TO_contact_exchange_requests_2` FOREIGN KEY (
	`targetUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `match_responses` ADD CONSTRAINT `FK_match_pairs_TO_match_responses_1` FOREIGN KEY (
	`match_pair_id`
)
REFERENCES `match_pairs` (
	`matchPairId`
);

ALTER TABLE `match_responses` ADD CONSTRAINT `FK_users_TO_match_responses_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_availability_slots` ADD CONSTRAINT `FK_users_TO_user_availability_slots_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_traits` ADD CONSTRAINT `FK_users_TO_user_traits_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_traits` ADD CONSTRAINT `FK_trait_catalog_TO_user_traits_1` FOREIGN KEY (
	`traitId`
)
REFERENCES `trait_catalog` (
	`traitId`
);

ALTER TABLE `match_pairs` ADD CONSTRAINT `FK_match_requests_TO_match_pairs_1` FOREIGN KEY (
	`requesterAId`
)
REFERENCES `match_requests` (
	`matchRequestId`
);

ALTER TABLE `match_pairs` ADD CONSTRAINT `FK_match_requests_TO_match_pairs_2` FOREIGN KEY (
	`requesterBId`
)
REFERENCES `match_requests` (
	`matchRequestId`
);

ALTER TABLE `match_pairs` ADD CONSTRAINT `FK_users_TO_match_pairs_1` FOREIGN KEY (
	`userAId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `match_pairs` ADD CONSTRAINT `FK_users_TO_match_pairs_2` FOREIGN KEY (
	`userBId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `safety_events` ADD CONSTRAINT `FK_sessions_TO_safety_events_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `safety_events` ADD CONSTRAINT `FK_users_TO_safety_events_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `session_goals` ADD CONSTRAINT `FK_sessions_TO_session_goals_1` FOREIGN KEY (
	`session_id`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `session_goals` ADD CONSTRAINT `FK_users_TO_session_goals_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `session_goals` ADD CONSTRAINT `FK_practice_goal_catalog_TO_session_goals_1` FOREIGN KEY (
	`practice_goal_id`
)
REFERENCES `practice_goal_catalog` (
	`practiceGoalId`
);

ALTER TABLE `session_reports` ADD CONSTRAINT `FK_sessions_TO_session_reports_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `session_reports` ADD CONSTRAINT `FK_users_TO_session_reports_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_badges` ADD CONSTRAINT `FK_users_TO_user_badges_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_badges` ADD CONSTRAINT `FK_badge_catalog_TO_user_badges_1` FOREIGN KEY (
	`badgeId`
)
REFERENCES `badge_catalog` (
	`badgeId`
);

ALTER TABLE `notifications` ADD CONSTRAINT `FK_users_TO_notifications_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `peer_evaluations` ADD CONSTRAINT `FK_sessions_TO_peer_evaluations_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `peer_evaluations` ADD CONSTRAINT `FK_users_TO_peer_evaluations_1` FOREIGN KEY (
	`evaluatorUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `peer_evaluations` ADD CONSTRAINT `FK_users_TO_peer_evaluations_2` FOREIGN KEY (
	`evaluateeUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `refresh_tokens` ADD CONSTRAINT `FK_users_TO_refresh_tokens_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_consents` ADD CONSTRAINT `FK_users_TO_user_consents_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_consents` ADD CONSTRAINT `FK_consent_types_TO_user_consents_1` FOREIGN KEY (
	`consentTypeId`
)
REFERENCES `consent_types` (
	`consentTypeId`
);

ALTER TABLE `oauth_accounts` ADD CONSTRAINT `FK_users_TO_oauth_accounts_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `reports` ADD CONSTRAINT `FK_sessions_TO_reports_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `reports` ADD CONSTRAINT `FK_users_TO_reports_1` FOREIGN KEY (
	`reporterUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `reports` ADD CONSTRAINT `FK_users_TO_reports_2` FOREIGN KEY (
	`reportedUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_love_temperatures` ADD CONSTRAINT `FK_users_TO_user_love_temperatures_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `session_participants` ADD CONSTRAINT `FK_sessions_TO_session_participants_1` FOREIGN KEY (
	`session_id`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `session_participants` ADD CONSTRAINT `FK_users_TO_session_participants_1` FOREIGN KEY (
	`user_id`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `sessions` ADD CONSTRAINT `FK_match_pairs_TO_sessions_1` FOREIGN KEY (
	`matchPairId`
)
REFERENCES `match_pairs` (
	`matchPairId`
);

ALTER TABLE `sessions` ADD CONSTRAINT `FK_room_themes_TO_sessions_1` FOREIGN KEY (
	`roomThemeId`
)
REFERENCES `room_themes` (
	`room_theme_id`
);

ALTER TABLE `session_metric_summaries` ADD CONSTRAINT `FK_sessions_TO_session_metric_summaries_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `session_metric_summaries` ADD CONSTRAINT `FK_users_TO_session_metric_summaries_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `match_requests` ADD CONSTRAINT `FK_users_TO_match_requests_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `coaching_events` ADD CONSTRAINT `FK_sessions_TO_coaching_events_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `coaching_events` ADD CONSTRAINT `FK_users_TO_coaching_events_1` FOREIGN KEY (
	`targetUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `contact_profiles` ADD CONSTRAINT `FK_users_TO_contact_profiles_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `attendance_penalties` ADD CONSTRAINT `FK_users_TO_attendance_penalties_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `attendance_penalties` ADD CONSTRAINT `FK_sessions_TO_attendance_penalties_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `user_profiles` ADD CONSTRAINT `FK_users_TO_user_profiles_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_practice_goals` ADD CONSTRAINT `FK_users_TO_user_practice_goals_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_practice_goals` ADD CONSTRAINT `FK_practice_goal_catalog_TO_user_practice_goals_1` FOREIGN KEY (
	`practiceGoalId`
)
REFERENCES `practice_goal_catalog` (
	`practiceGoalId`
);

ALTER TABLE `user_face_tags` ADD CONSTRAINT `FK_users_TO_user_face_tags_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_face_tags` ADD CONSTRAINT `FK_face_tag_catalog_TO_user_face_tags_1` FOREIGN KEY (
	`faceTagId`
)
REFERENCES `face_tag_catalog` (
	`face_tag_id`
);

ALTER TABLE `user_blocks` ADD CONSTRAINT `FK_users_TO_user_blocks_1` FOREIGN KEY (
	`blockerUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `user_blocks` ADD CONSTRAINT `FK_users_TO_user_blocks_2` FOREIGN KEY (
	`blockedUserId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `love_temperature_histories` ADD CONSTRAINT `FK_users_TO_love_temperature_histories_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `love_temperature_histories` ADD CONSTRAINT `FK_sessions_TO_love_temperature_histories_1` FOREIGN KEY (
	`sessionId`
)
REFERENCES `sessions` (
	`sessionId`
);

ALTER TABLE `sanctions` ADD CONSTRAINT `FK_users_TO_sanctions_1` FOREIGN KEY (
	`userId`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `sanctions` ADD CONSTRAINT `FK_users_TO_sanctions_2` FOREIGN KEY (
	`createdBy`
)
REFERENCES `users` (
	`userId`
);

ALTER TABLE `sanctions` ADD CONSTRAINT `FK_reports_TO_sanctions_1` FOREIGN KEY (
	`reportId`
)
REFERENCES `reports` (
	`reportId`
);

