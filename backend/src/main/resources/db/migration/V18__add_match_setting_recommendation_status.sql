ALTER TABLE `match_requests`
    ADD COLUMN `settingRecommendationSentAt` DATETIME NULL
        AFTER `waitingStartedAt`;
