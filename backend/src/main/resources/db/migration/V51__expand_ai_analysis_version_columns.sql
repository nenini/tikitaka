ALTER TABLE `ai_session_analysis_events`
    MODIFY COLUMN `model_version` VARCHAR(128);

ALTER TABLE `ai_session_analysis_events`
    MODIFY COLUMN `rule_version` VARCHAR(128);
