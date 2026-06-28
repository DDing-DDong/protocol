# 🔌 Trace Protocol - 팀원별 API 스펙 (매우 중요)

> **주의:** 이 문서는 각 팀원이 다른 팀원의 코드를 깨뜨리지 않도록 정의한 계약입니다.
> 이 스펙을 어기면 통합할 때 버그가 발생합니다.

---

## 📍 기본 원칙

1. **game 객체는 전역 공유 데이터** → 누구나 읽을 수 있음, 쓸 때는 조심
2. **각자의 담당 필드만 수정** → 예: A는 game.hacker만 수정
3. **새로운 필드 추가 시 D와 사전 협의** → 구조 변경은 모두에게 영향

---

## 👤 팀원 A: 해커 조작 (공격 턴)

### 읽는 필드 (Read Only)
```javascript
game.stage       // 현재 스테이지
game.timer       // 남은 시간
game.baseHazards // 기본 함정들
game.platforms   // 플랫폼들
game.core        // 데이터 코어 위치
```

### 쓰는 필드 (Modify)
```javascript
game.hacker // 해커 상태 업데이트
{
  x: 현재 X 좌표,
  y: 현재 Y 좌표,
  vx: X 속도,
  vy: Y 속도,
  facing: 1(-1 왼쪽, 1 오른쪽),
  hp: 현재 체력,
  energy: 현재 에너지,
  onGround: 땅에 있는가,
  shield: 방어막 활성화 여부,
  invincible: 무적 시간,
  dashCooldown: 대시 쿨타임
}

game.metrics // 통계 기록
{
  hpLost: 잃은 체력 수,
  energyUsed: 사용한 에너지,
  // B가 채움 (읽기만):
  // detections, delay, ...
}

game.timer // 남은 시간 (감소)
```

### 중요한 함수 (수정하지 말 것)
```javascript
rectsOverlap(a, b)        // 충돌 판정 - 이 함수는 건드리지 말 것!
approach(value, target)   // 값 부드럽게 변경
moveAndCollide()          // 이 함수는 B가 의존함 - 변경 조심
```

### 체크 사항
- [ ] game.hacker가 항상 최신 상태로 유지되는가?
- [ ] game.timer가 매 프레임 감소하는가?
- [ ] game.metrics가 정확히 기록되는가?

---

## 🔄 팀원 B: 리플레이 시스템 ⭐ 가장 중요

### 읽는 필드 (Read Only)
```javascript
game.hacker                // A가 매 프레임 업데이트함
game.currentRecording      // 기록 중인 경로
game.lastAttackRecording   // 이전 공격 턴의 경로 (수비 턴에서 재생)
game.timer                 // 현재 시간 (경로 타임스탐프 생성)
game.turn                  // 공격 턴인지 수비 턴인지
```

### 쓰는 필드 (Modify)
```javascript
game.currentRecording      // 공격 턴 중 경로 기록
// 형식: [{t, x, y, facing, shield, energyUsed, vx, vy}, ...]

game.lastAttackRecording   // 수비 턴 시작 시 game.currentRecording 복사
// 형식 동일

game.replayHacker          // 수비 턴 중 리플레이 해커 위치 업데이트
{
  x: 리플레이된 X 좌표,
  y: 리플레이된 Y 좌표,
  facing: 바라보는 방향,
  hp: 체력 (C가 감소시킴),
  // 기타: 읽기만
}

game.replayIndex           // 현재 재생 프레임 인덱스
game.replayPause           // 지연 시간 (C가 증가시킴, B가 감소)
game.replayFinished        // 리플레이 완료 여부
```

### 중요한 함수 (수정하지 말 것)
```javascript
rectsOverlap()    // 충돌 판정
```

### 핵심 로직 (변경하지 말 것)
1. **공격 턴 진행 중:**
   - game.recordTimer += dt
   - 0.07초마다 game.currentRecording에 현재 위치 추가

2. **공격 턴 종료 시:**
   - game.lastAttackRecording = game.currentRecording.slice()

3. **수비 턴 리플레이:**
   - game.lastAttackRecording[game.replayIndex]로부터 좌표 읽기
   - game.replayIndex를 시간에 따라 증가
   - game.replayPause가 0이 되면 계속 진행

### 체크 사항
- [ ] 같은 경로를 10회 재생해도 동일한가? (±2px 오차 허용)
- [ ] 리플레이 중 게임이 튕기지는 않는가?
- [ ] 경로 타임스탐프가 정확한가?

