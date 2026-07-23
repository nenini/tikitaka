DROP TABLE `contact_profiles`;

ALTER TABLE `user_profiles`
    DROP COLUMN `heightCm`;

ALTER TABLE `user_profiles`
    DROP COLUMN `regionDistrict`;

ALTER TABLE `user_profiles`
    DROP COLUMN `minPreferredAge`;

ALTER TABLE `user_profiles`
    DROP COLUMN `maxPreferredAge`;

ALTER TABLE `user_profiles`
    DROP COLUMN `conversationType`;

ALTER TABLE `user_profiles`
    DROP COLUMN `faceTagsVisible`;
