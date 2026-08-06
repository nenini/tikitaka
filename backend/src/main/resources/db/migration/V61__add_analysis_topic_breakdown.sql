-- 주제별 발화 비중 저장 컬럼.
--
-- AI가 세션 전사를 사전 기반으로 분류해 "무슨 얘기를 얼마나 했는지"를 계산한다.
-- axes_json / metrics_json 과 같은 방식으로 JSON 문자열을 그대로 보관한다 —
-- 주제 목록은 AI 사전이 바뀌면 늘어나므로 컬럼으로 펼치지 않는다.
--
-- NULL 허용: 이 컬럼이 생기기 전에 저장된 분석과, 전사가 없어 주제를 못 낸 참가자.
ALTER TABLE `session_participant_analyses`
    ADD COLUMN `topic_breakdown_json` LONGTEXT NULL;
