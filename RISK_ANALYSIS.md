# ⚠️ Trace Protocol - 개발 리스크 분석 & 해결 방안

**목적:** 2주 개발 중 발생할 수 있는 문제를 미리 예측하고 대비하기 위함

---

## 🚨 최우선 해결 리스크 (개발 첫 주에 해결해야 함)

### 1️⃣ 리플레이 시스템 정확도 부족 (위험도: 🔴 매우높음)

**문제:**
- 현재 0.07초 간격 시간 기반 샘플링 방식
- 프레임 드롭이나 시간 지연이 생기면 경로가 어긋남
- 수비 턴에서 함정이 제대로 작동하지 않을 가능성 높음
- **이것이 망가지면 게임 핵심 컨셉이 무너짐**

**증상:**
```
게임 시작 직후 1→2스테이지: 완벽 작동
반복 플레이 후: 경로가 조금씩 어긋남
여러 번 반복: 함정이 전혀 안 맞음
```

**근본 원인:**
```javascript
// 현재 방식 (불안정)
game.recordTimer += dt;  // dt가 가변적일 수 있음
if (game.recordTimer >= 0.07) {
  record.push({x, y, ...});  // 샘플링 간격 불일치
  game.recordTimer = 0;
}

// 재생할 때도 같은 문제 발생
game.replayIndex += Math.max(1, Math.floor(dt / 0.07));
// 다시 샘플링 간격으로 계산 → 오차 누적
```

**해결 방안 (권장):**
```javascript
// ✅ 개선된 방식 (더 안정적) - 프레임 기반
// 매 프레임마다 입력을 저장
const ACTIONS = {
  NONE: 0,
  JUMP: 1,
  DASH: 2,
  SHIELD: 4,
};

game.currentRecording = [
  { frame: 0, actions: 0, velocities: {vx: 0, vy: 0} },
  { frame: 1, actions: ACTIONS.JUMP, velocities: {vx: 0, vy: -620} },
  { frame: 2, actions: ACTIONS.DASH, velocities: {vx: 620, vy: 0} },
  // ...
];

// 재생 시에는 입력을 재현
for (const record of game.lastAttackRecording) {
  applyInput(record.actions);  // 입력 재현
  update(1/60);  // 물리 재계산
  game.replayHacker.x = hacker.x;
  game.replayHacker.y = hacker.y;
}
```

**실행 계획:**
1. **1일차:** 현재 방식 테스트 (같은 경로를 5회 반복 재생)
2. **2일차:** 오차 측정 (재생할 때마다 ±몇 픽셀 변하는지)
3. **3일차:** 프레임 기반 방식으로 변경 (B가 담당)
4. **4일차:** 재테스트 (오차가 0에 가까워야 함)

**체크리스트:**
- [ ] 같은 경로를 10회 반복 재생해도 ±2픽셀 오차 이내?
- [ ] 프레임 드롭 후에도 경로가 일치?
- [ ] 리플레이 중 게임이 튕기지는 않음?

**타임라인:**
- ⏰ 목표: 1주차 목요일까지 해결 필수 (금요일 테스트 필요)

---

### 2️⃣ 함정 충돌 판정 복잡도 (위험도: 🔴 높음)

**문제:**
- 각 함정의 hitbox 형태가 다름 (직사각형, 선 등)
- 리플레이 해커의 hitbox와 정확히 겹쳐야 함
- C와 B의 코드가 의존하므로 한 쪽만 틀려도 전체 망함

**현재 코드:**
```javascript
// 함정 hitbox 계산
function getTrapHitbox(trap) {
  if (trap.type === "laser") {
    const h = TRAPS.laser.h + game.mods.laserBoost;  // ← 보상에 따라 달라짐!
    return { x: trap.x - 8, y: trap.y - h, w: 16, h };
  }
  if (trap.type === "shock") 
    return { x: trap.x - 36, y: trap.y - 8, w: 72, h: 14 };
  // ...
}

// 충돌 판정
if (rectsOverlap(replayHacker, hitbox)) {
  // 함정 효과 적용
}
```

**문제점:**
1. 레이저 높이가 `game.mods.laserBoost`에 따라 변함
2. 감전 바닥이 얇아서 판정이 까다로움
3. 카메라가 삼각형 판정이라 직사각형으로 근사화되어 부정확

