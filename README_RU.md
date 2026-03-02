# VestingVault — Дашборд вестинга с разделением дохода на Bitcoin L1

**Ончейн вестинг с клиффом/линейной разблокировкой + пропорциональное разделение дохода для токенов OP_20, развернуто на OPNet (Bitcoin L1). Никаких мостов, никаких L2.**

---

## Как это работает

VestingVault позволяет владельцу протокола блокировать токены OP_20 для бенефициаров с настраиваемым графиком линейного вестинга (с опциональным клиффом). Доход протокола, вносимый в хранилище, распределяется **пропорционально** всем держателям с вестингом на основе их текущего заблокированного баланса токенов.

Распределение дохода использует паттерн **Synthetix reward-per-token accumulator** (аккумулятор вознаграждения на токен) — O(1) на каждый клейм (сбор вознаграждения) независимо от количества бенефициаров. Никаких циклов, никакого неограниченного газа.

```text
Владелец             Бенефициар            Любой (депозитор)
  │                      │                        │
  ├─ approve()           │                        │
  ├─ addVesting() ───────►                        │
  │   (блокирует токены) │                   approve()
  │                      │              depositRevenue()
  │                      │       (rewardPerToken накапливается)
  │                 [проходит клифф]              │
  │                 release() ────────────────── │
  │                 claimRevenue() ──────────────│
```

---

## Механика

### График вестинга (на основе блоков)

| Параметр | Описание |
|-----------|-------------|
| `amount` | Общее количество токенов для вестинга |
| `cliffDuration` | Количество блоков до начала вестинга |
| `vestingDuration` | Общее количество блоков для полного вестинга |
| `startBlock` | Блок при вызове `addVesting()` |

Линейная формула: `vested = amount × (currentBlock − start) / duration`

До клиффа: ничего нельзя разблокировать. После полной продолжительности: можно разблокировать всё.

### Распределение дохода (аккумулятор в стиле Synthetix)

```text
rewardPerToken += (depositAmount × 1e18) / totalLocked

pendingRevenue(user) = lockedBalance × (rewardPerToken − rewardDebt[user]) / 1e18
```

Математический пример:
- Алиса: 7 000 заблокировано, Боб: 3 000 заблокировано → `totalLocked = 10 000`
- `depositRevenue(1 000)` → `rewardPerToken += 1 000×1e18 / 10 000 = 1e17`
- Алиса зарабатывает: `7 000 × 1e17 / 1e18 = 700` ✓
- Боб зарабатывает: `3 000 × 1e17 / 1e18 = 300` ✓
- Итого: 1 000 = сумма депозита ✓

После `release()`: только **оставшийся заблокированный** баланс приносит будущий доход.

---

## Безопасность

| Свойство | Реализация |
|----------|---------------|
| Защита от Reentrancy | `StoredBoolean` в постоянном хранилище блокчейна (не в памяти — переживает пересоздание экземпляра при каждом вызове) |
| Checks-effects-interactions | Состояние обновляется перед каждым внешним вызовом `Blockchain.call()` |
| Только владелец может добавить вестинг | Защита `onlyOwner()` на функции `addVesting()` |
| Депозиты дохода открыты | Любой адрес может внести депозит (композируемость протокола) |
| Нет публичного минта/вывода | Только `release()` + `claimRevenue()` для бенефициаров |
| `tx.sender` (а не `tx.origin`) | Предотвращает атаки делегирования |

---

## Методы контракта

### Изменяющие состояние (State-changing)

| Метод | Вызывающий | Описание |
|--------|--------|-------------|
| `addVesting(beneficiary, amount, cliff, duration)` | Владелец | Создать график вестинга, забрать токены через `transferFrom` |
| `release()` | Бенефициар | Разблокировать доступные токены для вызывающего |
| `depositRevenue(amount)` | Любой | Внести доход для пропорционального распределения |
| `claimRevenue()` | Бенефициар | Забрать накопленную долю дохода |

### Только для чтения (View)

| Метод | Возвращает |
|--------|---------|
| `releasableAmount(address)` | Токены, доступные для разблокировки прямо сейчас |
| `vestedBalance(address)` | Всего разблокировано на данный момент |
| `pendingRevenue(address)` | Невостребованный доход (сохраненный + текущая эпоха) |
| `totalRevenueDeposited()` | Совокупный внесенный доход |
| `getVestingInfo(address)` | Полная информация о графике за один вызов |
| `owner()` | Адрес владельца контракта |
| `vestingToken()` | Токен, который подлежит вестингу |
| `revenueToken()` | Токен, используемый для дохода |
| `totalLocked()` | Все текущие заблокированные токены |

### Селекторы функций (Function selectors)

| Функция | Селектор |
|----------|---------|
| `addVesting(address,uint256,uint256,uint256)` | `0x7361c073` |
| `release()` | `0xca66fa8a` |
| `depositRevenue(uint256)` | `0x5868922b` |
| `claimRevenue()` | `0xdba5add9` |
| `releasableAmount(address)` | `0x5ac042fa` |
| `vestedBalance(address)` | `0xa8a3c859` |
| `pendingRevenue(address)` | `0x23e7044e` |
| `totalRevenueDeposited()` | `0x86c091af` |
| `getVestingInfo(address)` | `0x2b302f16` |
| `owner()` | `0x3fc2bcdd` |
| `vestingToken()` | `0xea9b7f23` |
| `revenueToken()` | `0xa37f8d09` |
| `totalLocked()` | `0x885dc9b0` |

