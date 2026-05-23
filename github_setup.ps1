# github_setup.ps1
# 1. Check if Git is installed
$gitCheck = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCheck) {
    Write-Host "============================================="
    Write-Host "Git이 설치되어 있지 않습니다. 자동 설치를 시작합니다..."
    Write-Host "============================================="
    
    winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements
    
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
    
    $gitCheck = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCheck) {
        Write-Host "Git 설치가 성공적으로 완료되었습니다."
        Write-Host "윈도우에 경로가 반영되도록 열려 있는 터미널을 끄고"
        Write-Host "새 파워쉘 창을 열어 다시 실행해 주세요."
        Exit
    }
}

Write-Host "Git 설치 상태 확인 완료."

Write-Host ""
$email = Read-Host "GitHub 계정(jaeyong1lee-droid)에 등록하신 이메일 주소를 입력하세요"
if ([string]::IsNullOrWhiteSpace($email)) {
    Write-Host "이메일 주소가 비어 있어 종료합니다."
    Exit
}

git config --global user.name "jaeyong1lee-droid"
git config --global user.email $email
Write-Host "Git 전역 정보 설정 완료."

Write-Host ""
Write-Host "로컬 Git 저장소 초기화 및 첫 커밋 생성 중..."
git init
git branch -M main
git add .
git commit -m "Initialize Spaced Repetition Active Recall App"

Write-Host "============================================="
Write-Host "로컬 커밋 생성이 완료되었습니다!"
Write-Host "이제 코드를 올릴 GitHub 원격 저장소를 개설해 주세요:"
Write-Host "1. 웹 브라우저로 https://github.com/new 에 접속하세요."
Write-Host "2. Repository name 칸에 'anti'를 적어주세요."
Write-Host "3. 하단의 초록색 [Create repository] 버튼을 누르세요."
Write-Host "============================================="

Write-Host ""
$confirm = Read-Host "GitHub에서 'anti' 리포지토리 생성을 완료하셨습니까? (y/n)"
if ($confirm -eq 'y' -or $confirm -eq 'Y') {
    Write-Host "GitHub 원격 저장소 연결 및 업로드(Push)를 시작합니다..."
    git remote remove origin 2>$null
    git remote add origin https://github.com/jaeyong1lee-droid/anti.git
    
    Write-Host "잠시 후 브라우저 로그인 창이 뜨면 로그인 인증을 완료해 주세요."
    git push -u origin main
    
    Write-Host "============================================="
    Write-Host "코드 업로드가 모두 완료되었습니다! 🎉"
    Write-Host "https://github.com/jaeyong1lee-droid/anti 에서 확인 가능합니다."
    Write-Host "============================================="
} else {
    Write-Host "취소되었습니다."
}