**해결 방안:**
```javascript
// ✅ 실시간 테스트 도구
function drawDebugHitbox(trap) {
  const hitbox = getTrapHitbox(trap);
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 2;
  ctx.strokeRect(hitbox.x, hitbox.y, hitbox.w, hitbox.h);
}

// ✅ 테스트 시나리오
// 1. 정확히 함정 중앙에 리플레이 해커가 오는 경로
// 2. 함정 경계에서 지나가는 경로
// 3. 함정을 피해 지나가는 경로
```

**실행 계획:**
- **2-3일차:** 각 함정마다 테스트 케이스 작성 (C와 B)
- **4일차:** 디버그 hitbox 그리기 기능 추가
- **5일차:** 실제 게임에서 테스트

**타임라인:**
- ⏰ 목표: 1주차 화요일까지 기본 완성

---

### 3️⃣ 함정 배치 UI 반응성 (위험도: 🟡 중간)

**문제:**
- 마우스 좌표를 Canvas 좌표로 변환해야 함
- 슬롯 감지 범위가 너무 작으면 클릭 어려움
- 반응 피드백이 없으면 플레이어가 배치했는지 모름

**현재 코드:**
```javascript
function onCanvasClick(event) {
  const pos = getCanvasPos(event);  // 좌표 변환
  const slot = game.trapSlots.find((s) => 
    Math.hypot(pos.x - s.x, pos.y - s.y) <= 28  // ← 28px 반경
  );
}
```

**개선 방안:**
```javascript
// ✅ 반응 범위 증가 (사용성 향상)
Math.hypot(pos.x - s.x, pos.y - s.y) <= 44  // 28px → 44px

// ✅ 시각적 피드백 추가
function showTrapPlaced(slot) {
  // 슬롯이 배치됨 표시 (색상 변경)
  // 사운드 효과 (선택)
  // 예산 표시 업데이트
}
```

**타임라인:**
- ⏰ 목표: 1주차 목요일까지 개선

---

## 📊 중간 우선순위 리스크 (1주차 중간에 해결)

### 4️⃣ 보상 밸런싱 복잡도 (위험도: 🟡 중간)

**문제:**
- 공격 턴 보상이 수비 턴에 영향 → 수비 턴 보상이 공격 턴에 영향
- 보상이 누적되면 게임이 순식간에 쉬워질 수 있음
- 어떤 보상이 너무 강하면 게이머들이 그것만 선택

**예시 (악순환):**
```
1스테이지: 해커가 쉬움 → "함정 예산 +2" 선택
2스테이지: 더 많은 함정 배치 → 쉽게 방어
3스테이지: 해커가 "최대 에너지 +20" 받음 → 더 쉬움
4스테이지: 엄청 많은 함정 배치 가능 → 어렵지만 이기기 쉬움
...
점점 보상이 누적 → 게임이 지루해짐
```

**현재 보상 풀:**
```javascript
rewardPool.attack = [
  "함정 예산 +2",      // 다음 수비 턴에 도움
  "카메라 비용 -1",    // 다음 수비 턴에 도움
  "레이저 강화",       // 다음 수비 턴에 도움
  "방화벽 해금 보강",  // 다음 수비 턴에 도움
];

rewardPool.defense = [
  "최대 에너지 +20",   // 다음 공격 턴에 도움
  "대시 쿨타임 감소",  // 다음 공격 턴에 도움
  "방어막 효율 증가",  // 다음 공격 턴에 도움
  "보호막 1회",        // 다음 공격 턴에 도움
];
```

**해결 방안:**
```javascript
// ✅ 보상 제한
// - 각 보상은 최대 3회까지만 선택 가능
// - 스테이지가 높아질수록 더 강한 보상 나타남
// - 일부 보상은 상호배제 (동시에 선택 불가)

const rewardLimits = {
  "함정 예산 +2": 3,       // 최대 3회 선택 가능 = +6 총합
  "최대 에너지 +20": 3,    // 최대 3회 선택 가능 = +60 총합
};

// ✅ 보상 다양화
// 대신 효율적 보상보다 "도박" 스타일 보상 추가
{
  name: "카메라 전자기파",
  desc: "다음 수비 턴에 카메라가 모두 비활성화",
  apply: () => game.mods.cameraPower = 0,  // 카메라 비활성화
},
{
  name: "해킹 방화벽",
  desc: "다음 공격 턴에 잠금문 1개 자동 해제",
  apply: () => game.mods.autoUnlock = 1,
}
```

**실행 계획:**
- **6일차:** 보상 밸런싱 검토 회의 (전체)
- **7일차:** 1차 통합 테스트 중 보상 균형 평가

