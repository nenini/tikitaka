
/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

LOCK TABLES `badge_catalog` WRITE;
/*!40000 ALTER TABLE `badge_catalog` DISABLE KEYS */;
INSERT INTO `badge_catalog` (`badgeId`, `code`, `name`, `description`, `conditionType`, `thresholdCount`, `iconUrl`, `isActive`, `createdAt`, `updatedAt`, `displayOrder`, `policyVersion`) VALUES (1,'FIRST_SESSION','첫 만남','첫 번째 소개팅 연습 세션을 완료했어요.','SESSION_COMPLETED_COUNT',1,NULL,1,'2026-08-07 09:33:43','2026-08-07 09:33:43',10,'badge-v1.0.0'),(2,'SESSION_5','대화 입문자','소개팅 연습 세션을 5회 완료했어요.','SESSION_COMPLETED_COUNT',5,NULL,1,'2026-08-07 09:33:43','2026-08-07 09:33:43',20,'badge-v1.0.0'),(3,'SESSION_10','대화 연습가','소개팅 연습 세션을 10회 완료했어요.','SESSION_COMPLETED_COUNT',10,NULL,1,'2026-08-07 09:33:43','2026-08-07 09:33:43',30,'badge-v1.0.0'),(4,'FIRST_REPORT','첫 번째 피드백','첫 번째 AI 분석 리포트를 받았어요.','REPORT_COMPLETED_COUNT',1,NULL,1,'2026-08-07 09:33:43','2026-08-07 09:33:43',40,'badge-v1.0.0'),(5,'REPORT_5','성장 기록가','AI 분석 리포트를 5회 받았어요.','REPORT_COMPLETED_COUNT',5,NULL,1,'2026-08-07 09:33:43','2026-08-07 09:33:43',50,'badge-v1.0.0');
/*!40000 ALTER TABLE `badge_catalog` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `consent_types` WRITE;
/*!40000 ALTER TABLE `consent_types` DISABLE KEYS */;
INSERT INTO `consent_types` (`consentTypeId`, `code`, `name`, `version`, `isRequired`, `isActive`, `createdAt`) VALUES (1,'INTEGRATED_SERVICE_CONSENT','서비스 이용 및 분석 통합 동의','1.0',0,1,'2026-07-29 14:18:04'),(2,'FACE_CAPTURE_CONSENT','얼굴 촬영 및 분석 동의','1.0',0,1,'2026-07-29 14:18:04');
/*!40000 ALTER TABLE `consent_types` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `face_tag_catalog` WRITE;
/*!40000 ALTER TABLE `face_tag_catalog` DISABLE KEYS */;
INSERT INTO `face_tag_catalog` (`face_tag_id`, `code`, `name`, `description`, `isActive`, `createdAt`, `applicableGender`, `displayOrder`) VALUES (1,'DOG','강아지상',NULL,1,'2026-07-29 14:18:04','ALL',1),(2,'CAT','고양이상',NULL,1,'2026-07-29 14:18:04','ALL',2),(3,'RABBIT','토끼상',NULL,1,'2026-07-29 14:18:04','ALL',3),(4,'DEER','사슴상',NULL,1,'2026-07-29 14:18:04','ALL',4),(5,'FOX','여우상',NULL,1,'2026-07-29 14:18:04','ALL',5),(6,'TURTLE','꼬북이상',NULL,1,'2026-07-29 14:18:04','FEMALE',6),(7,'HAMSTER','햄스터상',NULL,1,'2026-07-29 14:18:04','FEMALE',7),(8,'SNAKE','뱀상',NULL,1,'2026-07-29 14:18:04','ALL',8),(9,'DINOSAUR','공룡상',NULL,1,'2026-07-29 14:18:04','ALL',9),(10,'WOLF','늑대상',NULL,1,'2026-07-29 14:18:04','MALE',10);
/*!40000 ALTER TABLE `face_tag_catalog` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `face_tag_examples` WRITE;
/*!40000 ALTER TABLE `face_tag_examples` DISABLE KEYS */;
/*!40000 ALTER TABLE `face_tag_examples` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `matching_policies` WRITE;
/*!40000 ALTER TABLE `matching_policies` DISABLE KEYS */;
INSERT INTO `matching_policies` (`matchingPolicyId`, `faceTypeWeight`, `personalityWeight`, `acceptTimeoutHours`, `minimumAcceptanceWindowMinutes`, `minimumPreparationMinutes`, `scheduleSearchDays`, `recentMatchExclusionDays`, `lateCancellationMinutes`, `policyVersion`, `updatedBy`, `createdAt`, `updatedAt`) VALUES (1,50,50,8,60,60,7,7,60,1,NULL,'2026-08-07 09:33:23','2026-08-07 09:33:23');
/*!40000 ALTER TABLE `matching_policies` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `mission_catalog` WRITE;
/*!40000 ALTER TABLE `mission_catalog` DISABLE KEYS */;
INSERT INTO `mission_catalog` (`mission_id`, `code`, `practice_goal_code`, `title`, `description`, `target_value`, `progress_unit`, `display_order`, `is_active`) VALUES (1,'ASK_FOLLOW_UP_QUESTION','TALK_TOO_LITTLE','확장 질문 1회 하기','상대방의 이야기를 듣고 관련된 질문을 한 번 더 해보세요.',1,'COUNT',1,1),(2,'LISTEN_WITHOUT_INTERRUPT','TALK_TOO_MUCH','상대의 이야기 끝까지 듣기','상대방의 말을 끊지 않고 끝까지 들어보세요.',1,'COUNT',2,1),(3,'KEEP_COMFORTABLE_VOLUME_LOWER','VOICE_TOO_LOUD','편안한 성량 유지하기','상대방이 편안하게 들을 수 있도록 목소리를 조금 낮춰보세요.',60,'SECONDS',3,1),(4,'KEEP_COMFORTABLE_VOLUME_HIGHER','VOICE_TOO_QUIET','또렷한 성량 유지하기','상대방에게 잘 들리도록 또렷한 목소리를 유지해보세요.',60,'SECONDS',4,1);
/*!40000 ALTER TABLE `mission_catalog` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `practice_goal_catalog` WRITE;
/*!40000 ALTER TABLE `practice_goal_catalog` DISABLE KEYS */;
INSERT INTO `practice_goal_catalog` (`practiceGoalId`, `code`, `name`, `description`, `isActive`, `goalCategory`, `displayOrder`) VALUES (1,'TALK_TOO_MUCH','말이 너무 많아요',NULL,1,'SPEECH_AMOUNT',1),(2,'TALK_TOO_LITTLE','말이 너무 적어요',NULL,1,'SPEECH_AMOUNT',2),(3,'VOICE_TOO_LOUD','목소리가 너무 커요',NULL,1,'VOICE_VOLUME',3),(4,'VOICE_TOO_QUIET','목소리가 너무 작아요',NULL,1,'VOICE_VOLUME',4),(5,'OTHER','기타',NULL,1,'OTHER',5);
/*!40000 ALTER TABLE `practice_goal_catalog` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `question_cards` WRITE;
/*!40000 ALTER TABLE `question_cards` DISABLE KEYS */;
INSERT INTO `question_cards` (`question_card_id`, `code`, `category`, `content`, `sensitive`, `active`, `display_order`) VALUES (1,'HOBBY_01','HOBBY','요즘 가장 즐겨 하는 취미가 있나요?',0,1,1),(2,'HOBBY_02','HOBBY','시간이 생기면 새로 배워 보고 싶은 것이 있나요?',0,1,2),(3,'EXERCISE_01','EXERCISE','좋아하거나 꾸준히 하는 운동이 있나요?',0,1,3),(4,'EXERCISE_02','EXERCISE','산책과 실내 운동 중 어느 쪽을 더 좋아하세요?',0,1,4),(5,'COOKING_01','COOKING','가장 자신 있게 만들 수 있는 음식은 무엇인가요?',0,1,5),(6,'COOKING_02','COOKING','최근에 맛있게 먹은 음식이 있나요?',0,1,6),(7,'MBTI_01','MBTI','MBTI 설명 중 본인과 가장 잘 맞는 부분은 무엇인가요?',0,1,7),(8,'MBTI_02','MBTI','계획적인 여행과 즉흥 여행 중 어느 쪽을 선호하세요?',0,1,8),(9,'PET_01','PET','좋아하는 동물이나 함께 살아 보고 싶은 반려동물이 있나요?',0,1,9),(10,'PET_02','PET','동물을 좋아하게 된 특별한 계기가 있나요?',0,1,10),(11,'FAMILY_01','FAMILY','가족과 함께할 때 가장 좋아하는 활동은 무엇인가요?',0,1,11),(12,'DAILY_01','DAILY','최근 일상에서 소소하게 기뻤던 일이 있나요?',0,1,12),(13,'TRAVEL_01','TRAVEL','다시 방문하고 싶은 여행지가 있나요?',0,1,13),(14,'CULTURE_01','CULTURE','최근 재미있게 본 영화나 드라마가 있나요?',0,1,14),(15,'RELIGION_01','RELIGION','종교가 일상에 어떤 영향을 주나요?',1,0,15);
/*!40000 ALTER TABLE `question_cards` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `room_themes` WRITE;
/*!40000 ALTER TABLE `room_themes` DISABLE KEYS */;
/*!40000 ALTER TABLE `room_themes` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `trait_catalog` WRITE;
/*!40000 ALTER TABLE `trait_catalog` DISABLE KEYS */;
INSERT INTO `trait_catalog` (`traitId`, `traitType`, `code`, `name`, `isActive`, `displayOrder`) VALUES (1,'PERSONALITY','KIND','다정',1,1),(2,'PERSONALITY','GENTLE','온화',1,2),(3,'PERSONALITY','OPTIMISTIC','낙천',1,3),(4,'PERSONALITY','RELAXED','느긋',1,4),(5,'PERSONALITY','ALOOF','도도',1,5),(6,'PERSONALITY','FRIENDLY','친근',1,6),(7,'PERSONALITY','CALM','차분',1,7),(8,'PERSONALITY','DELICATE','섬세',1,8),(9,'PERSONALITY','HONEST','솔직',1,9),(10,'PERSONALITY','POLITE','예의바른',1,10),(11,'PERSONALITY','HUMOROUS','유머러스한',1,11);
/*!40000 ALTER TABLE `trait_catalog` ENABLE KEYS */;
UNLOCK TABLES;

