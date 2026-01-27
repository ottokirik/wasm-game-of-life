// ============================================================================
// ИМПОРТЫ ИЗ WASM
// ============================================================================
// wasm-bindgen генерирует эти файлы при компиляции:
// - 'game-of-life' - основной модуль с типами и функциями (game_of_life.d.ts)
// - 'game-of-life/game_of_life_bg.wasm' - скомпилированный WASM код
import { Cell, Universe } from 'game-of-life';
// ============================================================================
// КРИТИЧЕСКИЙ ИМПОРТ: ОБЪЕКТ ПАМЯТИ WASM
// ============================================================================
// 'memory' - это WebAssembly.Memory, содержащий линейную память WASM модуля
// Используется для прямого доступа к памяти Rust без копирования данных
import { memory } from 'game-of-life/game_of_life_bg.wasm';
import { useEffect, useRef } from 'react';

// ============================================================================
// REACT КОМПОНЕНТ
// ============================================================================
const App = () => {
  // Ref для хранения canvas элемента
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Ref для хранения экземпляра игры (чтобы не пересоздавался при ререндерах)
  const gameRef = useRef<Game | null>(null);

  // Инициализация игры при монтировании компонента
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    // Создаем экземпляр Game и сохраняем в ref
    const game = new Game(canvasRef.current);
    gameRef.current = game;
    game.run(); // Запускаем игровой цикл
  }, []);

  // Обработчик изменения скорости анимации
  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const speed = parseInt(e.target.value, 10);
    if (gameRef.current) {
      gameRef.current.setSpeed(speed);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div>
        <div
          style={{
            marginBottom: '10px',
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
            }}
          >
            Скорость:{' '}
            <input
              type="range"
              min="1"
              max="30"
              defaultValue="10"
              onChange={handleSpeedChange}
            />
          </label>
        </div>
        <canvas id="canvas" ref={canvasRef} style={{ border: '1px solid' }} />
      </div>
    </div>
  );
};

export default App;

// ============================================================================
// КЛАСС ИГРЫ - УПРАВЛЯЕТ ОТРИСОВКОЙ И ИГРОВЫМ ЦИКЛОМ
// ============================================================================
class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;

  // ============================================================================
  // ИНИЦИАЛИЗАЦИЯ WASM UNIVERSE
  // ============================================================================
  // Universe.new() - это Rust конструктор, экспортированный через wasm-bindgen
  // Возвращает JS объект с методами, которые вызывают Rust код
  private readonly universe: Universe = Universe.new();
  private readonly width = this.universe.width(); // Получаем ширину из Rust
  private readonly height = this.universe.height(); // Получаем высоту из Rust

  // Визуальные настройки
  private readonly cellSize: number = 10; // Размер клетки в пикселях
  private readonly gridColor: string = '#e9e9e9'; // Цвет сетки
  private readonly deadColor: string = '#f4f4f4'; // Цвет мертвой клетки
  private readonly aliveColor: string = '#3db700'; // Цвет живой клетки

  // Управление скоростью анимации
  private frameCount: number = 0; // Счетчик кадров
  private framesPerUpdate: number = 10; // Обновлять состояние каждые N кадров

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Вычисляем размер canvas с учетом сетки
    // (cellSize + 1) = размер клетки + 1 пиксель для линии сетки
    this.canvas.height = (this.cellSize + 1) * this.height + 1;
    this.canvas.width = (this.cellSize + 1) * this.width + 1;

    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.gameLoop = this.gameLoop.bind(this); // Привязываем контекст
  }

  private drawGrid() {
    this.ctx.beginPath();
    this.ctx.strokeStyle = this.gridColor;

    // Vertical lines.
    for (let i = 0; i <= this.width; i++) {
      this.ctx.moveTo(i * (this.cellSize + 1) + 1, 0);
      this.ctx.lineTo(
        i * (this.cellSize + 1) + 1,
        (this.cellSize + 1) * this.height + 1,
      );
    }

    // Horizontal lines.
    for (let j = 0; j <= this.height; j++) {
      this.ctx.moveTo(0, j * (this.cellSize + 1) + 1);
      this.ctx.lineTo(
        (this.cellSize + 1) * this.width + 1,
        j * (this.cellSize + 1) + 1,
      );
    }

    this.ctx.stroke();
  }

  private getIndex(row: number, column: number) {
    return row * this.width + column;
  }

  // ============================================================================
  // КРИТИЧЕСКИЙ МЕТОД: ЧТЕНИЕ ПАМЯТИ WASM БЕЗ КОПИРОВАНИЯ
  // ============================================================================
  // Это ключевой метод для понимания взаимодействия Rust и JavaScript!
  private drawCells() {
    // 1. ПОЛУЧАЕМ УКАЗАТЕЛЬ НА ПАМЯТЬ WASM
    // universe.cells() возвращает *const Cell из Rust (число-указатель)
    // Этот указатель указывает на начало массива cells в памяти WASM
    const cellsPtr = this.universe.cells();

    // 2. СОЗДАЕМ ПРЕДСТАВЛЕНИЕ НАД ПАМЯТЬЮ WASM
    // Uint8Array - это "вид" на участок памяти, а не копия
    // Параметры:
    //   - memory.buffer: это ArrayBuffer, содержащий всю линейную память WASM
    //   - cellsPtr: смещение в байтах от начала памяти
    //   - width * height: количество байт для чтения
    //
    // ВАЖНО: Здесь НЕ происходит копирования данных!
    // cells - это просто окно в память WASM. При изменении данных в Rust,
    // они сразу видны в JS через этот массив.
    const cells = new Uint8Array(
      memory.buffer,
      cellsPtr,
      this.width * this.height,
    );

    this.ctx.beginPath();

    // 3. ОТРИСОВКА КЛЕТОК ПО ДАННЫМ ИЗ ПАМЯТИ
    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const idx = this.getIndex(row, col);

        // Cell - это enum из Rust, где Dead = 0, Alive = 1
        // Благодаря #[repr(u8)] в Rust, это совместимо с Uint8Array
        this.ctx.fillStyle =
          cells[idx] === Cell.Dead ? this.deadColor : this.aliveColor;

        this.ctx.fillRect(
          col * (this.cellSize + 1) + 1,
          row * (this.cellSize + 1) + 1,
          this.cellSize,
          this.cellSize,
        );
      }
    }

    this.ctx.stroke();
  }

  // ============================================================================
  // ИГРОВОЙ ЦИКЛ
  // ============================================================================
  private gameLoop() {
    // Увеличиваем счетчик кадров для контроля скорости
    this.frameCount++;

    // Обновляем состояние игры только каждые framesPerUpdate кадров
    // Это позволяет замедлить анимацию для визуализации
    if (this.frameCount >= this.framesPerUpdate) {
      this.universe.tick(); // Вызываем Rust код для расчета следующего поколения
      this.frameCount = 0; // Сбрасываем счетчик
    }

    this.drawGrid(); // Отрисовываем сетку
    this.drawCells(); // Читаем данные из памяти WASM и отрисовываем клетки

    // Запрашиваем следующий кадр
    requestAnimationFrame(this.gameLoop);
  }

  // Запуск игры - первый кадр
  run() {
    this.drawGrid();
    this.drawCells();
    requestAnimationFrame(this.gameLoop);
  }

  // Изменение скорости анимации
  setSpeed(framesPerUpdate: number) {
    this.framesPerUpdate = framesPerUpdate;
  }
}