### ⚠️ 가장 신경 쓸 부분
**문제:** 0.07초 간격 샘플링은 시간이 더 빠르거나 느리면 경로가 어긋남
**해결:** 프레임 기반 기록으로 변경 고려
```javascript
// 현재 (시간 기반, 불안정)
if (game.recordTimer >= 0.07) {
  game.currentRecording.push({t, x, y, ...});
}

// 개선 (프레임 기반, 더 안정적)
// 매 프레임마다 입력(키) + 위치를 함께 기록
// 수비 턴에서 입력을 재현해서 물리 다시 계산
```

---

## 🎯 팀원 C: 함정 배치 및 효과

### 읽는 필드 (Read Only)
```javascript
game.turn                  // 수비 턴인가?
game.defenseBudget         // 남은 예산
game.placedTraps           // 배치된 함정들
game.lastAttackRecording   // 해커 경로 (함정 배치 시 참고)
game.replayHacker          // 현재 리플레이 중인 해커
game.trapSlots             // 배치 가능한 슬롯
```

### 쓰는 필드 (Modify)
```javascript
game.placedTraps           // 함정 배치
// 형식: [{id, type, x, y, slotId}, ...]
// type: "laser" | "shock" | "camera" | "firewall"

game.defenseBudget         // 남은 예산 (감소)

game.trapSlots             // 슬롯 상태 업데이트
// slot.occupied = true (배치됨)
// slot.occupied = false (제거됨)

game.metrics               // 통계 기록
{
  detections: 함정에 의한 탐지 횟수,
  delay: 함정에 의한 총 지연 시간,
  // 기타는 A, B가 기록
}

game.replayPause           // 리플레이 일시 정지 시간 (증가)
```

### 함정 효과 정의 (변경 불가)

| 함정 | 비용 | 효과 | 코드 |
|------|------|------|------|
| 레이저 | 2 | +1 탐지, -1 체력 | `trap.type === "laser"` |
| 감전바닥 | 2 | +1초 지연 | `trap.type === "shock"` |
| 카메라 | 1 | +1 탐지 | `trap.type === "camera"` |
| 방화벽 | 3 | +1.2초 지연, -1 체력 | `trap.type === "firewall"` |

### 실제 구현 예시
```javascript
function checkDefenseTraps(replayHacker, dt) {
  for (const trap of game.placedTraps) {
    const hitbox = getTrapHitbox(trap);
    if (!rectsOverlap(replayHacker, hitbox)) continue;
    
    // 중복 피하기 (0.7초 쿨타임)
    const key = `${trap.id}-${trap.type}`;
    const remaining = replayHacker.trapCooldowns.get(key) || 0;
    if (remaining > 0) continue;
    
    // 함정 효과 적용
    if (trap.type === "laser") {
      game.metrics.detections += 1;
      replayHacker.hp -= 1;
      replayHacker.trapCooldowns.set(key, 0.7);
    }
    // ...
  }
}
```

### 체크 사항
- [ ] 함정 배치 후 리플레이가 함정에 걸리는가?
- [ ] 예산이 정확히 계산되는가?
- [ ] game.metrics.detections과 delay가 정확한가?

---

## 📊 팀원 D: 스테이지/보상/무한모드

### 읽는 필드 (Read Only)
```javascript
game.stage                 // 현재 스테이지
game.hacker                // A가 조작하는 해커
game.replayHacker          // B가 리플레이하는 해커
game.placedTraps           // C가 배치한 함정
game.metrics               // A, B, C가 기록한 통계
game.turn                  // 현재 턴
game.mods                  // 누적된 보상 효과
```

### 쓰는 필드 (Modify)
```javascript
game.stage                 // 스테이지 진행 (증가)

game.platforms             // 현재 스테이지 맵
// [{x, y, w, h}, ...]

game.baseHazards           // 현재 스테이지 기본 함정
// [{type, x, y, w, h}, ...]

game.trapSlots             // 현재 스테이지 배치 슬롯
// [{x, y, id, occupied}, ...]

game.core                  // 데이터 코어 위치
// {x, y, w, h}

game.defenseBudget         // 수비 턴 시작 시 예산 설정

game.mods                  // 누적된 보상 효과
{
  maxEnergy: 최대 에너지 (공격 턴에 영향),
  dashCooldown: 대시 쿨타임 (공격 턴에 영향),
  shieldDrain: 방어막 에너지 소모 (공격 턴에 영향),
  freeHit: 무료 피해 무시 (공격 턴에 영향),
  defenseBudgetBonus: 함정 예산 추가 (수비 턴에 영향),
  cameraDiscount: 카메라 비용 할인 (수비 턴에 영향),
  laserBoost: 레이저 높이 증가 (수비 턴에 영향),
  firewallDelay: 방화벽 지연 시간 (수비 턴에 영향),
}
```

