INSERT INTO `consent_types` (`code`, `name`, `version`, `isActive`)
SELECT 'INTEGRATED_SERVICE_CONSENT', '서비스 이용 및 분석 통합 동의', '1.0', TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM `consent_types`
    WHERE `code` = 'INTEGRATED_SERVICE_CONSENT'
      AND `version` = '1.0'
);

INSERT INTO `consent_types` (`code`, `name`, `version`, `isActive`)
SELECT 'FACE_CAPTURE_CONSENT', '얼굴 촬영 및 분석 동의', '1.0', TRUE
WHERE NOT EXISTS (
    SELECT 1
    FROM `consent_types`
    WHERE `code` = 'FACE_CAPTURE_CONSENT'
      AND `version` = '1.0'
);
