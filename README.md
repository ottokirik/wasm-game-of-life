# Game of Life - Rust + WebAssembly + React

Реализация игры "Жизнь" Конвея с использованием Rust, скомпилированного в WebAssembly, и React для визуализации.

## 🎯 Цель проекта

Этот проект служит **примером взаимодействия Rust и JavaScript** через WebAssembly, особенно в части:

- Передачи данных между Rust и JS **без копирования** (zero-copy)
- Использования крейта `wasm-bindgen` для создания bindings
- Прямого доступа к памяти WASM из JavaScript

> ⚠️ **Этот проект создан как справочный материал** для быстрого вспоминания особенностей интеграции Rust + WASM после длительного перерыва.

---

## 📁 Структура проекта

```
game-of-life/
├── src/
│   └── lib.rs              # Rust код с игровой логикой
├── web/
│   ├── src/
│   │   └── App.tsx         # React компонент с визуализацией
│   └── package.json        # Зависимости frontend
├── pkg/                    # Генерируется wasm-pack
│   ├── game_of_life.js     # JS обертки
│   ├── game_of_life_bg.wasm # WASM бинарник
│   ├── game_of_life.d.ts   # TypeScript типы
│   └── package.json
├── Cargo.toml              # Rust зависимости
└── Makefile                # Сценарии сборки
```

---

## 🚀 Быстрый старт

### Сборка проекта

```bash
# Установка Rust (если еще не установлен)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Установка wasm-pack
cargo install wasm-pack

# Сборка WASM и установка зависеностей frontend
make build
make install

# Запуск dev сервера
cd web && npm run dev
```

### Использование Makefile

```bash
make build        # Компиляция Rust в WASM (wasm-pack)
make install      # Установка npm зависенций
make run          # Запуск dev сервера
make clean        # Очистка сгенерированных файлов
```

---

## 🔑 Ключевые концепции

### 1. wasm-bindgen

Крейт `wasm-bindgen` обеспечивает взаимодействие между Rust и JavaScript:

```rust
// src/lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]  // ← Экспортирует структуру в JavaScript
pub struct Universe {
    width: u32,
    height: u32,
    cells: Vec<Cell>,
}

#[wasm_bindgen]
impl Universe {
    pub fn new() -> Self { ... }        // JS: Universe.new()
    pub fn tick(&mut self) { ... }      // JS: universe.tick()
    pub fn width(&self) -> u32 { ... }  // JS: universe.width()
}
```

**Что генерирует wasm-bindgen:**

- `game_of_life.js` - JavaScript обертки для вызова Rust функций
- `game_of_life_bg.wasm` - скомпилированный WebAssembly бинарник
- `game_of_life.d.ts` - TypeScript определения типов

---

### 2. Прямой доступ к памяти (Zero-Copy)

Это **критически важная часть** проекта для понимания производительности.

#### В Rust (src/lib.rs):

```rust
#[repr(u8)]  // ← Гарантирует, что enum занимает 1 байт
#[derive(Clone, Copy)]
pub enum Cell {
    Alive = 1,
    Dead = 0,
}

#[wasm_bindgen]
impl Universe {
    // Возвращает указатель на массив в памяти WASM
    pub fn cells(&self) -> *const Cell {
        self.cells.as_ptr()  // ← Указатель на Vec<Cell>
    }
}
```

#### В JavaScript (web/src/App.tsx):

```typescript
// Импортируем объект памяти WASM
import { memory } from 'game-of-life/game_of_life_bg.wasm';

// Получаем указатель на данные
const cellsPtr = universe.cells();

// Создаем "вид" на память WASM - БЕЗ копирования!
const cells = new Uint8Array(
    memory.buffer,      // ← Вся линейная память WASM
    cellsPtr,           // ← Смещение (указатель из Rust)
    width * height      // ← Размер в байтах
);

// Теперь читаем данные напрямую из памяти WASM
for (let i = 0; i < cells.length; i++) {
    const isAlive = cells[i] === 1;  // Чтение без копирования
}
```

**Почему это важно:**

- ❌ **Без прямого доступа**: Копирование `64 × 64 = 4096` байт каждый кадр
- ✅ **С прямым доступом**: 0 копирований, просто чтение из общей памяти
- 📈 При 60 FPS это **огромная разница в производительности**

---

### 3. Поток данных