### 스테이지 설정 함수
```javascript
function setupStage() {
  // D가 작성
  game.stage = ?
  game.turn = isAttackStage(game.stage) ? TURN.ATTACK : TURN.DEFENSE_BUILD
  game.timer = getStageTime(game.stage)
  game.platforms = createPlatforms(game.stage)
  game.baseHazards = createBaseHazards(game.stage)
  game.trapSlots = createTrapSlots(game.stage)
  game.core = ?
  // ...
}

function getStageTime(stage) {
  // 제한 시간 반환
}

function getDefenseBudget(stage) {
  // 함정 예약 반환
}

function getObjective(stage) {
  // 스테이지 목표 텍스트 반환
}
```

### 보상 시스템
```javascript
// 공격 턴 성공 시 → 다음 수비 턴에 영향
rewardPool.attack = [
  {
    name: "함정 예산 +2",
    desc: "다음 수비 턴의 설치 예산이 증가",
    apply: () => game.mods.defenseBudgetBonus += 2,
  },
  // ...
]

// 수비 턴 성공 시 → 다음 공격 턴에 영향
rewardPool.defense = [
  {
    name: "최대 에너지 +20",
    desc: "다음 공격 턴부터 최대 에너지 증가",
    apply: () => game.mods.maxEnergy += 20,
  },
  // ...
]
```

### 무한모드 난이도 증가
```javascript
function getStageTime(stage) {
  if (stage <= 11) {
    // 1-11: 고정 시간
    if (stage <= 3) return 48;
    if (stage <= 7) return 42;
    return 38;
  } else {
    // 12+: 점진적 감소
    return Math.max(24, 40 - Math.floor((stage - 12) * 1.5));
  }
}

function getDefenseBudget(stage) {
  const base = 4 + Math.floor(stage / 4) + game.mods.defenseBudgetBonus;
  if (stage >= 12) {
    // 무한모드: 더 빠르게 증가
    return base + Math.floor((stage - 12) / 2);
  }
  return base;
}
```

### 체크 사항
- [ ] 각 스테이지 시간이 점진적으로 감소하는가? (1-11)
- [ ] 함정 예약이 점진적으로 증가하는가?
- [ ] 무한모드가 계속 진행되는가?
- [ ] 보상이 다음 턴에 올바르게 적용되는가?

---

## 🎨 팀원 E: UI/UX/통합

### 읽는 필드 (Read Only)
```javascript
game.stage              // 현재 스테이지
game.turn               // 현재 턴
game.timer              // 남은 시간
game.hacker              // A의 해커
game.replayHacker        // B의 리플레이 해커
game.placedTraps         // C의 함정
game.defenseBudget       // C의 예약
game.metrics             // A, B, C의 통계
game.mods                // D의 보상 효과
```

### 쓰는 필드 (Modify)
```javascript
// DOM 요소들 업데이트 (읽기 전용 필드는 없음)

ui.stageLabel            // 스테이지 번호
ui.turnLabel             // 턴 이름
ui.objectiveLabel        // 목표
ui.timerLabel            // 시간
ui.hpLabel               // 체력 숫자
ui.energyLabel           // 에너지 숫자
ui.hpBar                 // 체력 바
ui.energyBar             // 에너지 바
ui.budgetLabel           // 예약 숫자
ui.detectLabel           // 탐지 횟수
ui.delayLabel            // 지연 시간
ui.logText               // 메시지
ui.overlay               // 모달창
ui.defenseTools          // 함정 배치 UI
```

### 화면별 필수 UI

**공격 턴:**
```
┌─────────────────────────┐
│ STAGE 1 / HACKER ATTACK │  ← stageLabel + turnLabel
│ 데이터 코어 탈취         │  ← objectiveLabel
├─────────────────────────┤
│ 시간: 45.0               │  ← timerLabel
│ 체력: 3 / 3 [████]      │  ← hpLabel + hpBar
│ 에너지: 100 / 100 [████]│  ← energyLabel + energyBar
└─────────────────────────┘
```

