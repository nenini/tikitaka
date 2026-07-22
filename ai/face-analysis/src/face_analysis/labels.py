"""Canonical labels for the approved celebrity reference dataset.

``analysis_group`` selects a user-requested result space. It must never be
inferred from a face image.
"""

from __future__ import annotations

from dataclasses import dataclass


FACE_TYPE_KO = {
    "dog": "강아지상",
    "cat": "고양이상",
    "rabbit": "토끼상",
    "fox": "여우상",
    "deer": "사슴상",
    "turtle": "거북이상",
    "hamster": "햄스터상",
    "snake": "뱀상",
    "dinosaur": "공룡상",
    "wolf": "늑대상",
}

ANALYSIS_GROUP_LABELS = {
    "female": (
        "dog",
        "cat",
        "rabbit",
        "fox",
        "deer",
        "turtle",
        "hamster",
        "snake",
        "dinosaur",
    ),
    "male": (
        "dog",
        "cat",
        "rabbit",
        "fox",
        "deer",
        "snake",
        "dinosaur",
        "wolf",
    ),
}


@dataclass(frozen=True)
class ReferencePerson:
    file_prefix: str
    person_id: str
    display_name: str
    analysis_group: str
    face_type: str


def _person(
    file_prefix: str,
    person_id: str,
    display_name: str,
    analysis_group: str,
    face_type: str,
) -> ReferencePerson:
    return ReferencePerson(
        file_prefix, person_id, display_name, analysis_group, face_type
    )