```
┌─────────────────────────────────────────────────────────────┐
│                        ИНИЦИАЛИЗАЦИЯ                         │
└─────────────────────────────────────────────────────────────┘

Rust (lib.rs)                    JavaScript (App.tsx)
─────────────                    ──────────────────────────────
Universe::new() ──────┐          import { Universe } from ...
                      │
                      ├────────→  const universe = Universe.new();
                      │           // Получает экземпляр Universe
                      ↓

┌─────────────────────────────────────────────────────────────┐
│                     ВЫЗОВ RUST ИЗ JS                         │
└─────────────────────────────────────────────────────────────┘

JavaScript                       Rust
─────────────────────────────    ──────────────
universe.tick() ─────────┐       pub fn tick(&mut self) {
                         ├──────→     // Вычисляет следующее поколение
                         │            let mut next = self.cells.clone();
                         │            // ... логика игры ...
                         │            self.cells = next;
                         ↓            }

┌─────────────────────────────────────────────────────────────┐
│                   ЧТЕНИЕ ДАННЫХ (ZERO-COPY)                  │
└─────────────────────────────────────────────────────────────┘

Rust                            JavaScript
─────────────────────────────   ──────────────────────────────
pub fn cells() -> *const Cell {  const cellsPtr = universe.cells();
    self.cells.as_ptr()         const cells = new Uint8Array(
} ─────────────────────┐             memory.buffer,
                        │             cellsPtr,
                        ├────────────→  width * height
                        ↓           );
                        │           // cells теперь "видит" память WASM
                        │
                        │           // Чтение данных
                        └──────────→  const cell = cells[i];  // Без копирования!
```

---

## 📖 Подробное объяснение кода

### Rust: `src/lib.rs`

#### 1. Типы данных

```rust
#[wasm_bindgen]           // Экспорт в JS
#[repr(u8)]               // 1 байт (важно для совместимости с Uint8Array)
#[derive(Clone, Copy)]    // Можно копировать значения
pub enum Cell {
    Alive = 1,            // Живая = 1
    Dead = 0,             // Мертвая = 0
}

#[wasm_bindgen]
pub struct Universe {
    width: u32,           // Ширина поля
    height: u32,          // Высота поля
    cells: Vec<Cell>,     // Плоский массив: row * width + col
}
```

#### 2. Методы для взаимодействия с JS

```rust
#[wasm_bindgen]
impl Universe {
    // Конструктор - вызывается как Universe.new() из JS
    pub fn new() -> Self { ... }

    // Геттеры размеров
    pub fn width(&self) -> u32 { self.width }
    pub fn height(&self) -> u32 { self.height }

    // ⚠️ Ключевой метод - возвращает указатель на память
    pub fn cells(&self) -> *const Cell {
        self.cells.as_ptr()  // Указатель на начало Vec
    }

    // Основная логика игры
    pub fn tick(&mut self) {
        // Вычисляет следующее поколение по правилам Конвея
        // ...
    }
}
```

#### 3. Правила игры "Жизнь"

```rust
// В методе tick():
match (cell, live_neighbors) {
    (Cell::Alive, x) if x < 2 => Cell::Dead,      // Одиночество
    (Cell::Alive, 2) | (Cell::Alive, 3) => Cell::Alive,  // Выживание
    (Cell::Alive, x) if x > 3 => Cell::Dead,      // Перенаселение
    (Cell::Dead, 3) => Cell::Alive,               // Размножение
    (otherwise, _) => otherwise,                   // Без изменений
}
```

### JavaScript: `web/src/App.tsx`

#### 1. Импорт WASM модуля

```typescript
// Основной модуль с типами и функциями
import { Cell, Universe } from 'game-of-life';

// ⚠️ Критично: объект памяти WASM
import { memory } from 'game-of-life/game_of_life_bg.wasm';
```

#### 2. Чтение памяти WASM

```typescript
private drawCells() {
    // 1. Получаем указатель на данные в памяти WASM
    const cellsPtr = this.universe.cells();

    // 2. Создаем представление над памятью (БЕЗ копирования!)
    const cells = new Uint8Array(
        memory.buffer,      // ArrayBuffer всей памяти WASM
        cellsPtr,           // Смещение от начала
        this.width * this.height  // Размер
    );

    // 3. Читаем данные напрямую
    for (let row = 0; row < this.height; row++) {
        for (let col = 0; col < this.width; col++) {
            const idx = row * this.width + col;
            const isAlive = cells[idx] === Cell.Alive;
            // Отрисовываем...
        }
    }
}
```

#### 3. Игровой цикл

```typescript
private gameLoop() {
    // Обновляем состояние (вызываем Rust код)
    this.universe.tick();

    // Читаем данные из памяти WASM и отрисовываем
    this.drawCells();

    // Следующий кадр
    requestAnimationFrame(this.gameLoop);
}
```

