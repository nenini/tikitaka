"""Fixed message catalog used by the first rule-based MVP."""

COACHING_MESSAGES: dict[str, str] = {
    "SILENCE_RECOVERY_01": "가볍게 새로운 질문을 건네보세요.",
    "SILENCE_RECOVERY_02": "상대방의 취미에 대해 물어보세요.",
    "SILENCE_RECOVERY_03": "요즘 즐겨 하는 일이 있는지 물어보세요.",
    "SILENCE_RECOVERY_04": "최근 재미있었던 일을 이야기해 보세요.",
    "SILENCE_RECOVERY_05": "좋아하는 음식이나 장소에 관해 이야기해 보세요.",
    "SILENCE_RECOVERY_06": "MBTI와 같은 가벼운 주제에 관해 이야기해 보세요.",
    "ATTENTION_RECOVERY_01": "상대방의 이야기에 자연스럽게 응시해주세요.",
    "ATTENTION_RECOVERY_02": "상대방을 바라보며 이야기를 들어보세요.",
    "ATTENTION_RECOVERY_03": "화면에 시선을 두고 대화에 집중해 보세요.",
    "FACE_VISIBILITY_01": "얼굴이 화면에 보이도록 카메라 위치를 확인해 주세요.",
    "FACE_DISTANCE_01": "카메라에 얼굴이 조금 더 잘 보이도록 가까이 앉아주세요.",
    "LIGHTING_GUIDANCE_01": "얼굴이 잘 보이도록 주변을 조금 밝게 해주세요.",
    "VISION_UNAVAILABLE_01": "카메라 상태를 확인해 주세요. 현재 화면 분석이 어렵습니다.",
    "EXPRESSION_GUIDANCE_01": "표정을 조금 더 부드럽게 하며 상대방의 이야기를 들어보세요.",
    "REACTION_PROMPT_01": "짧은 맞장구로 상대방의 이야기에 반응해 보세요.",
    "REACTION_PROMPT_02": "“그렇군요”처럼 가볍게 반응해 보세요.",
    "REACTION_PROMPT_03": "상대방의 이야기를 듣고 있다는 표현을 가볍게 보여주세요.",
    "RESPONSE_PROMPT_01": "짧게라도 자신의 생각을 이야기해 보세요.",
    "RESPONSE_PROMPT_02": "떠오르는 생각부터 편하게 답해 보세요.",
    "RESPONSE_PROMPT_03": "상대방의 질문에 자신의 경험을 덧붙여 보세요.",
    # 사용자가 버튼으로 요청한 질문 추천. 문구는 항상 LLM이 만들고, 만들지 못하면
    # 코칭을 보내지 않는다 — 이 값은 키 목록을 온전히 두기 위한 자리다.
    "QUESTION_SUGGESTION_01": "대화 흐름에 맞는 질문을 건네보세요.",
    "VOLUME_GUIDANCE_UP_01": "목소리가 조금 작아요. 조금만 크게 말해 보세요.",
    "VOLUME_GUIDANCE_DOWN_01": "목소리가 조금 커요. 편안한 크기로 낮춰 보세요.",
}

# Backward-compatible public name used by the existing demo.
COACHING_TEMPLATES = COACHING_MESSAGES

COACHING_KEYS_BY_TYPE: dict[str, tuple[str, ...]] = {
    "SILENCE_RECOVERY": tuple(
        f"SILENCE_RECOVERY_{index:02d}" for index in range(1, 6)
    ),
    "ATTENTION_RECOVERY": tuple(
        f"ATTENTION_RECOVERY_{index:02d}" for index in range(1, 4)
    ),
    "REACTION_PROMPT": tuple(
        f"REACTION_PROMPT_{index:02d}" for index in range(1, 4)
    ),
    "RESPONSE_PROMPT": tuple(
        f"RESPONSE_PROMPT_{index:02d}" for index in range(1, 4)
    ),
    "EXPRESSION_GUIDANCE": ("EXPRESSION_GUIDANCE_01",),
}
"""타입 → 로테이션할 메시지 키. **여기 없는 타입은 후보의 message_key 를 그대로 쓴다.**

VOLUME_GUIDANCE 와 VISION_SETUP_GUIDANCE 를 일부러 뺐다. 둘 다 상황에 따라 정반대
문구가 필요해서(크게/작게, 얼굴/조명/거리) 로테이션을 걸면 엉뚱한 안내가 나간다.
"""