---

## Структура проекта

```text
src/
  VestingVault.ts          # Основной контракт (AssemblyScript)
  index.ts                 # Точка входа OPNet
  events/
    VestingEvents.ts       # Определения NetEvent
build/
  VestingVault.wasm        # Скомпилированный бинарник (~30 КБ)
  VestingVault.wat         # Человекочитаемый WAT
abis/
  VestingVault.abi.json    # Автоматически сгенерированный ABI
  VestingVault.abi.ts      # ABI для пакета opnet
  VestingVault.d.ts        # Определения типов TypeScript
test/
  test-vesting-flow.ts     # Полный E2E тестовый скрипт
  vesting-vault-abi.ts     # Типизированный ABI для тестов
frontend/
  index.html               # Минималистичный дашборд (OP Wallet)
DEPLOY.md                  # Руководство по развертыванию
```

---

## Сборка (Build)

```bash
npm install

# Сборка для разработки (с проверками/assertions)
npm run build

# Сборка для продакшена (оптимизированная, без проверок)
npm run build:release
```

На выходе получаем `build/VestingVault.wasm`.

---

## Развертывание (Deploy)

Смотрите [DEPLOY.md](./DEPLOY.md) для полного пошагового руководства.

**Краткое резюме:**

1. Соберите контракт (`npm run build`)
2. Откройте **OP Wallet** → Переключитесь на OPNet Testnet
3. Нажмите **Deploy** → перетащите `build/VestingVault.wasm`
4. Введите данные конструктора (calldata): адрес `vestingToken` + адрес `revenueToken`
5. Подтвердите 2 транзакции BTC (fund + reveal)
6. Запишите адрес развернутого контракта

---

## Тестирование полного флоу (E2E)

Отредактируйте `test/test-vesting-flow.ts` — впишите адреса развернутых контрактов:

```ts
const VAULT_ADDRESS = 'bcrt1p...ВАШ_АДРЕС_ХРАНИЛИЩА';
const VESTING_TOKEN_ADDRESS = 'bcrt1p...АДРЕС_ВАШЕГО_ТОКЕНА';
const REVENUE_TOKEN_ADDRESS = 'bcrt1p...АДРЕС_ВАШЕГО_ТОКЕНА_ДОХОДА';
const OWNER_ADDRESS = 'bcrt1p...ВАШ_АДРЕС_ВЛАДЕЛЬЦА';
const BENEFICIARY_ADDRESS = 'bcrt1p...ВАШ_АДРЕС_БЕНЕФИЦИАРА';
```

Затем выполните каждый шаг:

```text
Step 1: Владелец одобряет (approve) vestingToken
Step 2: Владелец вызывает addVesting()
Step 3: Депозитор одобряет (approve) revenueToken
Step 4: Депозитор вызывает depositRevenue()
Step 5: [Подождите, пока пройдут блоки клиффа в тестовой сети]
Step 6: Бенефициар вызывает release()
Step 7: Бенефициар вызывает claimRevenue()
Step 8: Убедитесь, что getVestingInfo() / pendingRevenue() == 0
```

Ожидаемое состояние после полного цикла (флоу):
- `totalLocked` = исходная сумма минус разблокированная
- `pendingRevenue(beneficiary)` = 0 (забрано)
- `totalRevenueDeposited()` = всего внесено депозитов

---

## Проверка математики

Дано: `vestingAmount = 1e18`, `revenueDeposited = 0.5e18`, `totalLocked = 1e18`, один бенефициар:

```text
rewardPerToken = 0.5e18 × 1e18 / 1e18 = 5e17
pendingRevenue = 1e18 × 5e17 / 1e18 = 0.5e18  ✓ (100% дохода)
```

Дано: два бенефициара (Алиса 70%, Боб 30%), `revenueDeposited = 1000`:

```text
rewardPerToken += 1000 × 1e18 / totalLocked
Alice pending = lockedAlice × rewardPerToken / 1e18 = 700  ✓
Bob pending   = lockedBob   × rewardPerToken / 1e18 = 300  ✓
```

---

## События (Events)

| Событие | Данные |
|-------|------|
| `VestingAdded` | beneficiary, amount, cliff, duration |
| `TokensReleased` | beneficiary, amount |
| `RevenueDeposited` | depositor, amount |
| `RevenueClaimed` | beneficiary, amount |

---

## Сеть (Network)

| Параметр | Значение |
|-----------|-------|
| Сеть | OPNet Testnet (форк Signet) |
| URL RPC | `https://testnet.opnet.org` |
| Константа сети | `networks.opnetTestnet` |

> Используйте `networks.opnetTestnet` — НЕ `networks.testnet` (Testnet4 не поддерживается).

---

## Лицензия

MIT