LOCK TABLES `flyway_schema_history` WRITE;
/*!40000 ALTER TABLE `flyway_schema_history` DISABLE KEYS */;
INSERT INTO `flyway_schema_history` (`installed_rank`, `version`, `description`, `type`, `script`, `checksum`, `installed_by`, `installed_on`, `execution_time`, `success`) VALUES (1,'1','create initial schema','SQL','V1__create_initial_schema.sql',-366372411,'date','2026-07-29 05:18:01',19087,1),(2,'2','create password reset tokens','SQL','V2__create_password_reset_tokens.sql',-1408392928,'date','2026-07-29 05:18:01',156,1),(3,'3','prepare oauth accounts','SQL','V3__prepare_oauth_accounts.sql',-701635962,'date','2026-07-29 05:18:01',467,1),(4,'4','remove contact profiles and trim user profiles','SQL','V4__remove_contact_profiles_and_trim_user_profiles.sql',-1850556250,'date','2026-07-29 05:18:03',1121,1),(5,'5','add survey schema and catalog','SQL','V5__add_survey_schema_and_catalog.sql',-1424482978,'date','2026-07-29 05:18:04',1804,1),(6,'6','seed consent types','SQL','V6__seed_consent_types.sql',131424086,'date','2026-07-29 05:18:05',29,1),(7,'7','add user consent unique constraint','SQL','V7__add_user_consent_unique_constraint.sql',1867845453,'date','2026-07-29 05:18:05',74,1),(8,'8','add face analysis schema','SQL','V8__add_face_analysis_schema.sql',994749923,'date','2026-07-29 05:18:07',1914,1),(9,'9','add match domain schema','SQL','V9__add_match_domain_schema.sql',370800400,'date','2026-07-29 05:18:15',8646,1),(10,'10','add match job queue','SQL','V10__add_match_job_queue.sql',1782473344,'date','2026-07-29 05:18:16',924,1),(11,'11','add ai chat session purpose','SQL','V11__add_ai_chat_session_purpose.sql',-1366215980,'date','2026-07-29 05:18:17',256,1),(12,'12','add ai chat message sequence','SQL','V12__add_ai_chat_message_sequence.sql',1569105750,'date','2026-07-29 05:18:17',460,1),(13,'13','delegate chatbot persona selection to ai','SQL','V13__delegate_chatbot_persona_selection_to_ai.sql',1009766611,'date','2026-07-29 05:18:18',456,1),(14,'14','add ai response processing state','SQL','V14__add_ai_response_processing_state.sql',-750359843,'date','2026-07-29 05:18:18',778,1),(15,'15','add notification job schema','SQL','V15__add_notification_job_schema.sql',-77659079,'date','2026-08-07 00:33:21',813,1),(16,'16','add proposed match schedule','SQL','V16__add_proposed_match_schedule.sql',1249914681,'date','2026-08-07 00:33:22',1261,1),(17,'17','add notification query index','SQL','V17__add_notification_query_index.sql',-269496907,'date','2026-08-07 00:33:22',92,1),(18,'18','add match setting recommendation status','SQL','V18__add_match_setting_recommendation_status.sql',1391170753,'date','2026-08-07 00:33:22',247,1),(19,'19','add waiting room livekit session','SQL','V19__add_waiting_room_livekit_session.sql',-1459828088,'date','2026-08-07 00:33:23',484,1),(20,'20','add admin matching policy','SQL','V20__add_admin_matching_policy.sql',-2057788859,'date','2026-08-07 00:33:26',3085,1),(21,'21','add room device checks','SQL','V21__add_room_device_checks.sql',146988939,'date','2026-08-07 00:33:26',188,1),(22,'22','add session participant realtime state','SQL','V22__add_session_participant_realtime_state.sql',1810483099,'date','2026-08-07 00:33:28',1465,1),(23,'23','add session lifecycle states','SQL','V23__add_session_lifecycle_states.sql',967470114,'date','2026-08-07 00:33:28',5,1),(24,'24','add session connection recovery state','SQL','V24__add_session_connection_recovery_state.sql',246682749,'date','2026-08-07 00:33:29',1580,1),(25,'26','add session media network state','SQL','V26__add_session_media_network_state.sql',1927368132,'date','2026-08-07 00:33:31',1151,1),(26,'28','add session timer notification state','SQL','V28__add_session_timer_notification_state.sql',-1232943316,'date','2026-08-07 00:33:31',707,1),(27,'29','add session termination actor','SQL','V29__add_session_termination_actor.sql',-997107517,'date','2026-08-07 00:33:32',290,1),(28,'30','add session mission schema','SQL','V30__add_session_mission_schema.sql',1637253817,'date','2026-08-07 00:33:32',396,1),(29,'31','backfill session livekit room names','SQL','V31__backfill_session_livekit_room_names.sql',-979492648,'date','2026-08-07 00:33:32',5,1),(30,'32','add ai session analysis events','SQL','V32__add_ai_session_analysis_events.sql',1087272209,'date','2026-08-07 00:33:32',217,1),(31,'34','add ai coaching events','SQL','V34__add_ai_coaching_events.sql',835574367,'date','2026-08-07 00:33:33',244,1),(32,'36','add silence question schema','SQL','V36__add_silence_question_schema.sql',9665392,'date','2026-08-07 00:33:33',617,1),(33,'38','add safety event schema','SQL','V38__add_safety_event_schema.sql',-1128168466,'date','2026-08-07 00:33:34',434,1),(34,'39','add session contact decision policy','SQL','V39__add_session_contact_decision_policy.sql',188033606,'date','2026-08-07 00:33:34',141,1),(35,'40','add peer evaluation schema','SQL','V40__add_peer_evaluation_schema.sql',-1998070055,'date','2026-08-07 00:33:35',632,1),(36,'41','add session moderation report evidence','SQL','V41__add_session_moderation_report_evidence.sql',-1106088296,'date','2026-08-07 00:33:36',1023,1),(37,'43','add no show restriction constraints','SQL','V43__add_no_show_restriction_constraints.sql',39391018,'date','2026-08-07 00:33:36',276,1),(38,'45','store report stt transcript','SQL','V45__store_report_stt_transcript.sql',503070150,'date','2026-08-07 00:33:36',223,1),(39,'47','add session analysis results','SQL','V47__add_session_analysis_results.sql',835411306,'date','2026-08-07 00:33:37',605,1),(40,'49','add ai report generation workflow','SQL','V49__add_ai_report_generation_workflow.sql',271371391,'date','2026-08-07 00:33:41',3667,1),(41,'51','expand ai analysis version columns','SQL','V51__expand_ai_analysis_version_columns.sql',-1406416123,'date','2026-08-07 00:33:41',65,1),(42,'53','add ai video session and reports','SQL','V53__add_ai_video_session_and_reports.sql',-216517642,'date','2026-08-07 00:33:42',974,1),(43,'55','add growth metric snapshots','SQL','V55__add_growth_metric_snapshots.sql',1390559914,'date','2026-08-07 00:33:42',182,1),(44,'57','add user manner temperature','SQL','V57__add_user_manner_temperature.sql',-1718684067,'date','2026-08-07 00:33:42',242,1),(45,'59','add growth badge policy','SQL','V59__add_growth_badge_policy.sql',776224689,'date','2026-08-07 00:33:43',466,1);
/*!40000 ALTER TABLE `flyway_schema_history` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;
