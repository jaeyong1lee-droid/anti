import json
import re

def extract_calculation_rows_from_text(file_text):
    if not file_text:
        return None

    sub_question_pattern = re.compile(r'[（\(](\d+)[)）]\s*([^\n\(\（]+?)(?=\s*[（\(]\d+[)）]|\n\n|$)')
    
    matches = []
    # finditer instead of exec loop
    for match in sub_question_pattern.finditer(file_text):
        num = int(match.group(1))
        text = match.group(2).strip().rstrip(',，')
        text = re.sub(r'\s+', ' ', text)
        if 3 <= len(text) <= 80 and 1 <= num <= 10:
            matches.append({"num": num, "text": text})

    if len(matches) < 2:
        return None

    best_group = []
    for i in range(len(matches)):
        if matches[i]["num"] == 1:
            group = [matches[i]]
            for j in range(i + 1, len(matches)):
                if matches[j]["num"] == group[-1]["num"] + 1:
                    group.append(matches[j])
                elif matches[j]["num"] > group[-1]["num"] + 1:
                    break
            if len(group) > len(best_group):
                best_group = group

    if len(best_group) < 2:
        return None

    rows = []
    answers = {}
    for item in best_group:
        num = item["num"]
        text = item["text"]
        rows.append([f"({num}) {text}", f"[INPUT_{num}]"])
        answers[f"INPUT_{num}"] = f"({num}) {text} 공식 및 수치 풀이"

    return {"rows": rows, "answers": answers}

# Mock text
file_text = """
댐 저면 침투 및 유선망 수리해석 보고서
(1) 침투수량
계산과정...
(2) A, B 및 C점에서의 간극수압
계산과정...
(3) C점에서 출구까지 동수경사를 구하시오.
계산과정...
"""

extracted = extract_calculation_rows_from_text(file_text)
print("EXTRACTED RESULT:")
print(json.dumps(extracted, ensure_ascii=False, indent=2))