/*
 ============================================================================
 КЛЮЧЕВЫЕ МОМЕНТЫ ВЗАИМОДЕЙСТВИЯ RUST + JAVASCRIPT:
 ============================================================================

 1. СТРУКТУРА ПРОЕКТА:
    Rust (src/lib.rs):
      - Компилируется в WASM с помощью wasm-pack
      - #[wasm_bindgen] генерирует JS bindings
      - Генерирует файлы в pkg/:
        * game_of_life.js - JS обертки
        * game_of_life_bg.wasm - бинарный WASM
        * game_of_life.d.ts - TypeScript типы

 2. ПОТОК ДАННЫХ:

    Инициализация:
    Rust: Universe::new() → JS: new Universe()

    Вызов Rust из JS:
    JS: universe.tick() → вызывает Rust код в WASM

    Чтение данных (zero-copy):
    Rust: cells() → *const Cell (указатель)
         ↓
    JS: new Uint8Array(memory.buffer, cellsPtr, size)
         ↓
    Чтение из общей памяти без копирования

 3. ОБЪЕКТ memory:
    - Экспортируется из game_of_life_bg.wasm
    - Это WebAssembly.Memory - линейная память WASM модуля
    - Rust Vec<Cell> хранится в этой памяти
    - JS может создавать TypedArray представления над ней

 4. ПРЕИМУЩЕСТВА ТАКОГО ПОДХОДА:
    - Zero-copy: данные не копируются между Rust и JS
    - Производительность: вся логика в Rust (быстро)
    - Интероперабельность: JS управляет отображением

 5. ВАЖНЫЕ ДЕТАЛИ:
    - #[repr(u8)] гарантирует, что Cell = 1 байт (совместимо с Uint8Array)
    - as_ptr() возвращает указатель на начало Vec в памяти WASM
    - TypedArray в JS это "view" на память, а не копия
    - При изменении данных в Rust, они сразу видны в JS

 6. АЛЬТЕРНАТИВНЫЙ ПОДХОД (медленнее):
    - Вместо указателя возвращать Vec из Rust
    - wasm-bindgen скопирует данные в JS массив
    - При больших данных это существенные накладные расходы
*/