**타임라인:**
- ⏰ 목표: 1주차 금요일 + 2주차 목요일에 재점검

---

### 5️⃣ 무한모드 난이도 곡선 (위험도: 🟡 중간)

**문제:**
- 12스테이지부터 무한히 진행되어야 함
- 난이도가 너무 빨리 올라가면 5스테이지도 못 넘음
- 너무 천천히 올라가면 게이머들이 지루해함

**현재 수식:**
```javascript
function getStageTime(stage) {
  return Math.max(24, 40 - Math.floor((stage - 12) * 1.5));
}

function getDefenseBudget(stage) {
  const base = 4 + Math.floor(stage / 4) + game.mods.defenseBudgetBonus;
  return base + Math.floor((stage - 12) / 2);
}

// 예시:
// 12스테이지: 시간 40초, 예산 5
// 13스테이지: 시간 38.5초, 예산 5
// 14스테이지: 시간 37초, 예산 6
// 15스테이지: 시간 35.5초, 예산 6
// ...
// 40스테이지: 시간 24초, 예산 14
```

**해결 방안:**
```javascript
// ✅ 난이도 곡선 조정
function getStageTime(stage) {
  if (stage <= 11) {
    if (stage <= 3) return 48;
    if (stage <= 7) return 42;
    return 38;
  }
  
  // 무한모드: 느리게 증가 (더 오래 플레이 가능하게)
  const infiniteStage = stage - 12;
  const decrease = Math.min(14, infiniteStage * 0.5);  // 1.5 → 0.5로 완화
  return Math.max(20, 40 - decrease);
}

// ✅ 함정 예산 증가도 완화
function getDefenseBudget(stage) {
  const base = 4 + Math.floor(stage / 4) + game.mods.defenseBudgetBonus;
  if (stage >= 12) {
    return base + Math.floor((stage - 12) / 3);  // /2 → /3으로 완화
  }
  return base;
}
```

**타임라인:**
- ⏰ 목표: 2주차 목요일 (무한모드 구현 후 즉시 조정)

---

## 🔧 낮은 우선순위 리스크 (2주차에 해결)

### 6️⃣ UI 응답성 이슈 (위험도: 🟢 낮음)

**문제:** 화면이 복잡해지면 버튼 클릭 반응이 느려질 수 있음

**해결:** 프론트엔드 최적화 (2주차 금요일)

---

### 7️⃣ 저장/로드 시스템 (위험도: 🟢 낮음)

**현황:** 현재는 최고 기록만 localStorage에 저장
```javascript
localStorage.setItem("traceProtocolBest", String(stage));
```

**필요 시 추가:**
- 현재 진행 상황 저장
- 게임 재개 기능

**타임라인:** 2주차 선택사항 (우선순위 낮음)

---

## 📋 리스크 대응 체크리스트

### 매일 (팀 단위)

- [ ] 리플레이 정확도 테스트 (B)
  - 같은 경로 재생 5회
  - 오차 측정
  
- [ ] 함정 충돌 판정 테스트 (C + B)
  - 각 함정 정중앙 통과
  - 각 함정 경계 통과
  - 각 함정 피해 통과

- [ ] 보상 적용 테스트 (D)
  - 공격 턴 보상이 수비 턴에 보임
  - 수비 턴 보상이 공격 턴에 보임

### 주간 (전체)

- [ ] 통합 테스트 (30분)
  - 1→2→3 진행 확인
  - 보상 누적 확인
  - 무한모드 진행 확인

---

## 🎯 최악의 시나리오 & 대응

### 시나리오 1: 리플레이가 계속 틀림
```
→ 즉시 D와 협의해서 프레임 기반으로 전환
→ 손실: 1일 (화요일 수정)
→ 영향: C(함정) 작업 중단
```

### 시나리오 2: 함정 효과 너무 약함
```
→ 2주차 수요일에 수비 목표 재설정
→ 손실: 반일
→ 영향: 게임 난이도 조정
```

### 시나리오 3: 무한모드가 너무 빨리 어려워짐
```
→ 2주차 금요일에 수식 조정
→ 손실: 반시간
→ 영향: 없음 (선택사항)
```

---

## ✅ 리스크 관리 원칙

1. **조기 발견**: 매일 문제를 테스트해서 발견
2. **빠른 대응**: 1시간 이상 멈춰 있으면 팀 전체에 공유
3. **문서화**: 해결한 문제와 방법 기록
4. **우선순위**: 게임 진행이 불가능한 버그부터 수정

---

*최종 수정: 2026년 6월 28일*

