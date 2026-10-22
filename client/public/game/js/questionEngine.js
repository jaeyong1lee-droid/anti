/**
 * Run & Learn Racer 3D (런앤런 레이서 3D)
 * Elementary School Quiz Generator & Spaced Repetition Wrong Answer System
 *
 * Features:
 * 1. Elementary Math (초등 수학 두 자리 덧셈 / 뺄셈, 10~99, plausible distractors)
 * 2. Elementary English (초등 필수 영단어 120+ 단어, KR->EN & EN->KR 양방향 출제)
 * 3. Persistent Wrong Answer Re-Appearance System ("틀린 문제는 또 등장하게 해")
 */
(function (window) {
  'use strict';

  /**
   * Curated Elementary School English Vocabulary (120 words across themes & difficulty tiers)
   */
  const ENGLISH_DICTIONARY = [
    // Tier 1: Animals & Fruits/Food (Basic)
    { en: 'apple', kr: '사과', emoji: '🍎', theme: 'food', level: 1 },
    { en: 'banana', kr: '바나나', emoji: '🍌', theme: 'food', level: 1 },
    { en: 'grape', kr: '포도', emoji: '🍇', theme: 'food', level: 1 },
    { en: 'peach', kr: '복숭아', emoji: '🍑', theme: 'food', level: 1 },
    { en: 'watermelon', kr: '수박', emoji: '🍉', theme: 'food', level: 1 },
    { en: 'strawberry', kr: '딸기', emoji: '🍓', theme: 'food', level: 1 },
    { en: 'orange', kr: '오렌지', emoji: '🍊', theme: 'food', level: 1 },
    { en: 'lemon', kr: '레몬', emoji: '🍋', theme: 'food', level: 1 },
    { en: 'milk', kr: '우유', emoji: '🥛', theme: 'food', level: 1 },
    { en: 'bread', kr: '빵', emoji: '🍞', theme: 'food', level: 1 },
    { en: 'cheese', kr: '치즈', emoji: '🧀', theme: 'food', level: 1 },
    { en: 'water', kr: '물', emoji: '💧', theme: 'food', level: 1 },
    { en: 'dog', kr: '강아지', emoji: '🐶', theme: 'animal', level: 1 },
    { en: 'cat', kr: '고양이', emoji: '🐱', theme: 'animal', level: 1 },
    { en: 'tiger', kr: '호랑이', emoji: '🐯', theme: 'animal', level: 1 },
    { en: 'lion', kr: '사자', emoji: '🦁', theme: 'animal', level: 1 },
    { en: 'rabbit', kr: '토끼', emoji: '🐰', theme: 'animal', level: 1 },
    { en: 'monkey', kr: '원숭이', emoji: '🐵', theme: 'animal', level: 1 },
    { en: 'bear', kr: '곰', emoji: '🐻', theme: 'animal', level: 1 },
    { en: 'horse', kr: '말', emoji: '🐴', theme: 'animal', level: 1 },
    { en: 'sheep', kr: '양', emoji: '🐑', theme: 'animal', level: 1 },
    { en: 'duck', kr: '오리', emoji: '🦆', theme: 'animal', level: 1 },
    { en: 'bird', kr: '새', emoji: '🐦', theme: 'animal', level: 1 },
    { en: 'fish', kr: '물고기', emoji: '🐟', theme: 'animal', level: 1 },

    // Tier 1-2: School, Family & Daily Objects
    { en: 'school', kr: '학교', emoji: '🏫', theme: 'school', level: 1 },
    { en: 'teacher', kr: '선생님', emoji: '👩‍🏫', theme: 'school', level: 1 },
    { en: 'student', kr: '학생', emoji: '🧑‍🎓', theme: 'school', level: 1 },
    { en: 'pencil', kr: '연필', emoji: '✏️', theme: 'school', level: 1 },
    { en: 'eraser', kr: '지우개', emoji: '🧽', theme: 'school', level: 1 },
    { en: 'notebook', kr: '공책', emoji: '📓', theme: 'school', level: 1 },
    { en: 'book', kr: '책', emoji: '📖', theme: 'school', level: 1 },
    { en: 'desk', kr: '책상', emoji: '🪑', theme: 'school', level: 1 },
    { en: 'chair', kr: '의자', emoji: '🪑', theme: 'school', level: 1 },
    { en: 'bag', kr: '가방', emoji: '🎒', theme: 'school', level: 1 },
    { en: 'ruler', kr: '자', emoji: '📏', theme: 'school', level: 2 },
    { en: 'family', kr: '가족', emoji: '👨‍👩‍👧‍👦', theme: 'family', level: 1 },
    { en: 'mother', kr: '어머니', emoji: '👩', theme: 'family', level: 1 },
    { en: 'father', kr: '아버지', emoji: '👨', theme: 'family', level: 1 },
    { en: 'brother', kr: '형/오빠/남동생', emoji: '👦', theme: 'family', level: 1 },
    { en: 'sister', kr: '언니/누나/여동생', emoji: '👧', theme: 'family', level: 1 },
    { en: 'friend', kr: '친구', emoji: '🤝', theme: 'family', level: 1 },
    { en: 'baby', kr: '아기', emoji: '👶', theme: 'family', level: 1 },

    // Tier 2: Animals, Nature, Weather, Vehicles & Places
    { en: 'elephant', kr: '코끼리', emoji: '🐘', theme: 'animal', level: 2 },
    { en: 'giraffe', kr: '기린', emoji: '🦒', theme: 'animal', level: 2 },
    { en: 'dolphin', kr: '돌고래', emoji: '🐬', theme: 'animal', level: 2 },
    { en: 'penguin', kr: '펭귄', emoji: '🐧', theme: 'animal', level: 2 },
    { en: 'zebra', kr: '얼룩말', emoji: '🦓', theme: 'animal', level: 2 },
    { en: 'kangaroo', kr: '캥거루', emoji: '🦘', theme: 'animal', level: 2 },
    { en: 'butterfly', kr: '나비', emoji: '🦋', theme: 'animal', level: 2 },
    { en: 'turtle', kr: '거북이', emoji: '🐢', theme: 'animal', level: 2 },
    { en: 'whale', kr: '고래', emoji: '🐋', theme: 'animal', level: 2 },
    { en: 'shark', kr: '상어', emoji: '🦈', theme: 'animal', level: 2 },
    { en: 'library', kr: '도서관', emoji: '📚', theme: 'place', level: 2 },
    { en: 'hospital', kr: '병원', emoji: '🏥', theme: 'place', level: 2 },
    { en: 'museum', kr: '박물관', emoji: '🏛️', theme: 'place', level: 2 },
    { en: 'bakery', kr: '빵집', emoji: '🥐', theme: 'place', level: 2 },
    { en: 'airport', kr: '공항', emoji: '🛫', theme: 'place', level: 2 },
    { en: 'park', kr: '공원', emoji: '🏞️', theme: 'place', level: 1 },
    { en: 'market', kr: '시장', emoji: '🛒', theme: 'place', level: 2 },
    { en: 'umbrella', kr: '우산', emoji: '☂️', theme: 'object', level: 2 },
    { en: 'bicycle', kr: '자전거', emoji: '🚲', theme: 'vehicle', level: 2 },
    { en: 'airplane', kr: '비행기', emoji: '✈️', theme: 'vehicle', level: 2 },
    { en: 'subway', kr: '지하철', emoji: '🚇', theme: 'vehicle', level: 2 },
    { en: 'train', kr: '기차', emoji: '🚆', theme: 'vehicle', level: 1 },
    { en: 'ship', kr: '배(선박)', emoji: '🚢', theme: 'vehicle', level: 2 },
    { en: 'computer', kr: '컴퓨터', emoji: '💻', theme: 'object', level: 2 },
    { en: 'camera', kr: '사진기', emoji: '📷', theme: 'object', level: 2 },
    { en: 'mirror', kr: '거울', emoji: '🪞', theme: 'object', level: 2 },
    { en: 'clock', kr: '시계', emoji: '⏰', theme: 'object', level: 1 },
    { en: 'window', kr: '창문', emoji: '🪟', theme: 'object', level: 1 },

    // Tier 2-3: Nature, Seasons, Time & Meals
    { en: 'morning', kr: '아침', emoji: '🌅', theme: 'time', level: 2 },
    { en: 'afternoon', kr: '오후', emoji: '☀️', theme: 'time', level: 2 },
    { en: 'evening', kr: '저녁', emoji: '🌆', theme: 'time', level: 2 },
    { en: 'night', kr: '밤', emoji: '🌙', theme: 'time', level: 1 },
    { en: 'tomorrow', kr: '내일', emoji: '📅', theme: 'time', level: 2 },
    { en: 'yesterday', kr: '어제', emoji: '⏪', theme: 'time', level: 2 },
    { en: 'breakfast', kr: '아침식사', emoji: '🍳', theme: 'food', level: 2 },
    { en: 'lunch', kr: '점심식사', emoji: '🍱', theme: 'food', level: 2 },
    { en: 'dinner', kr: '저녁식사', emoji: '🍽️', theme: 'food', level: 2 },
    { en: 'rainbow', kr: '무지개', emoji: '🌈', theme: 'nature', level: 2 },
    { en: 'mountain', kr: '산', emoji: '⛰️', theme: 'nature', level: 2 },
    { en: 'river', kr: '강', emoji: '🏞️', theme: 'nature', level: 2 },
    { en: 'ocean', kr: '바다', emoji: '🌊', theme: 'nature', level: 2 },
    { en: 'forest', kr: '숲', emoji: '🌲', theme: 'nature', level: 2 },
    { en: 'island', kr: '섬', emoji: '🏝️', theme: 'nature', level: 3 },
    { en: 'weather', kr: '날씨', emoji: '⛅', theme: 'nature', level: 2 },
    { en: 'cloud', kr: '구름', emoji: '☁️', theme: 'nature', level: 1 },
    { en: 'wind', kr: '바람', emoji: '🌬️', theme: 'nature', level: 1 },
    { en: 'spring', kr: '봄', emoji: '🌸', theme: 'nature', level: 2 },
    { en: 'summer', kr: '여름', emoji: '🌻', theme: 'nature', level: 2 },
    { en: 'autumn', kr: '가을', emoji: '🍁', theme: 'nature', level: 2 },
    { en: 'winter', kr: '겨울', emoji: '⛄', theme: 'nature', level: 2 },

    // Tier 3-4: Adjectives, Verbs, Jobs, Subjects & Abstract Concepts
    { en: 'happy', kr: '행복한', emoji: '😊', theme: 'adjective', level: 1 },
    { en: 'brave', kr: '용감한', emoji: '🦁', theme: 'adjective', level: 2 },
    { en: 'smart', kr: '똑똑한', emoji: '🧠', theme: 'adjective', level: 2 },
    { en: 'fast', kr: '빠른', emoji: '⚡', theme: 'adjective', level: 1 },
    { en: 'slow', kr: '느린', emoji: '🐢', theme: 'adjective', level: 1 },
    { en: 'strong', kr: '강한', emoji: '💪', theme: 'adjective', level: 2 },
    { en: 'kind', kr: '친절한', emoji: '💖', theme: 'adjective', level: 2 },
    { en: 'beautiful', kr: '아름다운', emoji: '✨', theme: 'adjective', level: 3 },
    { en: 'delicious', kr: '맛있는', emoji: '😋', theme: 'adjective', level: 3 },
    { en: 'important', kr: '중요한', emoji: '⭐', theme: 'adjective', level: 3 },
    { en: 'different', kr: '다른', emoji: '🔀', theme: 'adjective', level: 3 },
    { en: 'difficult', kr: '어려운', emoji: '🧩', theme: 'adjective', level: 3 },
    { en: 'easy', kr: '쉬운', emoji: '👌', theme: 'adjective', level: 2 },
    { en: 'healthy', kr: '건강한', emoji: '🥗', theme: 'adjective', level: 3 },
    { en: 'famous', kr: '유명한', emoji: '🌟', theme: 'adjective', level: 3 },
    { en: 'careful', kr: '조심하는', emoji: '⚠️', theme: 'adjective', level: 3 },
    { en: 'police', kr: '경찰', emoji: '👮', theme: 'job', level: 2 },
    { en: 'firefighter', kr: '소방관', emoji: '🧑‍🚒', theme: 'job', level: 3 },
    { en: 'scientist', kr: '과학자', emoji: '🧑‍🔬', theme: 'job', level: 3 },
    { en: 'doctor', kr: '의사', emoji: '🧑‍⚕️', theme: 'job', level: 1 },
    { en: 'pilot', kr: '조종사', emoji: '🧑‍✈️', theme: 'job', level: 2 },
    { en: 'astronaut', kr: '우주비행사', emoji: '🧑‍🚀', theme: 'job', level: 3 },
    { en: 'artist', kr: '예술가/화가', emoji: '🧑‍🎨', theme: 'job', level: 2 },
    { en: 'cook', kr: '요리사', emoji: '🧑‍🍳', theme: 'job', level: 2 },
    { en: 'music', kr: '음악', emoji: '🎵', theme: 'subject', level: 1 },
    { en: 'science', kr: '과학', emoji: '🔬', theme: 'subject', level: 2 },
    { en: 'math', kr: '수학', emoji: '➗', theme: 'subject', level: 1 },
    { en: 'english', kr: '영어', emoji: '🔤', theme: 'subject', level: 1 },
    { en: 'history', kr: '역사', emoji: '📜', theme: 'subject', level: 3 },
    { en: 'question', kr: '질문/문제', emoji: '❓', theme: 'study', level: 2 },
    { en: 'answer', kr: '정답/대답', emoji: '⭕', theme: 'study', level: 2 },
    { en: 'dictionary', kr: '사전', emoji: '📕', theme: 'study', level: 3 },
    { en: 'homework', kr: '숙제', emoji: '📝', theme: 'study', level: 2 },
    { en: 'vacation', kr: '방학/휴가', emoji: '🏖️', theme: 'study', level: 3 },
    { en: 'planet', kr: '행성', emoji: '🪐', theme: 'space', level: 3 },
    { en: 'universe', kr: '우주', emoji: '🌌', theme: 'space', level: 3 },
    { en: 'earth', kr: '지구', emoji: '🌍', theme: 'space', level: 2 },
    { en: 'future', kr: '미래', emoji: '🚀', theme: 'concept', level: 3 },
    { en: 'dream', kr: '꿈', emoji: '💭', theme: 'concept', level: 2 },
    { en: 'promise', kr: '약속', emoji: '🤙', theme: 'concept', level: 3 },
    { en: 'treasure', kr: '보물', emoji: '💎', theme: 'concept', level: 3 },
    { en: 'adventure', kr: '모험', emoji: '🧭', theme: 'concept', level: 3 },
    { en: 'trophy', kr: '트로피', emoji: '🏆', theme: 'concept', level: 2 },
    { en: 'victory', kr: '승리', emoji: '✌️', theme: 'concept', level: 3 },
    { en: 'champion', kr: '챔피언/우승자', emoji: '🥇', theme: 'concept', level: 3 }
  ];

  /**
   * Curated Elementary Conversational / Everyday English Expressions (생활영어 회화 60+ 표현)
   * Bidirectional: EN -> KR ("It's my turn." -> '내 차례야') & KR -> EN ('내 차례야' -> "It's my turn.")
   */
  const DAILY_ENGLISH_EXPRESSIONS = [
    // Level 1: Essential & Frequent Everyday Expressions
    { en: "It's my turn.", kr: '내 차례야', emoji: '🎲', theme: 'turn', level: 1 },
    { en: "It's your turn.", kr: '네 차례야', emoji: '👉', theme: 'turn', level: 1 },
    { en: 'Wait a minute.', kr: '잠시만 기다려', emoji: '⏳', theme: 'daily', level: 1 },
    { en: 'Watch out!', kr: '조심해!', emoji: '⚠️', theme: 'daily', level: 1 },
    { en: 'Good job!', kr: '잘했어!', emoji: '👍', theme: 'praise', level: 1 },
    { en: 'Hurry up!', kr: '서둘러!', emoji: '🏃', theme: 'daily', level: 1 },
    { en: 'Cheer up!', kr: '힘내!', emoji: '💪', theme: 'praise', level: 1 },
    { en: "I'm hungry.", kr: '배고파요', emoji: '🍔', theme: 'feeling', level: 1 },
    { en: "I'm thirsty.", kr: '목말라요', emoji: '🥤', theme: 'feeling', level: 1 },
    { en: "I'm full.", kr: '배불러요', emoji: '😋', theme: 'feeling', level: 1 },
    { en: "I'm ready!", kr: '준비됐어!', emoji: '🚀', theme: 'turn', level: 1 },
    { en: 'Are you ready?', kr: '준비됐니?', emoji: '🏁', theme: 'turn', level: 1 },
    { en: 'Follow me.', kr: '나를 따라와', emoji: '👣', theme: 'daily', level: 1 },
    { en: 'See you later.', kr: '나중에 봐', emoji: '👋', theme: 'greeting', level: 1 },
    { en: 'Wake up!', kr: '일어나!', emoji: '⏰', theme: 'daily', level: 1 },
    { en: "Don't worry.", kr: '걱정하지 마', emoji: '💖', theme: 'praise', level: 1 },
    { en: 'Excuse me.', kr: '실례합니다', emoji: '🙇', theme: 'greeting', level: 1 },
    { en: "Let's go!", kr: '출발하자! / 같이 가자!', emoji: '🏎️', theme: 'turn', level: 1 },

    // Level 2: Practical Elementary School Conversation
    { en: 'Calm down.', kr: '진정해', emoji: '😌', theme: 'feeling', level: 2 },
    { en: 'Have a nice day!', kr: '좋은 하루 보내!', emoji: '☀️', theme: 'greeting', level: 2 },
    { en: 'Go ahead.', kr: '먼저 해 / 어서 해', emoji: '💁', theme: 'turn', level: 2 },
    { en: 'Hold on!', kr: '잠깐만 기다려!', emoji: '✋', theme: 'daily', level: 2 },
    { en: 'Never mind.', kr: '신경 쓰지 마 / 괜찮아', emoji: '🙂', theme: 'opinion', level: 2 },
    { en: 'Of course!', kr: '물론이지!', emoji: '⭕', theme: 'opinion', level: 2 },
    { en: 'No way!', kr: '말도 안 돼!', emoji: '😲', theme: 'feeling', level: 2 },
    { en: 'What time is it?', kr: '지금 몇 시야?', emoji: '⌚', theme: 'question', level: 2 },
    { en: 'How much is it?', kr: '이거 얼마예요?', emoji: '💵', theme: 'shopping', level: 2 },
    { en: 'Where are you going?', kr: '어디 가고 있니?', emoji: '🧭', theme: 'question', level: 2 },
    { en: 'What happened?', kr: '무슨 일 있었어?', emoji: '❓', theme: 'question', level: 2 },
    { en: 'Can you help me?', kr: '나 좀 도와줄래?', emoji: '🤝', theme: 'request', level: 2 },
    { en: 'Do your best!', kr: '최선을 다해!', emoji: '🔥', theme: 'praise', level: 2 },
    { en: 'Take your time.', kr: '천천히 여유 있게 해', emoji: '🐢', theme: 'daily', level: 2 },
    { en: "Let's play together.", kr: '우리 같이 놀자', emoji: '🎮', theme: 'turn', level: 2 },
    { en: 'I think so.', kr: '나도 그렇게 생각해', emoji: '💡', theme: 'opinion', level: 2 },
    { en: 'Sounds great!', kr: '그거 좋은 생각이다!', emoji: '🎵', theme: 'opinion', level: 2 },
    { en: 'You did it!', kr: '네가 해냈어!', emoji: '🏆', theme: 'praise', level: 2 },
    { en: 'Keep going!', kr: '계속 나아가!', emoji: '⚡', theme: 'praise', level: 2 },
    { en: 'Time is up.', kr: '시간이 다 됐어', emoji: '⌛', theme: 'turn', level: 2 },
    { en: 'May I help you?', kr: '무엇을 도와드릴까요?', emoji: '💁‍♀️', theme: 'shopping', level: 2 },
    { en: "How's the weather?", kr: '오늘 날씨가 어때?', emoji: '⛅', theme: 'question', level: 2 },
    { en: "It's sunny today.", kr: '오늘은 날씨가 맑아', emoji: '☀️', theme: 'daily', level: 2 },
    { en: 'Wash your hands.', kr: '손을 깨끗이 씻어라', emoji: '🧼', theme: 'daily', level: 2 },
    { en: 'Brush your teeth.', kr: '양치질을 해라', emoji: '🪥', theme: 'daily', level: 2 },
    { en: 'See you tomorrow.', kr: '내일 만나자', emoji: '📅', theme: 'greeting', level: 2 },

    // Level 3: Advanced Elementary Conversational Expressions
    { en: 'I have no idea.', kr: '전혀 모르겠어', emoji: '🤷', theme: 'opinion', level: 3 },
    { en: "It's up to you.", kr: '네 마음대로 해 (너에게 달렸어)', emoji: '✨', theme: 'opinion', level: 3 },
    { en: 'Make yourself at home.', kr: '내 집처럼 편하게 있어', emoji: '🏠', theme: 'daily', level: 3 },
    { en: "That's too bad.", kr: '그거 참 안됐다 / 아쉽네', emoji: '😢', theme: 'feeling', level: 3 },
    { en: 'Long time no see.', kr: '정말 오랜만이야', emoji: '🙌', theme: 'greeting', level: 3 },
    { en: 'Put on your coat.', kr: '외투(코트)를 입어라', emoji: '🧥', theme: 'daily', level: 3 },
    { en: 'Turn off the light.', kr: '불을 꺼 줘', emoji: '💡', theme: 'request', level: 3 },
    { en: 'I agree with you.', kr: '네 말에 동의해', emoji: '👌', theme: 'opinion', level: 3 },
    { en: 'Count on me!', kr: '나만 믿어!', emoji: '😎', theme: 'praise', level: 3 },
    { en: 'Give it a try!', kr: '한번 시도해 봐!', emoji: '🎯', theme: 'praise', level: 3 },
    { en: "I'm looking for my bag.", kr: '내 가방을 찾고 있어요', emoji: '🎒', theme: 'daily', level: 3 },
    { en: "What's your favorite food?", kr: '가장 좋아하는 음식이 뭐야?', emoji: '🍕', theme: 'question', level: 3 },
    { en: 'Can I try this on?', kr: '이거 입어 봐도 될까요?', emoji: '👗', theme: 'shopping', level: 3 },
    { en: 'Keep your promise.', kr: '약속을 꼭 지켜라', emoji: '🤙', theme: 'daily', level: 3 }
  ];

  // Track recent prompts to prevent immediate back-to-back duplicates
  const _recentIds = [];
  const MAX_RECENT = 10;
  let _currentQuestion = null;

  // Spaced repetition counter: when wrongAnswerQueue has items, serve a review question every 2nd question
  const REVIEW_INTERVAL = 2;
  let _questionsSinceLastReview = 0;

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function shuffleArray(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function rememberQuestionId(id) {
    if (!id) return;
    _recentIds.push(id);
    if (_recentIds.length > MAX_RECENT) {
      _recentIds.shift();
    }
  }

  /**
   * Builds a 3-choice lane array and returns { choices, correctLane }
   */
  function buildThreeLaneChoices(correctAnswerStr, distractor1Str, distractor2Str) {
    const raw = [
      { text: String(correctAnswerStr), isCorrect: true },
      { text: String(distractor1Str), isCorrect: false },
      { text: String(distractor2Str), isCorrect: false }
    ];
    const shuffled = shuffleArray(raw);
    const choices = shuffled.map(function (item) { return item.text; });
    const correctLane = shuffled.findIndex(function (item) { return item.isCorrect; });
    return {
      choices: choices,
      correctLane: correctLane !== -1 ? correctLane : 0
    };
  }

  /**
   * Generates plausible elementary math distractors for +, -, ×, ÷
   * Strictly positive (>= 2) and distinct from correctAnswer.
   */
  function generateMathDistractors(correctVal, a, b, opType) {
    const candidates = [];

    if (opType === 'multiplication') {
      // Multiplication distractors: off by +-a, +-b, +-10, +-2, +-1
      candidates.push(correctVal + a);
      candidates.push(correctVal - a);
      candidates.push(correctVal + b);
      candidates.push(correctVal - b);
      candidates.push(correctVal + 10);
      candidates.push(correctVal - 10);
      candidates.push(correctVal + 2);
      candidates.push(correctVal - 2);
      candidates.push(correctVal + 1);
      candidates.push(correctVal - 1);
    } else if (opType === 'division') {
      // Division distractors: off by +-1, +-2, +-3, +-4, +-10
      candidates.push(correctVal + 1);
      candidates.push(correctVal - 1);
      candidates.push(correctVal + 2);
      candidates.push(correctVal - 2);
      candidates.push(correctVal + 3);
      candidates.push(correctVal - 3);
      candidates.push(correctVal + 4);
      candidates.push(correctVal - 4);
      candidates.push(correctVal + 10);
      candidates.push(correctVal - 10);
    } else {
      const isAddition = (opType === 'addition' || opType === true);
      // 1. Ten's place carry/borrow mistake (+10 or -10)
      candidates.push(correctVal + 10);
      candidates.push(correctVal - 10);
      // 2. One's place counting mistake (+1, -1, +2, -2)
      candidates.push(correctVal + 1);
      candidates.push(correctVal - 1);
      candidates.push(correctVal + 2);
      candidates.push(correctVal - 2);
      // 3. Subtracting smaller ones digit from larger ones digit in subtraction
      if (!isAddition && (a % 10) < (b % 10)) {
        const borrowMistake = (Math.floor(a / 10) - Math.floor(b / 10)) * 10 + ((b % 10) - (a % 10));
        candidates.push(borrowMistake);
      }
      // 4. Forgetting carry in addition
      if (isAddition && ((a % 10) + (b % 10) >= 10)) {
        candidates.push(correctVal - 10);
      }
      // 5. Off by +-3 or +-9
      candidates.push(correctVal + 9);
      candidates.push(correctVal - 9);
      candidates.push(correctVal + 3);
      candidates.push(correctVal - 3);
    }

    const validDistinct = [];
    const shuffledCandidates = shuffleArray(candidates);
    for (let i = 0; i < shuffledCandidates.length; i++) {
      const val = shuffledCandidates[i];
      if (val >= 2 && val !== correctVal && !validDistinct.includes(val)) {
        validDistinct.push(val);
        if (validDistinct.length >= 2) break;
      }
    }

    // Fallback safety
    let offset = 1;
    while (validDistinct.length < 2) {
      const fallback = correctVal + offset;
      if (fallback >= 2 && fallback !== correctVal && !validDistinct.includes(fallback)) {
        validDistinct.push(fallback);
      }
      offset = offset > 0 ? -offset : (-offset + 1);
    }

    return [String(validDistinct[0]), String(validDistinct[1])];
  }

  /**
   * Generates an Elementary Math question:
   * - As stages go up, mixes Division (나눗셈 ÷) and Simple Multiplication beyond 9x9 (구구단 밖 간단한 곱셈 ×),
   *   alongside 2-digit Addition (+) and Subtraction (-).
   */
  function generateMathQuestion(stageNum) {
    const stage = Math.max(1, parseInt(stageNum, 10) || 1);

    // Stage-scaled operation probabilities:
    // Higher stages increasingly feature multiplication (beyond 9x9) and division!
    const roll = Math.random();
    let chosenOp = 'addition';
    if (stage === 1) {
      if (roll < 0.25) chosenOp = 'multiplication';
      else if (roll < 0.50) chosenOp = 'division';
      else if (roll < 0.76) chosenOp = 'addition';
      else chosenOp = 'subtraction';
    } else if (stage === 2) {
      if (roll < 0.34) chosenOp = 'multiplication';
      else if (roll < 0.68) chosenOp = 'division';
      else if (roll < 0.85) chosenOp = 'addition';
      else chosenOp = 'subtraction';
    } else if (stage === 3) {
      if (roll < 0.38) chosenOp = 'multiplication';
      else if (roll < 0.76) chosenOp = 'division';
      else if (roll < 0.88) chosenOp = 'addition';
      else chosenOp = 'subtraction';
    } else {
      if (roll < 0.42) chosenOp = 'multiplication';
      else if (roll < 0.84) chosenOp = 'division';
      else if (roll < 0.92) chosenOp = 'addition';
      else chosenOp = 'subtraction';
    }

    let a = 20;
    let b = 15;
    let answerVal = 35;
    let opSymbol = '+';
    let subType = chosenOp;
    let categoryLabel = '초등 수학 · 두 자리 덧셈';
    let subPrompt = '연산의 정답 게이트로 차선을 변경하세요!';

    for (let attempt = 0; attempt < 25; attempt++) {
      if (chosenOp === 'multiplication') {
        opSymbol = '×';
        subType = 'multiplication';
        categoryLabel = '초등 수학 · 구구단 밖 간단 곱셈';
        subPrompt = '구구단을 벗어나는 간단한 곱셈! 정답 레인으로 달리세요!';

        // Micro-gradual difficulty progression across stages (capped at diffStep = 10)
        const diffStep = Math.min(10, Math.floor((stage - 1) * 0.6));
        if (diffStep <= 1) {
          const easyPoolA = [11, 12, 13, 14, 15, 20, 21, 22, 30];
          a = easyPoolA[randomInt(0, easyPoolA.length - 1)];
          b = randomInt(2, 3);
        } else if (diffStep <= 3) {
          const medPoolA = [11, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22, 24, 25, 30];
          a = medPoolA[randomInt(0, medPoolA.length - 1)];
          b = a >= 22 ? randomInt(2, 3) : randomInt(2, 4);
        } else {
          const maxA = Math.min(30, 16 + diffStep);
          a = randomInt(11, maxA);
          b = a >= 24 ? randomInt(2, 3) : (a >= 18 ? randomInt(2, 4) : randomInt(2, Math.min(6, 3 + Math.floor(diffStep / 3))));
        }
        answerVal = a * b;
      } else if (chosenOp === 'division') {
        opSymbol = '÷';
        subType = 'division';
        categoryLabel = '초등 수학 · 나눗셈 퀴즈';
        subPrompt = '나누어떨어지는 나눗셈의 몫을 찾아 차선을 변경하세요!';

        // Micro-gradual exact division (a = b * quotient) with safe upper cap
        const diffStep = Math.min(10, Math.floor((stage - 1) * 0.6));
        const maxB = Math.min(9, 4 + Math.floor(diffStep * 0.5));
        const minQ = Math.min(8, 3 + Math.floor(diffStep * 0.4));
        const maxQ = Math.min(20, 10 + diffStep);
        b = randomInt(2, maxB);
        const quotient = randomInt(minQ, maxQ);
        a = b * quotient;
        answerVal = quotient;
      } else if (chosenOp === 'addition') {
        opSymbol = '+';
        subType = 'addition';
        categoryLabel = '초등 수학 · 두 자리 덧셈';
        subPrompt = '두 자리 덧셈의 정답 게이트로 차선을 변경하세요!';

        // Micro-gradual 2-digit addition with gentle carry probability and cap
        const diffStep = Math.min(12, stage - 1);
        const maxNum = Math.min(79, 25 + diffStep * 4);
        const carryProb = Math.min(0.7, 0.15 + diffStep * 0.045);
        a = randomInt(11, maxNum);
        if (Math.random() > carryProb) {
          const maxOnesB = Math.max(0, 9 - (a % 10));
          const maxTensB = Math.max(1, Math.min(4, Math.floor((maxNum - 10) / 10)));
          b = randomInt(1, maxTensB) * 10 + randomInt(0, maxOnesB);
        } else {
          b = randomInt(11, Math.min(59, maxNum));
        }
        answerVal = a + b;
      } else {
        opSymbol = '-';
        subType = 'subtraction';
        categoryLabel = '초등 수학 · 두 자리 뺄셈';
        subPrompt = '두 자리 뺄셈의 정답 게이트로 차선을 변경하세요!';

        // Micro-gradual 2-digit subtraction with gentle borrow probability and cap
        const diffStep = Math.min(12, stage - 1);
        const maxNum = Math.min(89, 32 + diffStep * 4);
        const borrowProb = Math.min(0.7, 0.15 + diffStep * 0.045);
        a = randomInt(24, maxNum);
        if (Math.random() > borrowProb && (a % 10) >= 1) {
          const tensA = Math.floor(a / 10);
          const onesA = a % 10;
          const tensB = randomInt(1, Math.max(1, tensA - 1));
          const onesB = randomInt(0, onesA);
          b = tensB * 10 + onesB;
        } else {
          b = randomInt(11, a - 6);
        }

        if (b < 10) b = 10;
        if (a <= b + 1) a = Math.min(99, b + randomInt(5, 18));
        answerVal = a - b;
      }

      const candidateId = `math_${subType}_${a}_${b}`;
      if (!_recentIds.includes(candidateId)) {
        rememberQuestionId(candidateId);
        break;
      }
    }

    const answerStr = String(answerVal);
    const distractors = generateMathDistractors(answerVal, a, b, subType);
    const laneData = buildThreeLaneChoices(answerStr, distractors[0], distractors[1]);

    return {
      id: `math_${subType}_${a}_${b}`,
      category: 'math',
      categoryLabel: categoryLabel,
      subType: subType,
      stage: stage,
      prompt: `🧮 ${a} ${opSymbol} ${b} = ?`,
      subPrompt: subPrompt,
      choices: laneData.choices,
      correctLane: laneData.correctLane,
      answerText: answerStr,
      correctAnswer: answerStr,
      isReview: false,
      wrongCount: 0
    };
  }

  /**
   * Generates a bidirectional Elementary Conversational English (생활영어 회화) question
   * e.g., "It's my turn." -> '내 차례야' OR '내 차례야' -> "It's my turn."
   */
  function generateDailyEnglishQuestion(stageNum) {
    const stage = Math.max(1, parseInt(stageNum, 10) || 1);
    const maxExprLevel = stage <= 3 ? 1 : (stage <= 7 ? 2 : 3);
    const eligiblePool = DAILY_ENGLISH_EXPRESSIONS.filter(function (item) {
      return item.level <= maxExprLevel;
    });

    let targetExpr = eligiblePool[randomInt(0, eligiblePool.length - 1)];
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = eligiblePool[randomInt(0, eligiblePool.length - 1)];
      const candidateId = `expr_${candidate.en}`;
      if (!_recentIds.includes(candidateId)) {
        targetExpr = candidate;
        rememberQuestionId(candidateId);
        break;
      }
    }

    const sameThemePool = DAILY_ENGLISH_EXPRESSIONS.filter(function (item) {
      return item.en !== targetExpr.en && item.kr !== targetExpr.kr && item.theme === targetExpr.theme;
    });
    const otherPool = DAILY_ENGLISH_EXPRESSIONS.filter(function (item) {
      return item.en !== targetExpr.en && item.kr !== targetExpr.kr && item.theme !== targetExpr.theme;
    });

    const combinedDistractorPool = shuffleArray(sameThemePool).concat(shuffleArray(otherPool));
    const distractorExprs = [combinedDistractorPool[0], combinedDistractorPool[1]];

    const isKrToEn = Math.random() < 0.5;
    const emojiPrefix = targetExpr.emoji ? `${targetExpr.emoji} ` : '💬 ';

    if (isKrToEn) {
      const answerStr = targetExpr.en;
      const laneData = buildThreeLaneChoices(
        answerStr,
        distractorExprs[0].en,
        distractorExprs[1].en
      );

      return {
        id: `expr_kr2en_${targetExpr.en}`,
        category: 'english',
        categoryLabel: '실전 생활영어 · 한영 회화 퀴즈',
        subType: 'expr_kr_to_en',
        stage: stage,
        prompt: `${emojiPrefix}"${targetExpr.kr}"를 영어로 하면?`,
        subPrompt: '알맞은 생활영어 표현이 적힌 레인으로 달리세요!',
        choices: laneData.choices,
        correctLane: laneData.correctLane,
        answerText: answerStr,
        correctAnswer: answerStr,
        isReview: false,
        wrongCount: 0
      };
    } else {
      const answerStr = targetExpr.kr;
      const laneData = buildThreeLaneChoices(
        answerStr,
        distractorExprs[0].kr,
        distractorExprs[1].kr
      );

      return {
        id: `expr_en2kr_${targetExpr.en}`,
        category: 'english',
        categoryLabel: '실전 생활영어 · 영한 뜻 퀴즈',
        subType: 'expr_en_to_kr',
        stage: stage,
        prompt: `${emojiPrefix}"${targetExpr.en}"의 알맞은 뜻은?`,
        subPrompt: '알맞은 한글 뜻이 적힌 레인으로 달리세요!',
        choices: laneData.choices,
        correctLane: laneData.correctLane,
        answerText: answerStr,
        correctAnswer: answerStr,
        isReview: false,
        wrongCount: 0
      };
    }
  }

  /**
   * Stage-progressive English Pronunciation (Speaking) Word List (Starts from Stage 3 with easy words!)
   */
  const PRONUNCIATION_WORDS = [
    // Tier 1 (Stage 3~4): Very Easy, Short, Clear Words (3~6 letters)
    { en: 'dog', kr: '강아지', pron: '독', emoji: '🐶', level: 1, aliases: ['dogs', 'dug', 'dock', 'dawg', '도그', '독', '강아지'] },
    { en: 'cat', kr: '고양이', pron: '캣', emoji: '🐱', level: 1, aliases: ['cats', 'cut', 'ket', 'kat', 'cap', '캣', '고양이'] },
    { en: 'apple', kr: '사과', pron: '애플', emoji: '🍎', level: 1, aliases: ['apples', 'epple', 'aple', '애플', '사과'] },
    { en: 'milk', kr: '우유', pron: '밀크', emoji: '🥛', level: 1, aliases: ['milks', 'mill', '밀크', '우유'] },
    { en: 'book', kr: '책', pron: '북', emoji: '📖', level: 1, aliases: ['books', 'look', 'cook', '북', '책'] },
    { en: 'banana', kr: '바나나', pron: '바나나', emoji: '🍌', level: 1, aliases: ['bananas', '바나나'] },
    { en: 'water', kr: '물', pron: '워터', emoji: '💧', level: 1, aliases: ['waters', 'what a', '워터', '와터', '물'] },
    { en: 'happy', kr: '행복한', pron: '해피', emoji: '😊', level: 1, aliases: ['happi', 'heavy', '해피'] },
    { en: 'tiger', kr: '호랑이', pron: '타이거', emoji: '🐯', level: 1, aliases: ['tigers', '타이거', '호랑이'] },
    { en: 'lion', kr: '사자', pron: '라이언', emoji: '🦁', level: 1, aliases: ['lions', 'line', 'ryan', '라이언', '사자'] },
    { en: 'bear', kr: '곰', pron: '베어', emoji: '🐻', level: 1, aliases: ['bears', 'bare', 'beer', 'pear', '베어', '곰'] },
    { en: 'duck', kr: '오리', pron: '덕', emoji: '🦆', level: 1, aliases: ['ducks', 'dark', 'dock', '덕', '더크', '오리'] },
    { en: 'bird', kr: '새', pron: '버드', emoji: '🐦', level: 1, aliases: ['birds', 'board', 'bud', '버드', '새'] },
    { en: 'fish', kr: '물고기', pron: '피쉬', emoji: '🐟', level: 1, aliases: ['fishes', 'dish', '피쉬', '피시', '물고기'] },
    { en: 'baby', kr: '아기', pron: '베이비', emoji: '👶', level: 1, aliases: ['babies', '베이비', '아기'] },
    { en: 'park', kr: '공원', pron: '파크', emoji: '🏞️', level: 1, aliases: ['parks', 'bark', 'part', '파크', '공원'] },
    { en: 'bag', kr: '가방', pron: '백', emoji: '🎒', level: 1, aliases: ['bags', 'back', 'bad', 'bed', '백', '배그', '가방'] },
    { en: 'desk', kr: '책상', pron: '데스크', emoji: '🪑', level: 1, aliases: ['desks', 'disk', '데스크', '책상'] },
    { en: 'clock', kr: '시계', pron: '클락', emoji: '⏰', level: 1, aliases: ['clocks', 'club', 'lock', '클락', '클록', '시계'] },
    { en: 'music', kr: '음악', pron: '뮤직', emoji: '🎵', level: 1, aliases: ['뮤직', '음악'] },
    { en: 'school', kr: '학교', pron: '스쿨', emoji: '🏫', level: 1, aliases: ['schools', 'cool', '스쿨', '학교'] },
    { en: 'bread', kr: '빵', pron: '브레드', emoji: '🍞', level: 1, aliases: ['red', 'bed', '브레드', '빵'] },
    { en: 'cheese', kr: '치즈', pron: '치즈', emoji: '🧀', level: 1, aliases: ['cheeses', '치즈'] },
    { en: 'grape', kr: '포도', pron: '그레이프', emoji: '🍇', level: 1, aliases: ['grapes', 'great', '그레이프', '포도'] },
    { en: 'peach', kr: '복숭아', pron: '피치', emoji: '🍑', level: 1, aliases: ['peaches', 'beach', 'pitch', '피치', '복숭아'] },

    // Tier 2 (Stage 5~7): Medium Elementary Words
    { en: 'rabbit', kr: '토끼', pron: '래빗', emoji: '🐰', level: 2, aliases: ['rabbits', 'habit', '래빗', '레빗', '토끼'] },
    { en: 'monkey', kr: '원숭이', pron: '멍키', emoji: '🐵', level: 2, aliases: ['monkeys', '멍키', '몽키', '원숭이'] },
    { en: 'orange', kr: '오렌지', pron: '오렌지', emoji: '🍊', level: 2, aliases: ['oranges', '오렌지'] },
    { en: 'lemon', kr: '레몬', pron: '레몬', emoji: '🍋', level: 2, aliases: ['lemons', '레몬'] },
    { en: 'pencil', kr: '연필', pron: '펜슬', emoji: '✏️', level: 2, aliases: ['pencils', '펜슬', '연필'] },
    { en: 'family', kr: '가족', pron: '패밀리', emoji: '👨‍👩‍👧‍👦', level: 2, aliases: ['families', '패밀리', '페밀리', '가족'] },
    { en: 'mother', kr: '어머니', pron: '마더', emoji: '👩', level: 2, aliases: ['mothers', '마더', '엄마', '어머니'] },
    { en: 'father', kr: '아버지', pron: '파더', emoji: '👨', level: 2, aliases: ['fathers', '파더', '아빠', '아버지'] },
    { en: 'friend', kr: '친구', pron: '프렌드', emoji: '🤝', level: 2, aliases: ['friends', '프렌드', '친구'] },
    { en: 'doctor', kr: '의사', pron: '닥터', emoji: '🧑‍⚕️', level: 2, aliases: ['doctors', '닥터', '의사'] },
    { en: 'summer', kr: '여름', pron: '서머', emoji: '🌻', level: 2, aliases: ['서머', '썸머', '여름'] },
    { en: 'winter', kr: '겨울', pron: '윈터', emoji: '⛄', level: 2, aliases: ['윈터', '겨울'] },
    { en: 'rainbow', kr: '무지개', pron: '레인보우', emoji: '🌈', level: 2, aliases: ['rainbows', 'rain', '레인보우', '무지개'] },
    { en: 'morning', kr: '아침', pron: '모닝', emoji: '🌅', level: 2, aliases: ['mornings', '모닝', '아침'] },
    { en: 'window', kr: '창문', pron: '윈도우', emoji: '🪟', level: 2, aliases: ['windows', '윈도우', '창문'] },
    { en: 'camera', kr: '사진기', pron: '카메라', emoji: '📷', level: 2, aliases: ['cameras', '카메라', '사진기'] },
    { en: 'teacher', kr: '선생님', pron: '티처', emoji: '👩‍🏫', level: 2, aliases: ['teachers', '티처', '선생님'] },
    { en: 'dolphin', kr: '돌고래', pron: '돌핀', emoji: '🐬', level: 2, aliases: ['dolphins', '돌핀', '돌고래'] },
    { en: 'penguin', kr: '펭귄', pron: '펭귄', emoji: '🐧', level: 2, aliases: ['penguins', '펭귄'] },

    // Tier 3 (Stage 8+): Longer Elementary Words
    { en: 'elephant', kr: '코끼리', pron: '엘리펀트', emoji: '🐘', level: 3, aliases: ['elephants', '엘리펀트', '코끼리'] },
    { en: 'butterfly', kr: '나비', pron: '버터플라이', emoji: '🦋', level: 3, aliases: ['butterflies', 'butter', '버터플라이', '나비'] },
    { en: 'hospital', kr: '병원', pron: '하스피털', emoji: '🏥', level: 3, aliases: ['hospitals', '하스피털', '호스피탈', '병원'] },
    { en: 'airplane', kr: '비행기', pron: '에어플레인', emoji: '✈️', level: 3, aliases: ['airplanes', 'plane', '에어플레인', '비행기'] },
    { en: 'computer', kr: '컴퓨터', pron: '컴퓨터', emoji: '💻', level: 3, aliases: ['computers', '컴퓨터'] },
    { en: 'umbrella', kr: '우산', pron: '엄브렐러', emoji: '☂️', level: 3, aliases: ['umbrellas', '엄브렐러', '엄브렐라', '우산'] },
    { en: 'champion', kr: '챔피언', pron: '챔피언', emoji: '🥇', level: 3, aliases: ['champions', '챔피언'] },
    { en: 'adventure', kr: '모험', pron: '어드벤처', emoji: '🧭', level: 3, aliases: ['adventures', '어드벤처', '모험'] }
  ];

  function levenshteinDistance(a, b) {
    const s = String(a || '');
    const t = String(b || '');
    if (!s.length) return t.length;
    if (!t.length) return s.length;
    const dp = [];
    for (let i = 0; i <= s.length; i++) {
      dp[i] = [i];
    }
    for (let j = 0; j <= t.length; j++) {
      dp[0][j] = j;
    }
    for (let i = 1; i <= s.length; i++) {
      for (let j = 1; j <= t.length; j++) {
        const cost = s[i - 1] === t[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }
    return dp[s.length][t.length];
  }

  /**
   * Generates a Microphone English Speaking / Pronunciation Question (Starts at Stage 3+)
   * Does not require moving to lane 1, 2, or 3 — Soyun speaks the word into the mic to pass!
   */
  function generatePronunciationQuestion(stageNum) {
    const stage = Math.max(3, parseInt(stageNum, 10) || 3);
    // Start with easy Tier 1 words in Stage 3~4, Tier 1~2 in Stage 5~7, Tier 1~3 in Stage 8+
    const maxLevel = stage <= 4 ? 1 : (stage <= 7 ? 2 : 3);
    const eligiblePool = PRONUNCIATION_WORDS.filter(function (w) {
      return w.level <= maxLevel;
    });

    let target = eligiblePool[randomInt(0, eligiblePool.length - 1)];
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = eligiblePool[randomInt(0, eligiblePool.length - 1)];
      const candidateId = `speech_${candidate.en}`;
      if (!_recentIds.includes(candidateId)) {
        target = candidate;
        rememberQuestionId(candidateId);
        break;
      }
    }

    const upperWord = target.en.toUpperCase();
    const gateSignText = `🎤 ${target.en}`;

    return {
      id: `speech_${target.en}`,
      category: 'english',
      categoryLabel: '🎙️ 영어 스피킹 · 발음 관문',
      subType: 'pronunciation',
      isSpeech: true,
      speechPassed: false,
      targetWord: target.en,
      targetKr: target.kr,
      targetPron: target.pron,
      speechAliases: target.aliases || [],
      stage: stage,
      prompt: `🎤 영어로 말해요: "${upperWord}" [${target.pron}] (${target.emoji} ${target.kr})`,
      subPrompt: `🎙️ 레인 상관없이 마이크에 "${target.en}" [${target.pron}] 라고 소리 내어 말하면 통과!`,
      choices: [gateSignText, gateSignText, gateSignText],
      correctLane: -1, // Any lane passes once spoken!
      answerText: target.en,
      correctAnswer: target.en,
      isReview: false,
      wrongCount: 0
    };
  }

  /**
   * Generates a bidirectional Elementary English question (Vocabulary, Conversational 생활영어, or Stage 3+ Pronunciation!).
   * As stages go up, the share of Conversational 생활영어 increases!
   */
  function generateEnglishQuestion(stageNum) {
    const stage = Math.max(1, parseInt(stageNum, 10) || 1);

    // Stage 3+: Include Microphone English Pronunciation Questions (~32% of English questions)
    if (stage >= 3 && Math.random() < 0.32) {
      return generatePronunciationQuestion(stage);
    }

    // Probability of Everyday Conversational English (생활영어) scales up micro-gradually with stage (30% -> 68% max)
    const dailyExprProb = Math.min(0.68, 0.30 + (stage - 1) * 0.04);
    if (Math.random() < dailyExprProb) {
      return generateDailyEnglishQuestion(stage);
    }

    // Filter pool based on stage (Stage 1~3: level 1, Stage 4~7: level 1-2, Stage 8+: level 1-3)
    const maxWordLevel = stage <= 3 ? 1 : (stage <= 7 ? 2 : 3);
    const eligiblePool = ENGLISH_DICTIONARY.filter(function (w) {
      return w.level <= maxWordLevel;
    });

    let targetWord = eligiblePool[randomInt(0, eligiblePool.length - 1)];
    for (let attempt = 0; attempt < 25; attempt++) {
      const candidate = eligiblePool[randomInt(0, eligiblePool.length - 1)];
      const candidateId = `eng_${candidate.en}`;
      if (!_recentIds.includes(candidateId)) {
        targetWord = candidate;
        rememberQuestionId(candidateId);
        break;
      }
    }

    // Prefer distractors from the same theme first for realistic educational challenge
    const sameThemePool = ENGLISH_DICTIONARY.filter(function (w) {
      return w.en !== targetWord.en && w.kr !== targetWord.kr && w.theme === targetWord.theme;
    });
    const otherPool = ENGLISH_DICTIONARY.filter(function (w) {
      return w.en !== targetWord.en && w.kr !== targetWord.kr && w.theme !== targetWord.theme;
    });

    const combinedDistractorPool = shuffleArray(sameThemePool).concat(shuffleArray(otherPool));
    const distractorWords = [combinedDistractorPool[0], combinedDistractorPool[1]];

    // 50% KR -> EN, 50% EN -> KR
    const isKrToEn = Math.random() < 0.5;
    const emojiPrefix = targetWord.emoji ? `${targetWord.emoji} ` : '🔤 ';

    if (isKrToEn) {
      const answerStr = targetWord.en;
      const laneData = buildThreeLaneChoices(
        answerStr,
        distractorWords[0].en,
        distractorWords[1].en
      );

      return {
        id: `eng_kr2en_${targetWord.en}`,
        category: 'english',
        categoryLabel: '초등 영어 · 한영 어휘 퀴즈',
        subType: 'kr_to_en',
        stage: stage,
        prompt: `${emojiPrefix}'${targetWord.kr}'의 영어 단어는?`,
        subPrompt: '알맞은 영어 단어가 있는 레인으로 달리세요!',
        choices: laneData.choices,
        correctLane: laneData.correctLane,
        answerText: answerStr,
        correctAnswer: answerStr,
        isReview: false,
        wrongCount: 0
      };
    } else {
      const answerStr = targetWord.kr;
      const laneData = buildThreeLaneChoices(
        answerStr,
        distractorWords[0].kr,
        distractorWords[1].kr
      );

      return {
        id: `eng_en2kr_${targetWord.en}`,
        category: 'english',
        categoryLabel: '초등 영어 · 영한 뜻 퀴즈',
        subType: 'en_to_kr',
        stage: stage,
        prompt: `${emojiPrefix}'${targetWord.en}'의 알맞은 뜻은?`,
        subPrompt: '알맞은 한글 뜻이 있는 레인으로 달리세요!',
        choices: laneData.choices,
        correctLane: laneData.correctLane,
        answerText: answerStr,
        correctAnswer: answerStr,
        isReview: false,
        wrongCount: 0
      };
    }
  }

  /**
   * Re-hydrates a saved wrong question from wrongAnswerQueue, re-shuffling the 3 lane choices
   * so the student must know the actual answer rather than memorizing the lane number.
   */
  function buildReviewQuestionFromQueueItem(queuedItem, stageNum) {
    const answerStr = String(
      queuedItem.answerText !== undefined
        ? queuedItem.answerText
        : (queuedItem.correctAnswer !== undefined ? queuedItem.correctAnswer : '')
    );

    const isSpeechItem =
      queuedItem.subType === 'pronunciation' ||
      Boolean(queuedItem.isSpeech) ||
      String(queuedItem.id || '').startsWith('speech_');

    if (isSpeechItem) {
      const lowerAns = answerStr.toLowerCase().trim();
      const matchedEntry = PRONUNCIATION_WORDS.find(function (w) {
        return w.en.toLowerCase() === lowerAns;
      }) || { en: lowerAns, kr: '', pron: lowerAns, emoji: '🎤', aliases: [] };
      const gateSignText = `🎤 ${matchedEntry.en}`;
      const cleanSpeechPrompt = String(queuedItem.prompt || '').replace(/^\[오답\s*복습\]\s*/i, '');
      return {
        id: queuedItem.id || `speech_${matchedEntry.en}`,
        category: 'english',
        categoryLabel: '🔄 오답 복습 · 영어 스피킹 발음',
        subType: 'pronunciation',
        isSpeech: true,
        speechPassed: false,
        targetWord: matchedEntry.en,
        targetKr: matchedEntry.kr,
        targetPron: matchedEntry.pron,
        speechAliases: matchedEntry.aliases || [],
        stage: stageNum || 3,
        prompt: cleanSpeechPrompt || `🎤 영어로 말해요: "${matchedEntry.en.toUpperCase()}" [${matchedEntry.pron}] (${matchedEntry.emoji} ${matchedEntry.kr})`,
        subPrompt: `🎙️ 아까 놓쳤던 발음 문제! 마이크에 "${matchedEntry.en}" [${matchedEntry.pron}] 라고 말하면 통과!`,
        choices: [gateSignText, gateSignText, gateSignText],
        correctLane: -1,
        answerText: matchedEntry.en,
        correctAnswer: matchedEntry.en,
        isReview: true,
        wrongCount: queuedItem.wrongCount || 1
      };
    }

    // Extract the 2 distractors from saved choices, or generate fresh distractors if needed
    let distractors = [];
    if (Array.isArray(queuedItem.choices)) {
      distractors = queuedItem.choices
        .map(String)
        .filter(function (c) { return c !== answerStr; });
    }
    const isExpr = String(queuedItem.id || '').startsWith('expr_') || String(queuedItem.subType || '').startsWith('expr_');
    while (distractors.length < 2) {
      if (queuedItem.category === 'math') {
        const numVal = parseInt(answerStr, 10) || 50;
        const fallbackVal = numVal + (distractors.length === 0 ? 10 : -1);
        distractors.push(String(Math.max(2, fallbackVal)));
      } else if (isExpr) {
        const fallbackExpr = DAILY_ENGLISH_EXPRESSIONS[randomInt(0, DAILY_ENGLISH_EXPRESSIONS.length - 1)];
        const candidate = /^[a-zA-Z\s',.!?-]+$/.test(answerStr) ? fallbackExpr.en : fallbackExpr.kr;
        if (candidate !== answerStr && !distractors.includes(candidate)) {
          distractors.push(candidate);
        }
      } else {
        const fallbackWord = ENGLISH_DICTIONARY[randomInt(0, ENGLISH_DICTIONARY.length - 1)];
        const candidate = /^[a-zA-Z\s-]+$/.test(answerStr) ? fallbackWord.en : fallbackWord.kr;
        if (candidate !== answerStr && !distractors.includes(candidate)) {
          distractors.push(candidate);
        }
      }
    }

    const laneData = buildThreeLaneChoices(answerStr, distractors[0], distractors[1]);
    const cleanPrompt = String(queuedItem.prompt || '').replace(/^\[오답\s*복습\]\s*/i, '');

    return {
      id: queuedItem.id || `review_${Date.now()}`,
      category: queuedItem.category || 'math',
      categoryLabel: queuedItem.category === 'english'
        ? (isExpr ? '🔄 오답 복습 · 실전 생활영어' : '🔄 오답 복습 · 초등 영단어')
        : '🔄 오답 복습 · 초등 수학 연산',
      subType: queuedItem.subType || 'review',
      stage: stageNum || 1,
      prompt: cleanPrompt,
      subPrompt: '⚠️ 이전에 틀렸던 문제입니다! 다시 도전해 마스터하세요!',
      choices: laneData.choices,
      correctLane: laneData.correctLane,
      answerText: answerStr,
      correctAnswer: answerStr,
      isReview: true,
      wrongCount: queuedItem.wrongCount || 1
    };
  }

  const QuestionEngine = {
    /**
     * Generates the next question for the current stage and subjectMode.
     * Automatically prioritizes spaced-repetition review questions from SaveManager.wrongAnswerQueue
     * every 2nd question (or immediately if options.forceReview is true).
     *
     * @param {number|Object} [stageOrOpts]
     * @param {string} [subjectModeArg]
     * @param {Object} [optionsArg]
     * @returns {Object} Question object
     */
    nextQuestion: function (stageOrOpts, subjectModeArg, optionsArg) {
      const saveState = (window.SaveManager && window.SaveManager.getState)
        ? window.SaveManager.getState()
        : null;

      let stage = saveState ? saveState.currentStage : 1;
      let subjectMode = saveState ? saveState.subjectMode : 'mixed';
      let options = {};

      if (typeof stageOrOpts === 'object' && stageOrOpts !== null) {
        options = stageOrOpts;
        if (options.stage !== undefined) stage = options.stage;
        if (options.subjectMode !== undefined) subjectMode = options.subjectMode;
      } else {
        if (typeof stageOrOpts === 'number' && !isNaN(stageOrOpts)) {
          stage = stageOrOpts;
        }
        if (typeof subjectModeArg === 'string' && subjectModeArg) {
          subjectMode = subjectModeArg;
        }
        if (typeof optionsArg === 'object' && optionsArg !== null) {
          options = optionsArg;
        }
      }

      const queue = (saveState && Array.isArray(saveState.wrongAnswerQueue))
        ? saveState.wrongAnswerQueue
        : [];

      // Check if we should serve a wrong-answer review question
      if (queue.length > 0) {
        // Filter by subjectMode if user explicitly selected math-only or english-only
        const matchingQueue = (subjectMode === 'math' || subjectMode === 'english')
          ? queue.filter(function (item) { return item && item.category === subjectMode; })
          : queue;

        const activeQueue = matchingQueue.length > 0 ? matchingQueue : queue;

        _questionsSinceLastReview += 1;
        if (options.forceReview || _questionsSinceLastReview >= REVIEW_INTERVAL) {
          _questionsSinceLastReview = 0;
          const queuedItem = activeQueue[0];
          if (queuedItem) {
            _currentQuestion = buildReviewQuestionFromQueueItem(queuedItem, stage);
            return _currentQuestion;
          }
        }
      } else {
        _questionsSinceLastReview = 0;
      }

      // Determine category based on subjectMode ('mixed' | 'math' | 'english')
      let chosenCategory = 'math';
      if (subjectMode === 'math') {
        chosenCategory = 'math';
      } else if (subjectMode === 'english') {
        chosenCategory = 'english';
      } else {
        chosenCategory = Math.random() < 0.5 ? 'math' : 'english';
      }

      if (chosenCategory === 'math') {
        _currentQuestion = generateMathQuestion(stage);
      } else {
        _currentQuestion = generateEnglishQuestion(stage);
      }

      return _currentQuestion;
    },

    /**
     * Aliases for flexibility across caller modules
     */
    generateQuestion: function (stage, subjectMode, options) {
      return this.nextQuestion(stage, subjectMode, options);
    },

    getQuestion: function (stage, subjectMode, options) {
      return this.nextQuestion(stage, subjectMode, options);
    },

    /**
     * Returns the most recently generated question object.
     * @returns {Object|null}
     */
    getCurrentQuestion: function () {
      if (!_currentQuestion) {
        return this.nextQuestion();
      }
      return _currentQuestion;
    },

    /**
     * Evaluates the player's selected lane against the question's correctLane,
     * delegates cumulative persistence & wrongAnswerQueue management to SaveManager,
     * and returns the evaluation summary.
     *
     * @param {Object|number} questionOrLane
     * @param {number} [selectedLaneArg]
     * @returns {Object} { isCorrect, correctLane, answerText, selectedChoice, isReview, question }
     */
    recordResult: function (questionOrLane, selectedLaneArg) {
      let q = _currentQuestion;
      let selectedLane = -1;

      if (typeof questionOrLane === 'number') {
        selectedLane = questionOrLane;
      } else if (questionOrLane && typeof questionOrLane === 'object') {
        q = questionOrLane;
        selectedLane = typeof selectedLaneArg === 'number' ? selectedLaneArg : -1;
      }

      if (!q) {
        q = this.nextQuestion();
      }

      const isCorrect = q.isSpeech
        ? Boolean(q.speechPassed)
        : (selectedLane === q.correctLane);
      const selectedChoiceText = q.isSpeech
        ? (q.speechPassed ? String(q.spokenText || q.answerText) : '발음 미인식')
        : ((Array.isArray(q.choices) && selectedLane >= 0 && selectedLane < q.choices.length)
            ? String(q.choices[selectedLane])
            : '시간 초과');

      if (window.SaveManager && typeof window.SaveManager.recordAnswer === 'function') {
        window.SaveManager.recordAnswer(q, selectedChoiceText, isCorrect);
      }

      // If the player got a review question wrong again, rotate it to the back of wrongAnswerQueue
      // so if multiple wrong questions exist they cycle fairly, while still re-appearing soon.
      if (!isCorrect && window.SaveManager) {
        const state = window.SaveManager.getState();
        if (state && Array.isArray(state.wrongAnswerQueue) && state.wrongAnswerQueue.length > 1) {
          const idx = state.wrongAnswerQueue.findIndex(function (item) {
            return item && (item.id === q.id || item.prompt === q.prompt);
          });
          if (idx === 0) {
            const first = state.wrongAnswerQueue.shift();
            state.wrongAnswerQueue.push(first);
            window.SaveManager.save();
          }
        }
      }

      return {
        isCorrect: isCorrect,
        correctLane: q.correctLane,
        answerText: q.answerText,
        selectedChoice: selectedChoiceText,
        isReview: Boolean(q.isReview),
        question: q
      };
    },

    /**
     * Checks whether a spoken transcript from Web Speech API matches the target pronunciation word.
     * Supports exact match, plural/homophone/Korean phonetic aliases, and child-friendly fuzzy matching.
     * @param {string} transcript
     * @param {Object} [questionObj]
     * @returns {boolean}
     */
    checkSpeechMatch: function (transcript, questionObj) {
      const q = questionObj || _currentQuestion;
      if (!q || !transcript) return false;
      const targetEn = String(q.targetWord || q.answerText || '').toLowerCase().trim();
      if (!targetEn) return false;

      const cleanedRaw = String(transcript)
        .toLowerCase()
        .replace(/[.,!?'"`~()[\]{}-]/g, ' ')
        .trim();
      if (!cleanedRaw) return false;

      // 1. Direct inclusion of target word or Korean phonetic guide
      if (cleanedRaw.includes(targetEn)) return true;
      if (q.targetPron && cleanedRaw.includes(String(q.targetPron).trim())) return true;

      // 2. Check curated phonetic/homophone aliases
      const aliases = Array.isArray(q.speechAliases) ? q.speechAliases : [];
      for (let i = 0; i < aliases.length; i++) {
        const alias = String(aliases[i] || '').toLowerCase().trim();
        if (alias && cleanedRaw.includes(alias)) return true;
      }

      // 3. Token-by-token child pronunciation fuzzy match (Levenshtein & prefix/suffix similarity)
      const tokens = cleanedRaw.split(/\s+/).filter(Boolean);
      for (let t = 0; t < tokens.length; t++) {
        const tok = tokens[t];
        if (tok === targetEn) return true;
        const dist = levenshteinDistance(tok, targetEn);
        if (targetEn.length <= 4 && dist <= 1 && tok.length >= 2 && tok[0] === targetEn[0]) {
          return true;
        }
        if (targetEn.length >= 5 && dist <= 2) {
          return true;
        }
        if (targetEn.length >= 4 && tok.length >= 3 && (targetEn.startsWith(tok.slice(0, 3)) || tok.startsWith(targetEn.slice(0, 3)))) {
          if (Math.abs(tok.length - targetEn.length) <= 2) return true;
        }
      }

      return false;
    },

    /**
     * Testing & review helper: forcefully adds a wrong question into the persistent
     * wrongAnswerQueue and sets the review cooldown so it will immediately re-appear.
     *
     * @param {Object} [customQuestion]
     * @returns {Object} The queued question object
     */
    forceAddWrongQuestion: function (customQuestion) {
      const sample = (customQuestion && typeof customQuestion === 'object')
        ? customQuestion
        : generateMathQuestion(1);

      const wrongChoice = Array.isArray(sample.choices)
        ? (sample.choices.find(function (c) { return String(c) !== String(sample.answerText); }) || '오답')
        : '오답';

      if (window.SaveManager && typeof window.SaveManager.enqueueWrongQuestion === 'function') {
        window.SaveManager.enqueueWrongQuestion(sample, wrongChoice, true);
      }

      // Ready to trigger on the very next nextQuestion() call
      _questionsSinceLastReview = REVIEW_INTERVAL;
      return sample;
    },

    /**
     * Exposes dictionary size for diagnostics/UI
     */
    getDictionaryCount: function () {
      return ENGLISH_DICTIONARY.length;
    }
  };

  window.QuestionEngine = QuestionEngine;
})(window);
