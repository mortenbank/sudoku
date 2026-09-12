import { generatePuzzle } from './generator.js';
import { t, translations, difficultyLabel } from './i18n.js';
import { isValidPlacement } from './sudoku.js';
import { TECHNIQUE_LABELS, candidatesForCell, lockedCandidateEliminations } from './techniques.js';
import { VERSION } from './version.js';
import { sanitizeInitials, normalizeInitialsInput, buildScoreEntry, readRememberedInitials, writeRememberedInitials } from './highscore-rules.js';
import { fetchSharedHighScores, submitSharedHighScore } from './highscores-api.js';

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const boardElement = document.getElementById('sudoku-board');
    const keypad = document.getElementById('keypad');
    const keypadNumbersElement = document.getElementById('keypad-numbers');
    const newGameBtn = document.getElementById('new-game-btn');
    const difficultySelect = document.getElementById('difficulty-select');
    const notesToggleCheckbox = document.getElementById('notes-toggle-checkbox');
    const helperToggleCheckbox = document.getElementById('helper-toggle-checkbox');
    const highscoreContainer = document.getElementById('highscore-container');
    const highscoreTitle = document.getElementById('highscore-title');
    const highscoreSource = document.getElementById('highscore-source');
    const highscorePrompt = document.getElementById('highscore-prompt');
    const highscoreHeaders = document.getElementById('highscore-headers');
    const highscoreList = document.getElementById('highscore-list');
    const appVersionEl = document.getElementById('app-version');
    const timerElement = document.getElementById('timer');
    const errorsElement = document.getElementById('errors');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingDetail = document.getElementById('loading-detail');
    const techniqueGradeEl = document.getElementById('technique-grade');
    const geminiHintBtn = document.getElementById('gemini-hint-btn');
    const hintModal = document.getElementById('hint-modal');
    const hintTitle = document.getElementById('hint-title');
    const closeHintModalBtn = document.getElementById('close-hint-modal');
    const hintContent = document.getElementById('hint-content');
    const hintLoader = document.getElementById('hint-loader');
    const langSelector = document.querySelector('.lang-selector');
    const apiKeyModal = document.getElementById('api-key-modal');
    const apiKeyInput = document.getElementById('api-key-input');
    const saveApiKeyBtn = document.getElementById('save-api-key');
    const cancelApiKeyBtn = document.getElementById('cancel-api-key');
    const hintChoiceMenu = document.getElementById('hint-choice-menu');

    let boardData = [];
    let solution = [];
    let selectedCell = { row: -1, col: -1 };
    let isNoteMode = false;
    let isHelperMode = false;
    let wasNoteUsed = false;
    let wasHelperUsed = false;
    let isGameActive = false;
    let errorCount = 0;
    let timerInterval;
    let secondsElapsed = 0;
    let saveInterval;
    const size = 9;
    let currentLang = 'da';
    let currentGrade = null;
    let lastTap = 0;
    let lastTapTarget = null;
    let hintClickTimer = null;
    let hintClickCount = 0;
    let highscoreAwaitingInitials = false;
    let pendingWinScore = null;
    let lastHighscoreView = null;

    function valuesGrid() {
        return boardData.map((row) => row.map((cell) => cell.value));
    }

    function updateUIText(lang) {
        currentLang = lang;
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-translate]').forEach((el) => {
            const key = el.dataset.translate;
            if (!translations[lang][key]) return;
            if (el.id === 'errors') {
                el.textContent = t(lang, key, errorCount);
            } else {
                el.textContent = t(lang, key);
            }
        });
        langSelector.querySelectorAll('a').forEach((a) => {
            a.classList.toggle('active', a.dataset.lang === lang);
        });
    }

    function setLanguage(lang) {
        localStorage.setItem('sudokuLang', lang);
        updateUIText(lang);
        updateGradeLabel();
        refreshHighscoreCopy();
    }

    function setHighscoreDifficultyTitle(difficulty) {
        if (!highscoreTitle) return;
        highscoreTitle.dataset.difficulty = difficulty || '';
        highscoreTitle.textContent = difficulty ? difficultyLabel(currentLang, difficulty).toUpperCase() : '';
    }

    function setHighscoreSourceLabel(source) {
        if (!highscoreSource) return;
        highscoreSource.dataset.source = source || '';
        if (source === 'shared') highscoreSource.textContent = t(currentLang, 'highscoreShared');
        else if (source === 'local-error') highscoreSource.textContent = t(currentLang, 'highscoreLoadError');
        else if (source === 'local') highscoreSource.textContent = t(currentLang, 'highscoreLocalFallback');
        else highscoreSource.textContent = '';
    }

    function refreshHighscoreCopy() {
        if (!highscoreContainer || highscoreContainer.classList.contains('hidden')) return;
        if (highscoreAwaitingInitials && pendingWinScore) {
            showInitialsPrompt();
            return;
        }
        if (lastHighscoreView) {
            displayHighScores(
                lastHighscoreView.difficulty,
                lastHighscoreView.highlightId,
                lastHighscoreView.scores,
                lastHighscoreView.source,
            );
        } else if (highscoreTitle?.dataset.difficulty) {
            setHighscoreDifficultyTitle(highscoreTitle.dataset.difficulty);
            setHighscoreSourceLabel(highscoreSource?.dataset.source);
        }
    }

    function updateGradeLabel() {
        if (!techniqueGradeEl) return;
        if (!currentGrade || !currentGrade.hardest) {
            techniqueGradeEl.textContent = '';
            return;
        }
        const label = TECHNIQUE_LABELS[currentGrade.hardest] || currentGrade.hardest;
        techniqueGradeEl.textContent = t(currentLang, 'requiresTechnique', label);
    }

    function isNoteValid(row, col, num) {
        return isValidPlacement(valuesGrid(), row, col, num);
    }

    function getLocalHint() {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                if (boardData[r][c].value !== 0) continue;
                const candidates = candidatesForCell(valuesGrid(), r, c);
                if (candidates.length === 1) {
                    return {
                        text: t(currentLang, 'localHintNaked', r + 1, c + 1),
                        highlightCell: { r, c },
                    };
                }
            }
        }
        for (const unit of ['row', 'col', 'box']) {
            for (let i = 0; i < 9; i++) {
                for (let num = 1; num <= 9; num++) {
                    const possibleCells = [];
                    for (let j = 0; j < 9; j++) {
                        let r;
                        let c;
                        if (unit === 'row') {
                            r = i;
                            c = j;
                        } else if (unit === 'col') {
                            r = j;
                            c = i;
                        } else {
                            r = Math.floor(i / 3) * 3 + Math.floor(j / 3);
                            c = (i % 3) * 3 + (j % 3);
                        }
                        if (boardData[r][c].value === 0 && candidatesForCell(valuesGrid(), r, c).includes(num)) {
                            possibleCells.push({ r, c });
                        }
                    }
                    if (possibleCells.length === 1) {
                        const { r, c } = possibleCells[0];
                        const unitName =
                            unit === 'box'
                                ? t(currentLang, 'unitBox', i + 1)
                                : unit === 'row'
                                  ? t(currentLang, 'unitRow', i + 1)
                                  : t(currentLang, 'unitCol', i + 1);
                        return {
                            text: t(currentLang, 'localHintHidden', unitName, num),
                            highlightCell: { r, c },
                        };
                    }
                }
            }
        }
        return { text: t(currentLang, 'noHintFound'), highlightCell: null };
    }

    function getPossibleNotes(row, col, advancedNotesMap) {
        const possible = { normal: [], advanced: [] };
        const key = `${row},${col}`;
        const advancedSet = advancedNotesMap[key] || {};
        for (let num = 1; num <= 9; num++) {
            if (!isNoteValid(row, col, num)) continue;
            if (advancedSet[num]) possible.advanced.push(num);
            else possible.normal.push(num);
        }
        return possible;
    }

    function drawBoard() {
        boardElement.innerHTML = '';
        const advancedNotesMap = isHelperMode ? lockedCandidateEliminations(valuesGrid()) : {};

        for (let i = 0; i < size * size; i++) {
            const r = Math.floor(i / size);
            const c = i % size;
            const cell = boardData[r][c];
            const cellElement = document.createElement('div');
            cellElement.dataset.row = r;
            cellElement.dataset.col = c;
            cellElement.className =
                'cell w-full aspect-square flex items-center justify-center cursor-pointer transition-colors duration-150';

            if (cell.value !== 0) {
                cellElement.textContent = cell.value;
                cellElement.classList.add(cell.isPrefilled ? 'pre-filled' : 'user-filled');
                if (cell.isLocked) cellElement.classList.add('user-locked');
                if (cell.isIncorrect) cellElement.classList.add('incorrect');
            } else if (Object.keys(cell.notes).length > 0) {
                const noteGrid = document.createElement('div');
                noteGrid.className = 'note-grid';
                for (let n = 1; n <= 9; n++) {
                    const noteSpan = document.createElement('span');
                    if (cell.notes[n]) {
                        noteSpan.textContent = n;
                        if (cell.notes[n].isIncorrect) noteSpan.classList.add('note-incorrect');
                        if (isHelperMode && cell.notes[n].isAdvanced) noteSpan.classList.add('note-advanced');
                    }
                    noteGrid.appendChild(noteSpan);
                }
                cellElement.appendChild(noteGrid);
            }
            boardElement.appendChild(cellElement);
        }
        highlightCells();
    }

    function highlightCells() {
        document.querySelectorAll('.cell').forEach((c) =>
            c.classList.remove('selected', 'highlight', 'highlight-same-number', 'hint-cell'),
        );
        if (isHelperMode) {
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (boardData[r][c].value !== 0) {
                        boardElement.children[r * size + c].classList.add('highlight');
                    }
                }
            }
        }
        if (selectedCell.row === -1) return;
        const { row, col } = selectedCell;
        const selectedValue = boardData[row][col].value;
        if (selectedValue !== 0) {
            for (let r = 0; r < size; r++) {
                for (let c = 0; c < size; c++) {
                    if (boardData[r][c].value === selectedValue) {
                        boardElement.children[r * size + c].classList.add('highlight-same-number');
                    }
                }
            }
        }
        if (isHelperMode && selectedValue !== 0) {
            for (let rInstance = 0; rInstance < size; rInstance++) {
                for (let cInstance = 0; cInstance < size; cInstance++) {
                    if (boardData[rInstance][cInstance].value !== selectedValue) continue;
                    const startRow = rInstance - (rInstance % 3);
                    const startCol = cInstance - (cInstance % 3);
                    for (let i = 0; i < size; i++) {
                        boardElement.children[rInstance * size + i].classList.add('highlight');
                        boardElement.children[i * size + cInstance].classList.add('highlight');
                    }
                    for (let i = 0; i < 3; i++) {
                        for (let j = 0; j < 3; j++) {
                            boardElement.children[(startRow + i) * size + (startCol + j)].classList.add('highlight');
                        }
                    }
                }
            }
        }
        boardElement.children[row * size + col].classList.add('selected');
    }

    function updateKeypadUI() {
        const counts = {};
        for (let i = 1; i <= 9; i++) counts[i] = 0;
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (boardData[r][c].value !== 0) counts[boardData[r][c].value]++;
            }
        }
        for (let i = 1; i <= 9; i++) {
            const button = keypadNumbersElement.children[i - 1];
            button.classList.toggle('keypad-btn-hidden', counts[i] === 9);
            button.classList.toggle('pointer-events-none', counts[i] === 9);
        }
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${minutes}:${secs}`;
    }

    function updateTimer() {
        secondsElapsed++;
        timerElement.textContent = formatTime(secondsElapsed);
    }

    function startGameTimer() {
        if (isGameActive) return;
        isGameActive = true;
        timerInterval = setInterval(updateTimer, isHelperMode ? 500 : 1000);
        saveInterval = setInterval(saveGameState, 5000);
    }

    async function startNewGame() {
        highscoreAwaitingInitials = false;
        pendingWinScore = null;
        lastHighscoreView = null;
        if (highscorePrompt) {
            highscorePrompt.classList.add('hidden');
            highscorePrompt.innerHTML = '';
        }
        setHighscoreDifficultyTitle('');
        setHighscoreSourceLabel('');
        highscoreContainer.classList.add('hidden');
        boardElement.classList.remove('board-inactive');
        keypad.classList.remove('board-inactive');
        clearInterval(timerInterval);
        clearInterval(saveInterval);
        clearSavedGameState();
        isGameActive = false;

        const difficulty = difficultySelect.value;
        loadingOverlay.classList.remove('hidden');
        loadingDetail.textContent = t(currentLang, 'generatingDetail', t(currentLang, difficulty));
        await new Promise((resolve) => setTimeout(resolve, 40));

        const generated = await generatePuzzle(difficulty, {
            onProgress: ({ attempts, phase, grade }) => {
                const hint = grade?.hardest ? ` → ${grade.hardest}` : '';
                loadingDetail.textContent = `${t(currentLang, 'generatingDetail', t(currentLang, difficulty))} (${attempts}, ${phase}${hint})`;
            },
        });

        currentGrade = generated.grade;
        solution = generated.solution;
        boardData = generated.puzzle.map((row) =>
            row.map((cell) => ({
                value: cell,
                isPrefilled: cell !== 0,
                notes: {},
                isIncorrect: false,
                isLocked: false,
            })),
        );
        loadingOverlay.classList.add('hidden');
        loadingDetail.textContent = '';

        selectedCell = { row: -1, col: -1 };
        if (notesToggleCheckbox.checked) {
            notesToggleCheckbox.checked = false;
            isNoteMode = false;
        }
        if (helperToggleCheckbox.checked) {
            helperToggleCheckbox.checked = false;
            isHelperMode = false;
            geminiHintBtn.classList.add('hidden');
        }
        wasNoteUsed = false;
        wasHelperUsed = false;
        errorCount = 0;
        secondsElapsed = 0;
        updateUIText(currentLang);
        updateGradeLabel();
        timerElement.textContent = '00:00';
        timerElement.classList.remove('text-red-600');
        drawBoard();
        updateKeypadUI();
    }

    function setupLoadedGame() {
        isGameActive = true;
        clearInterval(timerInterval);
        clearInterval(saveInterval);
        updateUIText(currentLang);
        updateGradeLabel();
        timerElement.classList.toggle('text-red-600', isHelperMode);
        geminiHintBtn.classList.toggle('hidden', !isHelperMode);
        timerElement.textContent = formatTime(secondsElapsed);
        timerInterval = setInterval(updateTimer, isHelperMode ? 500 : 1000);
        saveInterval = setInterval(saveGameState, 5000);
        drawBoard();
        updateKeypadUI();
    }

    function checkWinCondition() {
        for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
                if (boardData[r][c].value === 0 || boardData[r][c].value !== solution[r][c]) return;
            }
        }
        clearInterval(timerInterval);
        clearInterval(saveInterval);
        clearSavedGameState();
        isGameActive = false;
        pendingWinScore = {
            time: secondsElapsed,
            errors: errorCount,
            difficulty: difficultySelect.value,
            noteUsed: wasNoteUsed,
            helperUsed: wasHelperUsed,
            date: Date.now(),
        };
        showInitialsPrompt();
    }

    function handleCellClick(e) {
        if (!isGameActive) startGameTimer();
        const target = e.target.closest('.cell');
        if (!target) return;
        selectedCell.row = parseInt(target.dataset.row, 10);
        selectedCell.col = parseInt(target.dataset.col, 10);
        highlightCells();
    }

    function handleCellRightClick(e) {
        e.preventDefault();
        if (!isGameActive) startGameTimer();
        const target = e.target.closest('.cell');
        if (!target) return;
        const row = parseInt(target.dataset.row, 10);
        const col = parseInt(target.dataset.col, 10);
        const cell = boardData[row][col];
        if (cell.isPrefilled || cell.value !== 0 || cell.isLocked) return;
        if (Object.keys(cell.notes).length > 0) {
            cell.notes = {};
        } else if (isNoteMode) {
            const advancedNotesMap = lockedCandidateEliminations(valuesGrid());
            const possible = getPossibleNotes(row, col, advancedNotesMap);
            possible.normal.forEach((num) => {
                cell.notes[num] = { isIncorrect: false, isAdvanced: false };
            });
            possible.advanced.forEach((num) => {
                cell.notes[num] = { isIncorrect: false, isAdvanced: true };
            });
        }
        drawBoard();
    }

    function handleCellMouseOver(e) {
        const target = e.target.closest('.cell');
        if (!isNoteMode || !isHelperMode || !target) return;
        const row = parseInt(target.dataset.row, 10);
        const col = parseInt(target.dataset.col, 10);
        if (boardData[row][col].value !== 0) return;
        if (target.querySelector('.temp-note-grid')) return;
        const possibleNotes = getPossibleNotes(row, col, {});
        const allPossible = [...possibleNotes.normal, ...possibleNotes.advanced];
        const tempNoteGrid = document.createElement('div');
        tempNoteGrid.className = 'temp-note-grid';
        for (let n = 1; n <= 9; n++) {
            const noteSpan = document.createElement('span');
            if (allPossible.includes(n)) noteSpan.textContent = n;
            tempNoteGrid.appendChild(noteSpan);
        }
        target.appendChild(tempNoteGrid);
    }

    function handleCellMouseOut(e) {
        const target = e.target.closest('.cell');
        if (!target) return;
        const tempNoteGrid = target.querySelector('.temp-note-grid');
        if (tempNoteGrid) tempNoteGrid.remove();
    }

    function updateNotes(row, col, num) {
        for (let i = 0; i < size; i++) {
            delete boardData[row][i].notes[num];
            delete boardData[i][col].notes[num];
        }
        const startRow = row - (row % 3);
        const startCol = col - (col % 3);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) delete boardData[i + startRow][j + startCol].notes[num];
        }
    }

    function handleKeypadInput(num, isNote = false) {
        if (!isGameActive) startGameTimer();
        if (selectedCell.row === -1 || boardData[selectedCell.row][selectedCell.col].value !== 0) {
            let found = false;
            for (let r = 0; r < size && !found; r++) {
                for (let c = 0; c < size; c++) {
                    if (boardData[r][c].value === num) {
                        selectedCell = { row: r, col: c };
                        found = true;
                        break;
                    }
                }
            }
            if (!found) selectedCell = { row: -1, col: -1 };
            highlightCells();
            return;
        }

        const { row, col } = selectedCell;
        const cell = boardData[row][col];
        if (cell.isPrefilled || cell.isLocked) return;
        const effectiveNoteMode = isNoteMode || isNote;
        if (effectiveNoteMode) {
            if (cell.value !== 0) return;
            if (cell.notes[num]) delete cell.notes[num];
            else cell.notes[num] = { isIncorrect: !isNoteValid(row, col, num) };
        } else {
            cell.value = num;
            cell.notes = {};
            if (num !== solution[row][col]) {
                cell.isIncorrect = true;
                errorCount++;
                updateUIText(currentLang);
                setTimeout(() => {
                    if (boardData[row][col].value === num && boardData[row][col].isIncorrect) {
                        boardData[row][col].value = 0;
                        boardData[row][col].isIncorrect = false;
                        drawBoard();
                    }
                }, 1000);
            } else {
                cell.isIncorrect = false;
                cell.isLocked = true;
                updateNotes(row, col, num);
            }
        }
        drawBoard();
        updateKeypadUI();
        checkWinCondition();
        saveGameState();
    }

    function handleErase() {
        if (!isGameActive) startGameTimer();
        if (selectedCell.row === -1) return;
        const { row, col } = selectedCell;
        const cell = boardData[row][col];
        if (cell.isPrefilled || cell.isLocked) return;
        cell.value = 0;
        cell.notes = {};
        cell.isIncorrect = false;
        drawBoard();
        updateKeypadUI();
        saveGameState();
    }

    function handleKeyboardInput(e) {
        if (highscoreAwaitingInitials || e.target.closest('input, textarea')) return;
        if (!highscoreContainer.classList.contains('hidden')) return;
        if (!isGameActive) startGameTimer();
        if (selectedCell.row === -1 && !String(e.key).includes('Arrow')) return;
        switch (e.key) {
            case 'ArrowUp':
                selectedCell.row = (selectedCell.row - 1 + size) % size;
                break;
            case 'ArrowDown':
                selectedCell.row = (selectedCell.row + 1) % size;
                break;
            case 'ArrowLeft':
                selectedCell.col = (selectedCell.col - 1 + size) % size;
                break;
            case 'ArrowRight':
                selectedCell.col = (selectedCell.col + 1) % size;
                break;
            case 'Backspace':
            case 'Delete':
                handleErase();
                break;
            default:
                if (!isNaN(parseInt(e.key, 10)) && parseInt(e.key, 10) > 0) {
                    handleKeypadInput(parseInt(e.key, 10));
                }
                return;
        }
        e.preventDefault();
        highlightCells();
    }

    function handleHintInteraction() {
        hintClickCount++;
        if (hintClickCount === 1) {
            hintClickTimer = setTimeout(() => {
                handleHintRequest();
                hintClickCount = 0;
            }, 300);
        } else if (hintClickCount === 2) {
            clearTimeout(hintClickTimer);
            showHintChoiceMenu();
            hintClickCount = 0;
        }
    }

    function handleDoubleTap(e) {
        const currentTime = Date.now();
        const tapLength = currentTime - lastTap;
        const target = e.target.closest('.cell, .keypad-btn, #gemini-hint-btn');
        if (tapLength < 300 && tapLength > 0 && target === lastTapTarget) {
            e.preventDefault();
            if (target.id === 'gemini-hint-btn') {
                showHintChoiceMenu();
            } else if (target.classList.contains('cell')) {
                handleCellRightClick(e);
            } else if (target.classList.contains('keypad-btn')) {
                handleKeypadInput(parseInt(target.dataset.num, 10), true);
            }
            lastTap = 0;
            lastTapTarget = null;
        } else {
            lastTap = currentTime;
            lastTapTarget = target;
        }
    }

    function toggleNoteMode(e) {
        if (!isGameActive) startGameTimer();
        isNoteMode = e.target.checked;
        if (isNoteMode) wasNoteUsed = true;
        saveGameState();
    }

    function toggleHelperMode(e) {
        if (!isGameActive) startGameTimer();
        isHelperMode = e.target.checked;
        geminiHintBtn.classList.toggle('hidden', !isHelperMode);
        if (isHelperMode) wasHelperUsed = true;
        timerElement.classList.toggle('text-red-600', isHelperMode);
        clearInterval(timerInterval);
        timerInterval = setInterval(updateTimer, isHelperMode ? 500 : 1000);
        highlightCells();
        saveGameState();
    }

    async function getGeminiHint(apiKey) {
        hintModal.classList.remove('hidden');
        hintTitle.textContent = t(currentLang, 'aiTutor');
        hintContent.innerHTML = '';
        hintLoader.classList.remove('hidden');
        const boardString = boardData.map((row) => row.map((cell) => cell.value || 0).join('')).join('\n');
        const systemPrompt = `You are an expert Sudoku tutor. Analyze the board and provide a hint for the next logical move using a simple technique like 'Hidden Single' or 'Naked Single'. Explain the technique and where to look (e.g., 'in the top-right box'), but do not reveal the number or exact cell. Respond in the user's language (${currentLang}).`;
        const userQuery = `Current board (0=empty):\n${boardString}`;
        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: userQuery }] }],
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                    }),
                },
            );
            if (!response.ok) throw new Error(`API error: ${response.status}`);
            const result = await response.json();
            hintContent.textContent = result.candidates[0].content.parts[0].text;
        } catch (error) {
            console.error('Gemini API error:', error);
            hintContent.textContent = t(currentLang, 'hintError');
        } finally {
            hintLoader.classList.add('hidden');
        }
    }

    function handleHintRequest() {
        wasHelperUsed = true;
        const pref = localStorage.getItem('sudokuHintPreference') || 'local';
        if (pref === 'gemini') {
            const apiKey = localStorage.getItem('geminiApiKey');
            if (apiKey) getGeminiHint(apiKey);
            else apiKeyModal.classList.remove('hidden');
        } else {
            const hint = getLocalHint();
            hintTitle.textContent = t(currentLang, 'localHintTitle');
            hintContent.textContent = hint.text;
            hintModal.classList.remove('hidden');
            if (hint.highlightCell) {
                const { r, c } = hint.highlightCell;
                boardElement.children[r * 9 + c].classList.add('hint-cell');
            }
        }
    }

    function showHintChoiceMenu() {
        hintChoiceMenu.style.display = 'block';
        hintChoiceMenu.style.top = '100%';
        hintChoiceMenu.style.left = '0%';
        const currentPref = localStorage.getItem('sudokuHintPreference') || 'local';
        hintChoiceMenu.querySelectorAll('button').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.choice === currentPref);
        });
    }

    function saveGameState() {
        if (!isGameActive) return;
        localStorage.setItem(
            'sudokuGameState',
            JSON.stringify({
                boardData,
                solution,
                secondsElapsed,
                errorCount,
                difficulty: difficultySelect.value,
                isNoteMode,
                isHelperMode,
                wasNoteUsed,
                wasHelperUsed,
                currentGrade,
            }),
        );
    }

    function loadGameState() {
        const savedState = localStorage.getItem('sudokuGameState');
        if (!savedState) return false;
        try {
            const gs = JSON.parse(savedState);
            boardData = gs.boardData;
            solution = gs.solution;
            secondsElapsed = gs.secondsElapsed;
            errorCount = gs.errorCount;
            difficultySelect.value = gs.difficulty;
            isNoteMode = gs.isNoteMode;
            notesToggleCheckbox.checked = isNoteMode;
            isHelperMode = gs.isHelperMode;
            helperToggleCheckbox.checked = isHelperMode;
            wasNoteUsed = gs.wasNoteUsed;
            wasHelperUsed = gs.wasHelperUsed;
            currentGrade = gs.currentGrade || null;
            return true;
        } catch {
            localStorage.removeItem('sudokuGameState');
            return false;
        }
    }

    function clearSavedGameState() {
        localStorage.removeItem('sudokuGameState');
    }

    function getHighScores(difficulty) {
        try {
            const parsed = JSON.parse(localStorage.getItem(`sudokuHighScores_${difficulty}`) || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveLocalHighScore(entry, difficulty) {
        const scores = getHighScores(difficulty);
        scores.push(entry);
        scores.sort((a, b) => (a.finalScore ?? a.time) - (b.finalScore ?? b.time));
        localStorage.setItem(`sudokuHighScores_${difficulty}`, JSON.stringify(scores.slice(0, 10)));
    }

    function starMarkup(starType) {
        if (starType === 'gold') return '⭐';
        if (starType === 'silver') return '☆';
        return '';
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function showHighscoreOverlay() {
        boardElement.classList.add('board-inactive');
        keypad.classList.add('board-inactive');
        highscoreContainer.classList.remove('hidden');
    }

    function showInitialsPrompt() {
        highscoreAwaitingInitials = true;
        lastHighscoreView = null;
        setHighscoreDifficultyTitle(pendingWinScore.difficulty);
        setHighscoreSourceLabel('');
        highscoreList.innerHTML = '';
        highscoreHeaders.classList.add('hidden');
        highscorePrompt.classList.remove('hidden');
        const remembered = readRememberedInitials();
        highscorePrompt.innerHTML = `
            <form class="initials-form" id="initials-form" autocomplete="off">
                <label class="initials-label" for="initials-input">${t(currentLang, 'initialsPrompt')}<br><span>${t(currentLang, 'initialsHint')}</span></label>
                <input id="initials-input" class="initials-input" name="initials" type="text" maxlength="3" spellcheck="false" autocapitalize="characters" autocomplete="off" inputmode="text">
                <p class="initials-error" id="initials-error"></p>
                <div class="initials-actions">
                    <button type="submit" class="initials-submit" id="initials-submit">${t(currentLang, 'initialsSubmit')}</button>
                    <button type="button" class="initials-skip" id="initials-skip">${t(currentLang, 'initialsSkip')}</button>
                </div>
            </form>
        `;
        showHighscoreOverlay();
        const form = document.getElementById('initials-form');
        const input = document.getElementById('initials-input');
        const errorEl = document.getElementById('initials-error');
        input.value = remembered;
        form.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('input', () => {
            input.value = normalizeInitialsInput(input.value);
            errorEl.textContent = '';
        });
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            submitWinScore(input.value);
        });
        document.getElementById('initials-skip').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            skipWinScore();
        });
        input.focus();
        input.select();
    }

    async function submitWinScore(rawInitials) {
        const initials = sanitizeInitials(rawInitials);
        const errorEl = document.getElementById('initials-error');
        const submitBtn = document.getElementById('initials-submit');
        if (!initials) {
            if (errorEl) errorEl.textContent = t(currentLang, 'initialsInvalid');
            return;
        }
        writeRememberedInitials(initials);
        const entry = buildScoreEntry({ ...pendingWinScore, initials });
        saveLocalHighScore(entry, pendingWinScore.difficulty);
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = t(currentLang, 'highscoreSaving');
        }
        try {
            const result = await submitSharedHighScore({
                difficulty: pendingWinScore.difficulty,
                initials,
                time: pendingWinScore.time,
                errors: pendingWinScore.errors,
                noteUsed: pendingWinScore.noteUsed,
                helperUsed: pendingWinScore.helperUsed,
            });
            displayHighScores(pendingWinScore.difficulty, result.entry?.id || entry.id, result.scores, 'shared');
        } catch {
            displayHighScores(pendingWinScore.difficulty, entry.id, getHighScores(pendingWinScore.difficulty), 'local');
        }
    }

    async function skipWinScore() {
        const entry = buildScoreEntry({ ...pendingWinScore, initials: '—' });
        saveLocalHighScore(entry, pendingWinScore.difficulty);
        try {
            const scores = await fetchSharedHighScores(pendingWinScore.difficulty);
            displayHighScores(pendingWinScore.difficulty, entry.id, scores, 'shared');
        } catch {
            displayHighScores(pendingWinScore.difficulty, entry.id, getHighScores(pendingWinScore.difficulty), 'local');
        }
    }

    function displayHighScores(difficulty, highlightId, scores, source) {
        highscoreAwaitingInitials = false;
        lastHighscoreView = { difficulty, highlightId, scores, source };
        highscorePrompt.classList.add('hidden');
        highscorePrompt.innerHTML = '';
        highscoreHeaders.classList.remove('hidden');
        setHighscoreDifficultyTitle(difficulty);
        setHighscoreSourceLabel(source);
        highscoreList.innerHTML = '';
        if (!scores || scores.length === 0) {
            highscoreList.innerHTML = `<li class="text-center text-yellow-300 p-4">${t(currentLang, 'noScores')}</li>`;
        } else {
            scores.forEach((score, index) => {
                const li = document.createElement('li');
                li.className = 'score-item grid grid-cols-12 gap-1 items-center p-2 text-[10px] sm:text-xs';
                if (highlightId && (score.id === highlightId || score.date === highlightId)) {
                    li.classList.add('new-highscore');
                }
                const initials = escapeHtml(score.initials || '—');
                const seconds = Number.isInteger(score.time) ? score.time : score.finalScore || 0;
                li.innerHTML = `<span class="col-span-1">${index + 1}.</span><span class="col-span-3 truncate">${initials}</span><span class="col-span-4">${formatTime(seconds)}</span><span class="col-span-2 text-center">${score.errors}</span><span class="col-span-2 text-right">${starMarkup(score.starType)}</span>`;
                highscoreList.appendChild(li);
            });
        }
        showHighscoreOverlay();
    }

    function init() {
        keypadNumbersElement.innerHTML = '';
        for (let i = 1; i <= 9; i++) {
            const button = document.createElement('button');
            button.textContent = i;
            button.dataset.num = i;
            button.type = 'button';
            button.className = 'keypad-btn bg-white text-slate-800 rounded-md p-2 font-semibold hover:bg-slate-200';
            button.addEventListener('click', () => handleKeypadInput(i));
            keypadNumbersElement.appendChild(button);
        }

        boardElement.addEventListener('click', handleCellClick);
        boardElement.addEventListener('contextmenu', handleCellRightClick);
        boardElement.addEventListener('mouseover', handleCellMouseOver);
        boardElement.addEventListener('mouseout', handleCellMouseOut);
        document.addEventListener('keydown', handleKeyboardInput);
        newGameBtn.addEventListener('click', startNewGame);
        difficultySelect.addEventListener('change', startNewGame);
        highscoreContainer.addEventListener('click', (e) => {
            if (highscoreAwaitingInitials) return;
            if (e.target.closest('#highscore-prompt')) return;
            startNewGame();
        });
        notesToggleCheckbox.addEventListener('change', toggleNoteMode);
        helperToggleCheckbox.addEventListener('change', toggleHelperMode);
        geminiHintBtn.addEventListener('click', handleHintInteraction);
        geminiHintBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showHintChoiceMenu();
        });
        closeHintModalBtn.addEventListener('click', () => hintModal.classList.add('hidden'));
        saveApiKeyBtn.addEventListener('click', () => {
            const key = apiKeyInput.value.trim();
            if (key) {
                localStorage.setItem('geminiApiKey', key);
                apiKeyModal.classList.add('hidden');
                handleHintRequest();
            }
        });
        cancelApiKeyBtn.addEventListener('click', () => apiKeyModal.classList.add('hidden'));
        langSelector.addEventListener('click', (e) => {
            e.preventDefault();
            if (e.target.tagName === 'A' && e.target.dataset.lang) setLanguage(e.target.dataset.lang);
        });
        hintChoiceMenu.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') return;
            const choice = e.target.dataset.choice;
            localStorage.setItem('sudokuHintPreference', choice);
            hintChoiceMenu.style.display = 'none';
            if (choice === 'gemini' && !localStorage.getItem('geminiApiKey')) {
                apiKeyModal.classList.remove('hidden');
            }
        });
        document.addEventListener('click', (e) => {
            if (!hintChoiceMenu.contains(e.target) && e.target !== geminiHintBtn) {
                hintChoiceMenu.style.display = 'none';
            }
        });
        boardElement.addEventListener('touchend', handleDoubleTap);
        keypadNumbersElement.addEventListener('touchend', handleDoubleTap);

        if (appVersionEl) appVersionEl.textContent = `v${VERSION}`;
        const savedLang = localStorage.getItem('sudokuLang');
        setLanguage(savedLang && translations[savedLang] ? savedLang : 'da');
        if (!loadGameState()) startNewGame();
        else setupLoadedGame();
    }

    init();
});