REFERENCE_PEOPLE = (
    _person("지수", "jisoo_blackpink", "지수", "female", "dog"),
    _person("박보영", "park_bo_young", "박보영", "female", "dog"),
    _person("안유진", "an_yu_jin", "안유진", "female", "dog"),
    _person("민지", "minji_newjeans", "민지", "female", "dog"),
    _person("BTS진", "jin_bts", "BTS 진", "male", "dog"),
    _person("양요섭", "yang_yo_seob", "양요섭", "male", "dog"),
    _person("박보검", "park_bo_gum", "박보검", "male", "dog"),
    _person("최우식", "choi_woo_shik", "최우식", "male", "dog"),
    _person("해린", "haerin_newjeans", "해린", "female", "cat"),
    _person("제니", "jennie_blackpink", "제니", "female", "cat"),
    _person("규진", "kyujin_nmixx", "규진", "female", "cat"),
    _person("한예슬", "han_ye_seul", "한예슬", "female", "cat"),
    _person("B1A4진영", "jinyoung_b1a4", "진영", "male", "cat"),
    _person("시우민", "xiumin", "시우민", "male", "cat"),
    _person("황민현", "hwang_min_hyun", "황민현", "male", "cat"),
    _person("슈가", "suga_bts", "슈가", "male", "cat"),
    _person("장원영", "jang_won_young", "장원영", "female", "rabbit"),
    _person("나연", "nayeon_twice", "나연", "female", "rabbit"),
    _person("수지", "bae_suzy", "수지", "female", "rabbit"),
    _person("한지민", "han_ji_min", "한지민", "female", "rabbit"),
    _person("정국", "jungkook_bts", "정국", "male", "rabbit"),
    _person("투바투수빈", "soobin_txt", "투바투 수빈", "male", "rabbit"),
    _person("이민혁", "lee_min_hyuk", "이민혁", "male", "rabbit"),
    _person("NCT도영", "doyoung_nct", "NCT 도영", "male", "rabbit"),
    _person("아사", "asa_babymonster", "아사", "female", "fox"),
    _person("예지", "yeji_itzy", "예지", "female", "fox"),
    _person("사나", "sana_twice", "사나", "female", "fox"),
    _person("한소희", "han_so_hee", "한소희", "female", "fox"),
    _person("영케이", "young_k_day6", "영케이", "male", "fox"),
    _person("육성재", "yook_sung_jae", "육성재", "male", "fox"),
    _person("주지훈", "ju_ji_hoon", "주지훈", "male", "fox"),
    _person("이도현", "lee_do_hyun", "이도현", "male", "fox"),
    _person("미연", "miyeon_gidle", "미연", "female", "deer"),
    _person("설윤", "sullyoon_nmixx", "설윤", "female", "deer"),
    _person("윤아", "im_yoon_a", "윤아", "female", "deer"),
    _person("고아라", "go_ara", "고아라", "female", "deer"),
    _person("민호", "minho_shinee", "샤이니 민호", "male", "deer"),
    _person("투어스한진", "hanjin_tws", "투어스 한진", "male", "deer"),
    _person("차은우", "cha_eun_woo", "차은우", "male", "deer"),
    _person("최강창민", "max_changmin", "최강창민", "male", "deer"),
    _person("하연수", "ha_yeon_soo", "하연수", "female", "turtle"),
    _person("유정", "yujeong", "유정", "female", "turtle"),
    _person("신민아", "shin_min_a", "신민아", "female", "turtle"),
    _person("조유리", "jo_yu_ri", "조유리", "female", "turtle"),
    _person("강미나", "kang_mina", "강미나", "female", "hamster"),
    _person("원희", "wonhee_illit", "원희", "female", "hamster"),
    _person("김다미", "kim_da_mi", "김다미", "female", "hamster"),
    _person("송하영", "song_ha_young", "송하영", "female", "hamster"),
    _person("카리나", "karina_aespa", "카리나", "female", "snake"),
    _person("청하", "chungha", "청하", "female", "snake"),
    _person("헤이즈", "heize", "헤이즈", "female", "snake"),
    _person("김소연", "kim_so_yeon", "김소연", "female", "snake"),
    _person("이준기", "lee_joon_gi", "이준기", "male", "snake"),
    _person("우도환", "woo_do_hwan", "우도환", "male", "snake"),
    _person("NCT텐", "ten_nct", "NCT 텐", "male", "snake"),
    _person("세븐틴조슈아", "joshua_seventeen", "세븐틴 조슈아", "male", "snake"),
    _person("천우희", "chun_woo_hee", "천우희", "female", "dinosaur"),
    _person("송지효", "song_ji_hyo", "송지효", "female", "dinosaur"),
    _person("이하이", "lee_hi", "이하이", "female", "dinosaur"),
    _person("김아중", "kim_ah_joong", "김아중", "female", "dinosaur"),
    _person("김우빈", "kim_woo_bin", "김우빈", "male", "dinosaur"),
    _person("옥택연", "ok_taec_yeon", "택연", "male", "dinosaur"),
    _person("류준열", "ryu_jun_yeol", "류준열", "male", "dinosaur"),
    _person("공유", "gong_yoo", "공유", "male", "dinosaur"),
    _person("현빈", "hyun_bin", "현빈", "male", "wolf"),
    _person("손석구", "son_suk_ku", "손석구", "male", "wolf"),
    _person("서인국", "seo_in_guk", "서인국", "male", "wolf"),
    _person("이수혁", "lee_soo_hyuk", "이수혁", "male", "wolf"),
)

PEOPLE_BY_FILE_PREFIX = {person.file_prefix: person for person in REFERENCE_PEOPLE}

_GROUP_ALIASES = {
    "female": "female",
    "woman": "female",
    "여성": "female",
    "여자": "female",
    "male": "male",
    "man": "male",
    "남성": "male",
    "남자": "male",
}


def normalize_analysis_group(value: str) -> str:
    """Normalize an explicit user-selected analysis group."""
    key = str(value).strip().lower()
    try:
        return _GROUP_ALIASES[key]
    except KeyError as exc:
        raise ValueError(f"지원하지 않는 분석 그룹입니다: {value!r}") from exc


def labels_for_group(value: str) -> tuple[str, ...]:
    return ANALYSIS_GROUP_LABELS[normalize_analysis_group(value)]
