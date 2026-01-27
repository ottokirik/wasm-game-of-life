// Импорт для форматирования вывода (метод to_string())
use std::fmt;
// wasm-bindgen обеспечивает взаимодействие между Rust и JavaScript
use wasm_bindgen::prelude::*;

// ============================================================================
// ЯЧЕЙКА (CELL)
// ============================================================================
// #[wasm_bindgen] делает enum доступным из JavaScript как Cell.Alive / Cell.Dead
// #[repr(u8)] гарантирует, что enum будет представлен как один байт (0 или 1)
//    Это критично для прямого доступа к памяти из JS
// Clone, Copy - можно копировать значения (для Cell это тривиально, т.к. это 1 байт)
#[wasm_bindgen]
#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Cell {
    Alive = 1, // Живая клетка = 1
    Dead = 0,  // Мертвая клетка = 0
}

// ============================================================================
// ВСЕЛЕННАЯ (UNIVERSE)
// ============================================================================
// Основная структура, хранящая состояние игрового поля
// #[wasm_bindgen] генерирует JS bindings для всех публичных методов в impl блоке
#[wasm_bindgen]
pub struct Universe {
    width: u32,       // Ширина поля в клетках
    height: u32,      // Высота поля в клетках
    cells: Vec<Cell>, // Плоский массив всех клеток (row * width + col)
}

#[wasm_bindgen]
impl Universe {
    // Конструктор universe - вызывается из JS как Universe.new()
    pub fn new() -> Self {
        let width = 64;
        let height = 64;

        // Инициализация поля простым паттерном (каждая 2-я и каждая 7-я клетка живая)
        // Это создает начальный паттерн для демонстрации
        let cells = (0..width * height)
            .map(|i| {
                if i % 2 == 0 || i % 7 == 0 {
                    Cell::Alive
                } else {
                    Cell::Dead
                }
            })
            .collect();

        Self {
            width,
            height,
            cells,
        }
    }

    // Геттер для ширины - доступен из JS как universe.width()
    pub fn width(&self) -> u32 {
        self.width
    }

    // Геттер для высоты - доступен из JS как universe.height()
    pub fn height(&self) -> u32 {
        self.height
    }

    // ============================================================================
    // КРИТИЧЕСКИЙ МЕТОД: ПРЯМОЙ ДОСТУП К ПАМЯТИ
    // ============================================================================
    // Возвращает указатель на начало массива cells в памяти WASM
    // Из JavaScript этот указатель используется для создания представления
    // над памятью WASM через Uint8Array, что позволяет читать данные БЕЗ копирования
    //
    // В JS это выглядит так:
    //   const cellsPtr = universe.cells();  // получаем указатель (число)
    //   const cells = new Uint8Array(memory.buffer, cellsPtr, width * height);
    //
    // Почему это важно: без копирования работа с памятью на порядок быстрее
    pub fn cells(&self) -> *const Cell {
        self.cells.as_ptr()
    }

    // Метод для текстового отображения universe (для отладки)
    pub fn render(&self) -> String {
        self.to_string()
    }

    // ============================================================================
    // ОСНОВНАЯ ЛОГИКА ИГРЫ: ОДИН ШАГ СИМУЛЯЦИИ
    // ============================================================================
    // Вычисляет следующее состояние поля по правилам игры "Жизнь"
    pub fn tick(&mut self) {
        // Клонируем текущее состояние для расчета следующего
        // Нельзя модифицировать self.cells в процессе, т.к. нужны исходные данные
        let mut next = self.cells.clone();

        for row in 0..self.height {
            for col in 0..self.width {
                let idx = self.get_index(row, col);
                let cell = self.cells[idx];
                let live_neighbors = self.live_neighbor_count(row, col);

                // Правила игры "Жизнь" Конвея:
                // 1. Живая клетка с < 2 соседями умирает (одиночество)
                // 2. Живая клетка с 2-3 соседями выживает
                // 3. Живая клетка с > 3 соседями умирает (перенаселение)
                // 4. Мертвая клетка с 3 соседями оживает (размножение)
                let next_cell = match (cell, live_neighbors) {
                    (Cell::Alive, x) if x < 2 => Cell::Dead,
                    (Cell::Alive, 2) | (Cell::Alive, 3) => Cell::Alive,
                    (Cell::Alive, x) if x > 3 => Cell::Dead,
                    (Cell::Dead, 3) => Cell::Alive,
                    (otherwise, _) => otherwise,
                };

                next[idx] = next_cell;
            }
        }

        // Заменяем текущее состояние на вычисленное
        self.cells = next;
    }

