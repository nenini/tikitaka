from chatbot.conversation import Conversation
from chatbot.llm import MockLLM, to_openai_messages
from chatbot.schemas import ChatMessage, PersonaSpec


def _persona():
    return PersonaSpec(age_group="20대", gender="female", hobbies=["전시"])


def test_send_returns_bot_and_appends_history():
    conv = Conversation(MockLLM("반가워요 오늘 날씨 좋네요"), _persona())
    bot = conv.send("안녕하세요")
    assert bot.sender_type == "bot"
    assert "반가워요" in bot.text
    assert len(conv.history) == 2
    assert conv.history[0].sender_type == "user"
    assert conv.history[0].text == "안녕하세요"
    assert conv.history[1].sender_type == "bot"


def test_stream_reply_does_not_mutate_history():
    conv = Conversation(MockLLM("네"), _persona())
    _ = list(conv.stream_reply("테스트"))
    assert conv.history == []  # 스트리밍만으론 이력 안 바뀜


def test_to_openai_messages_roles():
    history = [
        ChatMessage(sender_type="user", text="안녕"),
        ChatMessage(sender_type="bot", text="반가워요"),
    ]
    msgs = to_openai_messages("SYS", history, "요즘 뭐해요?")
    assert msgs[0] == {"role": "system", "content": "SYS"}
    assert msgs[1]["role"] == "user"
    assert msgs[2]["role"] == "assistant"
    assert msgs[-1] == {"role": "user", "content": "요즘 뭐해요?"}


def test_persona_stage_in_system_prompt():
    conv = Conversation(MockLLM(), _persona(), stage="after")
    assert "애프터" in conv.system_prompt