---

## 🔧 Компиляция

### В Rust (Cargo.toml)

```toml
[package]
name = "game-of-life"
edition = "2021"

[dependencies]
wasm-bindgen = "0.2.100"

[lib]
crate-type = ["cdylib"]  # C dynamic library (для WASM)
```

### Команда сборки

```bash
# wasm-pack компилирует Rust в WASM и генерирует JS bindings
wasm-pack build --target web --out-dir pkg

# Генерирует:
# - pkg/game_of_life.js          # JS обертки
# - pkg/game_of_life_bg.wasm     # WASM бинарник
# - pkg/game_of_life.d.ts        # TypeScript типы
# - pkg/package.json
```

---

## 📊 Сравнение подходов

### ❌ Подход с копированием (медленно)

```rust
// Возвращает Vec, который wasm-bindgen скопирует в JS массив
#[wasm_bindgen]
pub fn get_cells_copy(&self) -> Vec<Cell> {
    self.cells.clone()  // Копирование данных!
}
```

```javascript
// Данные копируются из WASM памяти в JS массив
const cells = universe.get_cells_copy();
// При каждом вызове: 4096 байт копируются
```

### ✅ Подход с прямым доступом (быстро)

```rust
// Возвращает указатель - никаких копирований
#[wasm_bindgen]
pub fn cells(&self) -> *const Cell {
    self.cells.as_ptr()  // Просто указатель
}
```

```javascript
// Создаем "вид" на память - 0 копирований
const cells = new Uint8Array(memory.buffer, cellsPtr, size);
// Данные читаются напрямую из памяти WASM
```

**Производительность (при 60 FPS для поля 64×64):**

- С копированием: ~2.4 MB/second копируемых данных
- С прямым доступом: ~0 MB/second копирования

---

## 🎨 Визуализация

Проект использует Canvas API для отрисовки:

- **Размер клетки**: 10×10 пикселей
- **Поле**: 64×64 клетки
- **Canvas размер**: ~707×707 пикселей (с сеткой)
- **Цвета**:
  - Живая: `#3db700` (зеленый)
  - Мертвая: `#f4f4f4` (серый)
  - Сетка: `#e9e9e9` (светло-серый)

---

## 📚 Полезные ресурсы

### Документация