**수비 턴 준비:**
```
┌─────────────────────────┐
│ STAGE 2 / AI DEFENSE    │
│ 해커를 3초 이상 지연    │
├─────────────────────────┤
│ 예약: 4                  │  ← budgetLabel
│ 탐지: 0                  │  ← detectLabel
│ 지연: 0.0s               │  ← delayLabel
├─────────────────────────┤
│ 함정 선택:               │
│ [레이저 2] [감전 2]      │  ← trap-btn
│ [카메라 1] [방화벽 3]   │
├─────────────────────────┤
│ [리플레이 시작]          │  ← startReplayBtn
└─────────────────────────┘
```

**수비 턴 재생:**
```
┌─────────────────────────┐
│ STAGE 2 / AI DEFENSE    │
│ 해커를 3초 이상 지연    │
├─────────────────────────┤
│ 예약: 재생 중            │  ← budgetLabel
│ 탐지: 1                  │  ← detectLabel (실시간 증가)
│ 지연: 1.5s               │  ← delayLabel (실시간 증가)
└─────────────────────────┘
```

### 함수 정의 (E가 관리)
```javascript
function updateUI() {
  // 매 프레임 호출되어야 함
  ui.stageLabel.textContent = String(game.stage);
  ui.turnLabel.textContent = getTurnLabel(game.turn);
  ui.objectiveLabel.textContent = getObjective(game.stage);
  ui.timerLabel.textContent = game.turn === TURN.ATTACK 
    ? game.timer.toFixed(1) 
    : "-";
  // ...
}

function showOverlay({ title, text, rewards = [], buttonText = "확인", onButton }) {
  // 모달 표시
}

function hideOverlay() {
  // 모달 숨기기
}
```

### 통합 테스트 체크리스트 (E 담당, 매일)
- [ ] 1스테이지 공격 턴에서 에너지, 시간, 체력이 표시되는가?
- [ ] 2스테이지 수비 턴에서 함정 배치 UI가 표시되는가?
- [ ] 리플레이 중 탐지/지연이 실시간으로 증가하는가?
- [ ] 클리어 후 보상 모달이 표시되는가?
- [ ] 보상 선택 후 다음 스테이지로 진행되는가?

---

## 🔗 팀원 간 데이터 흐름 예시

### 1스테이지 완료 흐름
```
A: 해커가 데이터 코어에 도달
  ↓
B: game.currentRecording을 game.lastAttackRecording에 복사
  ↓
E: "스테이지 클리어" 모달 표시
  ↓
D: 공격 턴 보상 3개 생성
  ↓
E: 보상 선택 화면 표시
  ↓
플레이어: 보상 1개 선택
  ↓
D: game.mods 업데이트 (예: game.mods.defenseBudgetBonus += 2)
  ↓
D: game.stage = 2, setupStage() 호출
  ↓
2스테이지 시작
  ↓
game.defenseBudget = getDefenseBudget(2) + game.mods.defenseBudgetBonus
  ↓
C: 더 많은 예산으로 함정 배치 가능
```

---

## ✅ 최종 체크리스트

각 팀원이 출근 시 확인:

**A (해커):**
- [ ] game.hacker가 올바르게 업데이트되는가?
- [ ] game.timer가 감소하는가?

**B (리플레이):**
- [ ] game.currentRecording이 기록되는가?
- [ ] game.lastAttackRecording이 로드되는가?
- [ ] game.replayHacker가 경로를 따르는가?

**C (함정):**
- [ ] game.placedTraps에 함정이 추가되는가?
- [ ] game.defenseBudget이 감소하는가?
- [ ] game.metrics이 업데이트되는가?

**D (스테이지):**
- [ ] game.stage가 증가하는가?
- [ ] game.mods이 보상에 따라 업데이트되는가?
- [ ] 다음 스테이지가 올바르게 설정되는가?

**E (UI):**
- [ ] 모든 UI 요소가 표시되는가?
- [ ] 상황에 맞는 UI만 표시되는가?
- [ ] 클릭이 올바르게 작동하는가?

---

*이 문서는 개발 중 수정될 수 있습니다. 변경사항 발생 시 즉시 팀에 공유해주세요!*

