import { Cell, Universe } from 'game-of-life';
import { memory } from 'game-of-life/game_of_life_bg.wasm';
import { useEffect, useRef } from 'react';

const App = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game | null>(null);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const game = new Game(canvasRef.current);
    gameRef.current = game;
    game.run();
  }, []);

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

class Game {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;

  private readonly universe: Universe = Universe.new();
  private readonly width = this.universe.width();
  private readonly height = this.universe.height();

  private readonly cellSize: number = 10;
  private readonly gridColor: string = '#e9e9e9';
  private readonly deadColor: string = '#f4f4f4';
  private readonly aliveColor: string = '#3db700';

  // Счетчик кадров для замедления анимации
  private frameCount: number = 0;
  // Обновлять состояние игры каждые N кадров
  private framesPerUpdate: number = 10;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.height = (this.cellSize + 1) * this.height + 1;
    this.canvas.width = (this.cellSize + 1) * this.width + 1;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.gameLoop = this.gameLoop.bind(this);
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

  private drawCells() {
    const cellsPtr = this.universe.cells();
    const cells = new Uint8Array(
      memory.buffer,
      cellsPtr,
      this.width * this.height,
    );

    this.ctx.beginPath();

    for (let row = 0; row < this.height; row++) {
      for (let col = 0; col < this.width; col++) {
        const idx = this.getIndex(row, col);

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

  private gameLoop() {
    // Увеличиваем счетчик кадров
    this.frameCount++;

    // Обновляем состояние игры только каждые framesPerUpdate кадров
    if (this.frameCount >= this.framesPerUpdate) {
      this.universe.tick();
      this.frameCount = 0; // Сбрасываем счетчик
    }

    this.drawGrid();
    this.drawCells();

    requestAnimationFrame(this.gameLoop);
  }

  run() {
    this.drawGrid();
    this.drawCells();
    requestAnimationFrame(this.gameLoop);
  }

  // Метод для изменения скорости анимации
  setSpeed(framesPerUpdate: number) {
    // Обновляем количество кадров между обновлениями состояния
    this.framesPerUpdate = framesPerUpdate;
  }
}