- [wasm-bindgen](https://rustwasm.github.io/wasm-bindgen/) - Официальная документация
- [Rust WASM Book](https://rustwasm.github.io/docs/book/) - Книга по Rust + WASM
- [MDN WebAssembly](https://developer.mozilla.org/en-US/docs/WebAssembly) - Док. по WASM

### Ключевые концепции

- **WebAssembly.Memory**: Линейная память WASM модуля
- **TypedArray**: JavaScript "виды" на бинарные данные (Uint8Array, etc.)
- **zero-copy**: Передача данных без копирования через общую память

---

## 🤔 Частые вопросы

### Зачем нужен `#[repr(u8)]`?

Гарантирует, что `Cell` будет занимать ровно 1 байт в памяти, что совместимо с `Uint8Array` в JavaScript. Без этого Rust может использовать другой размер для enum.

### Что такое `*const Cell`?

Это "сырой" указатель на начало массива в памяти. В JavaScript это просто число (смещение), которое используется для создания `Uint8Array` над памятью WASM.

### Почему бы не возвращать `Vec<Cell>` из Rust?

`wasm-bindgen` скопировал бы данные из WASM памяти в JavaScript массив, что медленно. Прямой доступ к памяти через указатель намного быстрее.

### Что такое `memory.buffer`?

Это `ArrayBuffer` - JavaScript объект, представляющий непрерывный участок бинарных данных. В данном случае - вся линейная память WASM модуля.

---

## 🧹 Управление памятью

### ❓ Как освобождается память WASM?

Это важный вопрос! Когда мы используем память из Rust, нужно понимать, как и когда она освобождается.

#### Короткий ответ:

Память **автоматически освобождается** браузером при закрытии вкладки. Вам **не нужно** делать ничего вручную.

#### Подробности:

```typescript
// В JavaScript:
const universe = Universe.new();
// ↑ Здесь в Rust выделяется Vec<Cell> в куче WASM
//   (64 × 64 = 4096 байт)

// Когда пользователь закрывает вкладку:
// 1. Браузер уничтожает все JavaScript объекты
// 2. Уничтожает WebAssembly.Instance
// 3. Освобождает всю линейную память WASM
// 4. Вся память (включая Vec<Cell>) возвращается системе
```

#### ⚠️ Важный нюанс:

**JavaScript не может явно освободить память**, выделенную в Rust, пока WASM модуль жив.

```typescript
// Это НЕ освободит память в WASM:
gameRef.current = null;

// Память Vec<Cell> останется занятой до уничтожения всего WASM модуля!
// JavaScript сборщик мусора может очистить только JS объекты,
// но не память внутри WASM модуля.
```

#### Почему так?

Память WASM - это **один большой `ArrayBuffer`**, который управляется целиком:

```
┌─────────────────────────────────────────────────┐
│         WebAssembly.Memory (ArrayBuffer)        │
├─────────────────────────────────────────────────┤
│  Vec<Cell> (4096 байт)  │  Другие данные  │ ... │
└─────────────────────────────────────────────────┘
←── Браузер может освободить только весь блок
```

Браузер не может освободить часть `ArrayBuffer` - только весь блок целиком при уничтожении страницы.

#### Что происходит в разных сценариях:

| Сценарий | Что происходит с памятью |
|----------|-------------------------|
| Закрытие вкладки | ✅ Вся память WASM освобождается |
| Переход на другой URL | ✅ Старая страница уничтожается, память освобождается |
| Обновление страницы (F5) | ✅ Старая страница уничтожается, память освобождается |
| Присваивание `universe = null` | ❌ Память НЕ освобождается (остается в WASM) |
| Размонтирование React компонента | ❌ Память НЕ освобождается |

#### ✅ Правильный подход для вашего проекта:

Для простой игры, которая живёт пока открыта вкладка:

```typescript
// В App.tsx - ПРАВИЛЬНО:
useEffect(() => {
    const game = new Game(canvasRef.current);
    gameRef.current = game;  // Сохраняем ссылку
    game.run();

    // Нет cleanup функции - не нужно!
    // Браузер сам освободит всё при закрытии вкладки
}, []);
```

**Это безопасно**, потому что:
- Игра живёт всё время, пока открыта вкладка
- При закрытии вкладки браузер уничтожит всё автоматически
- Нет необходимости в явной очистке

#### 🚨 Если нужна явная очистка (для реальных приложений):

Если бы вы создавали/уничтожали экземпляры `Universe` в течение сессии (например, кнопка "Рестарт"), нужно добавить метод в Rust:

```rust
// src/lib.rs
#[wasm_bindgen]
impl Universe {
    // Явный метод для освобождения памяти
    pub fn destroy(&mut self) {
        self.cells.clear();  // Очищаем Vec
        // Память помечается как свободная для переиспользования в WASM
        // (но не возвращается системе!)
    }
}
```

```typescript
// web/src/App.tsx
const handleRestart = () => {
    // Явно освобождаем память перед созданием нового экземпляра
    gameRef.current.universe.destroy();

    // Создаем новую игру
    const game = new Game(canvasRef.current);
    gameRef.current = game;
    game.run();
};
```

⚠️ **Важно**: Даже `destroy()` не возвращает память системе - она просто переиспользуется внутри WASM. Полная очистка происходит только при уничтожении модуля.

#### Потенциальная утечка памяти:

❌ **Плохой код** - создает новые экземпляры без очистки:

```typescript
// НЕ ДЕЛАЙТЕ ТАК!
useEffect(() => {
    const game = new Game(canvasRef.current);
    // Не сохраняем ссылку, просто создаём
    game.run();

    // При каждом ререндере эффект выполнится снова
    // Будет создан НОВЫЙ Universe с НОВЫМ Vec<Cell>
    // Старые останутся в памяти WASM навсегда (утечка!)
}, [someDependency]);
```

✅ **Правильный код** - из вашего проекта:

```typescript
useEffect(() => {
    if (!canvasRef.current) return;

    const game = new Game(canvasRef.current);
    gameRef.current = game;  // Сохраняем ссылку
    game.run();

    // Эффект выполняется только ОДИН РАЗ (пустой массив зависимостей)
    // Утечки памяти нет
}, []);
```

#### Итог:

Для этого проекта:
- ✅ Браузер сам всё очистит при закрытии вкладки
- ✅ Ваш код правильный - утечек нет
- ✅ Ничего дополнительно делать не нужно

Для сложных приложений:
- Добавьте метод `destroy()` в Rust
- Вызывайте его перед созданием нового экземпляра
- Помните: это переиспользует память внутри WASM, но не возвращает её системе

---

## 📝 License

MIT

---

**Создан как справочный материал для изучения Rust + WebAssembly интеграции.**