    // Перевод 2D координат в индекс в плоском массиве
    // Формула: index = row * width + column
    fn get_index(&self, row: u32, column: u32) -> usize {
        (row * self.width + column) as usize
    }

    // ============================================================================
    // ПОДСЧЕТ ЖИВЫХ СОСЕДЕЙ
    // ============================================================================
    // Считает живых соседей для клетки (row, column)
    // Вселенная "замкнута" - края соединены (тороидальная топология)
    fn live_neighbor_count(&self, row: u32, column: u32) -> u8 {
        let mut count = 0;

        // Проходим по всем 8 соседним клеткам (delta_row, delta_col)
        // [height-1, 0, 1] - это смещения: -1, 0, +1 (с учетом wrap-around)
        for delta_row in [self.height - 1, 0, 1].iter().cloned() {
            for delta_col in [self.width - 1, 0, 1].iter().cloned() {
                // Пропускаем саму клетку (0, 0)
                if delta_row == 0 && delta_col == 0 {
                    continue;
                }

                // Wrap-around для тороидальной топологии
                // (row + height - 1) % height дает row-1 с переходом через край
                let neighbor_row = (row + delta_row) % self.height;
                let neighbor_col = (column + delta_col) % self.width;
                let idx = self.get_index(neighbor_row, neighbor_col);
                count += self.cells[idx] as u8; // Cell.Alive = 1, Cell.Dead = 0
            }
        }
        count
    }
}

// ============================================================================
// ТЕКСТОВОЕ ПРЕДСТАВЛЕНИЕ ДЛЯ ОТЛАДКИ
// ============================================================================
// Реализует трейт Display для вывода universe в виде текста
// Используется методом render() для консольной отладки
impl fmt::Display for Universe {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        // Разбиваем плоский массив на строки по ширине поля
        for line in self.cells.as_slice().chunks(self.width as usize) {
            for &cell in line {
                // ◻ = мертвая, ◼ = живая
                let symbol = if cell == Cell::Dead { '◻' } else { '◼' };
                write!(f, "{}", symbol)?;
            }
            write!(f, "\n")?;
        }

        Ok(())
    }
}

/*
 ============================================================================
 КЛЮЧЕВЫЕ МОМЕНТЫ wasm-bindgen ДАННОГО ПРОЕКТА:
 ============================================================================

 1. АТРИБУТ #[wasm_bindgen]:
    - Генерирует JavaScript bindings для структур, enum'ов и функций
    - Публичные методы становятся доступны из JS
    - Конструктор new() вызывается как Universe.new()

 2. ПРЯМОЙ ДОСТУП К ПАМЯТИ (zero-copy):
    - Метод cells() возвращает *const Cell (указатель)
    - В JS создается Uint8Array поверх памяти WASM
    - Данные НЕ копируются, что дает существенный прирост производительности

 3. ВЗАИМОДЕЙСТВИЕ С JAVASCRIPT:

    В Rust (этом файле):
    - #[repr(u8)] гарантирует, что Cell = 1 байт
    - cells() возвращает указатель на память WASM
    - Память выделяется в куче WASM (Vec<Cell>)

    В JavaScript (App.tsx):
    - import { memory } загружает объект памяти WASM
    - new Uint8Array(memory.buffer, cellsPtr, width * height) создает представление
    - Чтение из этого массива читает прямо из памяти WASM

 4. WHY THIS MATTERS:
    - Без прямого доступа: копирование 64x64 = 4096 байт каждый кадр
    - С прямым доступом: 0 копирований, просто чтение из общей памяти
    - При 60 FPS это огромная разница в производительности
*/
