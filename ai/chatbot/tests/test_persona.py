from chatbot.persona import build_system_prompt
from chatbot.schemas import ChatMessage, PersonaSpec


def test_chat_message_camel_contract() -> None:
    msg = ChatMessage(sender_type="user", text="안녕하세요")
    c = msg.to_contract()
    assert c["senderType"] == "user"
    assert c["isProactive"] is False
    assert "createdAt" in c


def test_build_system_prompt_reflects_attributes() -> None:
    spec = PersonaSpec(
        age_group="20대",
        gender="female",
        hobbies=["전시", "카페"],
        speech_style="다정한",
        personality="차분한",
        reaction_level="호의적",
    )
    prompt = build_system_prompt(spec, stage="before")
    assert "20대" in prompt
    assert "여성" in prompt
    assert "전시" in prompt and "카페" in prompt
    assert "다정한" in prompt
    assert "소개팅 전" in prompt


def test_build_system_prompt_after_stage_and_gender() -> None:
    spec = PersonaSpec(age_group="30대", gender="male")
    prompt = build_system_prompt(spec, stage="after")
    assert "남성" in prompt
    assert "애프터" in prompt


def test_hobbies_default_empty() -> None:
    spec = PersonaSpec(age_group="20대", gender="female")
    prompt = build_system_prompt(spec)
    assert "특별히 없음" in prompt
