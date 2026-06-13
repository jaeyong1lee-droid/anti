$desktop = [System.Environment]::GetFolderPath('Desktop')
$filePath = Join-Path $desktop "안티\server\index.js"
$utf8 = [System.Text.Encoding]::UTF8
$content = [System.IO.File]::ReadAllText($filePath, $utf8)

$t1 = '   - "concept": 질문에 정확히 부합하며, 최소 4줄에서 최대 6줄 사이의 분량으로 아주 전문적이고 직관적인 개요 및 개념 설명을 서술하십시오. (절대 너무 짧거나 1~2줄 요약식으로 쓰지 말고, 반드시 4~6줄 분량을 엄격히 준수하여 학술적 설명의 깊이를 확보할 것).'
$r1 = '   - "concept": 질문에 정확히 부합하며, 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명을 작성하십시오. 지나치게 1~2줄로 축약하거나 불필요하게 장황하지 않도록 적절한 학술적 깊이를 확보해야 합니다.'

$t2 = '    "concept": "토픽의 공학적 메커니즘과 학술적 원리를 상세히 기술한 4~6줄 분량의 직관적인 개요 설명",'
$r2 = '    "concept": "토픽의 공학적 메커니즘과 학술적 원리를 상세히 기술한 3~5줄 내외의 직관적인 개요 설명",'

$t3 = '- "concept": 질문에 정확히 부합하는 1~2줄 이내의 매우 명료하고 컴팩트한 핵심 정의 및 요약 답변 (절대 길거나 장황하게 쓰지 말 것).'
$r3 = '- "concept": 질문에 정확히 부합하며, 3~5줄 내외의 깊이 있고 전문적인 서술형 개요 및 개념 설명을 작성하십시오. 지나치게 1~2줄로 축약하거나 불필요하게 장황하지 않도록 적절한 학술적 깊이를 확보해야 합니다.'

$t4 = '  "concept": "1~2줄 컴팩트 요약 답변",'
$r4 = '  "concept": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 설명",'

$t5 = '  "concept": "1~2줄 요약 답변",'
$r5 = '  "concept": "3~5줄 내외의 깊이 있고 전문적인 서술형 개요 설명",'

if ($content.Contains($t1)) {
    $content = $content.Replace($t1, $r1)
    Write-Output "Patched target 1"
} else {
    Write-Output "Target 1 not found"
}

if ($content.Contains($t2)) {
    $content = $content.Replace($t2, $r2)
    Write-Output "Patched target 2"
} else {
    Write-Output "Target 2 not found"
}

if ($content.Contains($t3)) {
    $content = $content.Replace($t3, $r3)
    Write-Output "Patched target 3"
} else {
    Write-Output "Target 3 not found"
}

if ($content.Contains($t4)) {
    $content = $content.Replace($t4, $r4)
    Write-Output "Patched target 4"
} else {
    Write-Output "Target 4 not found"
}

if ($content.Contains($t5)) {
    $content = $content.Replace($t5, $r5)
    Write-Output "Patched target 5"
} else {
    Write-Output "Target 5 not found"
}

[System.IO.File]::WriteAllText($filePath, $content, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Done!"
