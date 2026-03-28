package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v3/pkg/application"
	_ "github.com/mattn/go-sqlite3"
)

type Word struct {
	ID             int64   `json:"id"`
	Word           string  `json:"word"`
	Phonetic       string  `json:"phonetic"`
	Definition     string  `json:"definition"`
	DefinitionZh   string  `json:"definitionZh"`
	Example        string  `json:"example"`
	Notes          string  `json:"notes"`
	Tags           string  `json:"tags"`
	MasteryLevel   int     `json:"masteryLevel"`
	ReviewCount    int     `json:"reviewCount"`
	CreatedAt      string  `json:"createdAt"`
	LastReviewedAt string  `json:"lastReviewedAt"`
}

type ReviewSettings struct {
	DailyLimit int `json:"dailyLimit"`
}

type WordService struct {
	db *sql.DB
}

func NewWordService() *WordService {
	w := &WordService{}
	dbPath, err := w.dbPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "ensher: getting db path: %v\n", err)
		os.Exit(1)
	}
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		fmt.Fprintf(os.Stderr, "ensher: opening db: %v\n", err)
		os.Exit(1)
	}
	w.db = db
	if err := w.migrate(); err != nil {
		fmt.Fprintf(os.Stderr, "ensher: migrating db: %v\n", err)
		os.Exit(1)
	}
	return w
}

func (w *WordService) dbPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".ensher")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return filepath.Join(dir, "ensher.db"), nil
}

func (w *WordService) migrate() error {
	_, err := w.db.Exec(`
		CREATE TABLE IF NOT EXISTS words (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			word TEXT NOT NULL UNIQUE,
			phonetic TEXT DEFAULT '',
			definition TEXT DEFAULT '',
			definition_zh TEXT DEFAULT '',
			example TEXT DEFAULT '',
			notes TEXT DEFAULT '',
			tags TEXT DEFAULT '',
			mastery_level INTEGER DEFAULT 0,
			review_count INTEGER DEFAULT 0,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			last_reviewed_at DATETIME DEFAULT ''
		)
	`)
	if err != nil {
		return err
	}
	// Add definition_zh column for existing DBs
	_, _ = w.db.Exec(`ALTER TABLE words ADD COLUMN definition_zh TEXT DEFAULT ''`)
	// Performance indexes for 100k+ word scale
	_, _ = w.db.Exec(`CREATE INDEX IF NOT EXISTS idx_words_created_at ON words(created_at)`)
	_, _ = w.db.Exec(`CREATE INDEX IF NOT EXISTS idx_words_mastery_level ON words(mastery_level)`)
	_, _ = w.db.Exec(`CREATE INDEX IF NOT EXISTS idx_words_last_reviewed_at ON words(last_reviewed_at)`)
	_, _ = w.db.Exec(`CREATE INDEX IF NOT EXISTS idx_words_word ON words(word COLLATE NOCASE)`)
	return nil
}

// ExportWords opens a save dialog and exports all words as JSON.
// Returns the saved file path or an error.
func (w *WordService) ExportWords() (string, error) {
	words, err := w.GetAllWords()
	if err != nil {
		return "", fmt.Errorf("failed to get words: %w", err)
	}
	if len(words) == 0 {
		return "", errors.New("no words to export")
	}

	path, err := app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:     "Export Words",
		Filename:  "ensher-words.json",
		Filters: []application.FileFilter{{DisplayName: "JSON", Pattern: "*.json"}},
	}).PromptForSingleSelection()
	if err != nil || path == "" {
		return "", nil // user cancelled
	}

	type exportWord struct {
		Word         string `json:"word"`
		Phonetic     string `json:"phonetic"`
		Definition   string `json:"definition"`
		DefinitionZh string `json:"definitionZh"`
		Example      string `json:"example"`
		Notes        string `json:"notes"`
		Tags         string `json:"tags"`
	}
	export := make([]exportWord, len(words))
	for i, word := range words {
		export[i] = exportWord{
			Word:         word.Word,
			Phonetic:     word.Phonetic,
			Definition:   word.Definition,
			DefinitionZh: word.DefinitionZh,
			Example:      word.Example,
			Notes:        word.Notes,
			Tags:         word.Tags,
		}
	}

	data, err := json.MarshalIndent(export, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return "", fmt.Errorf("failed to write file: %w", err)
	}
	return path, nil
}

// ImportWords opens a file dialog and imports words from JSON.
// Returns the number of words imported or an error.
func (w *WordService) ImportWords() (int, error) {
	path, err := app.Dialog.OpenFile().
		SetTitle("Import Words").
		AddFilter("JSON", "*.json").
		PromptForSingleSelection()
	if err != nil || path == "" {
		return 0, nil // user cancelled
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return 0, fmt.Errorf("failed to read file: %w", err)
	}

	type importWord struct {
		Word         string `json:"word"`
		Phonetic     string `json:"phonetic"`
		Definition   string `json:"definition"`
		DefinitionZh string `json:"definitionZh"`
		Example      string `json:"example"`
		Notes        string `json:"notes"`
		Tags         string `json:"tags"`
	}
	var words []importWord
	if err := json.Unmarshal(data, &words); err != nil {
		return 0, fmt.Errorf("failed to parse JSON: %w", err)
	}

	imported := 0
	for _, word := range words {
		if word.Word == "" {
			continue
		}
		_, err := w.AddWord(word.Word, word.Phonetic, word.Definition,
			word.DefinitionZh, word.Example, word.Notes, word.Tags)
		if err != nil {
			continue
		}
		imported++
	}
	return imported, nil
}

func reviewSettingsPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".ensher", "settings.json"), nil
}

func (w *WordService) GetReviewSettings() (*ReviewSettings, error) {
	path, err := reviewSettingsPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &ReviewSettings{DailyLimit: 20}, nil
		}
		return nil, err
	}
	var s struct {
		DailyLimit int `json:"dailyLimit"`
	}
	if err := json.Unmarshal(data, &s); err != nil {
		return &ReviewSettings{DailyLimit: 20}, nil
	}
	limit := s.DailyLimit
	if limit <= 0 {
		limit = 20
	}
	return &ReviewSettings{DailyLimit: limit}, nil
}

func (w *WordService) SaveReviewSettings(dailyLimit int) error {
	if dailyLimit <= 0 {
		dailyLimit = 20
	}
	path, err := reviewSettingsPath()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	var settings map[string]interface{}
	if err == nil {
		json.Unmarshal(data, &settings)
	} else {
		settings = make(map[string]interface{})
	}
	settings["dailyLimit"] = dailyLimit
	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, out, 0600)
}

func (w *WordService) AddWord(word, phonetic, definition, definitionZh, example, notes, tags string) (*Word, error) {
	_, err := w.db.Exec(
		`INSERT INTO words (word, phonetic, definition, definition_zh, example, notes, tags)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(word) DO UPDATE SET
			phonetic=excluded.phonetic, definition=excluded.definition,
			definition_zh=excluded.definition_zh,
			example=excluded.example, notes=excluded.notes, tags=excluded.tags`,
		word, phonetic, definition, definitionZh, example, notes, tags,
	)
	if err != nil {
		return nil, err
	}
	return w.GetWordByName(word)
}

func (w *WordService) GetWordByName(name string) (*Word, error) {
	row := w.db.QueryRow(`SELECT id, word, phonetic, definition, definition_zh, example, notes, tags,
		mastery_level, review_count, created_at, last_reviewed_at FROM words WHERE word = ?`, name)
	return w.scanWord(row)
}

func (w *WordService) GetWord(id int64) (*Word, error) {
	row := w.db.QueryRow(`SELECT id, word, phonetic, definition, definition_zh, example, notes, tags,
		mastery_level, review_count, created_at, last_reviewed_at FROM words WHERE id = ?`, id)
	return w.scanWord(row)
}

func (w *WordService) GetAllWords() ([]Word, error) {
	rows, err := w.db.Query(`SELECT id, word, phonetic, definition, definition_zh, example, notes, tags,
		mastery_level, review_count, created_at, last_reviewed_at FROM words ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return w.scanWords(rows)
}

func (w *WordService) SearchWords(query string) ([]Word, error) {
	rows, err := w.db.Query(`SELECT id, word, phonetic, definition, definition_zh, example, notes, tags,
		mastery_level, review_count, created_at, last_reviewed_at FROM words
		WHERE word LIKE ? OR definition LIKE ? OR tags LIKE ?
		ORDER BY created_at DESC`,
		"%"+query+"%", "%"+query+"%", "%"+query+"%",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return w.scanWords(rows)
}

func (w *WordService) GetWordsAlphabetical() ([]Word, error) {
	rows, err := w.db.Query(`SELECT id, word, phonetic, definition, definition_zh, example, notes, tags,
		mastery_level, review_count, created_at, last_reviewed_at FROM words ORDER BY word COLLATE NOCASE ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return w.scanWords(rows)
}

func (w *WordService) GetWordsByDate() ([]Word, error) {
	rows, err := w.db.Query(`SELECT id, word, phonetic, definition, definition_zh, example, notes, tags,
		mastery_level, review_count, created_at, last_reviewed_at FROM words ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return w.scanWords(rows)
}

// GetWordsByEbbinghaus sorts by urgency using a spaced-repetition score.
// Words with low mastery + long time since last review appear first.
func (w *WordService) GetWordsByEbbinghaus() ([]Word, error) {
	rows, err := w.db.Query(`SELECT id, word, phonetic, definition, definition_zh, example, notes, tags,
		mastery_level, review_count, created_at, last_reviewed_at FROM words
		ORDER BY
			((5 - mastery_level) * 10 + CAST(julianday('now') - julianday(COALESCE(NULLIF(last_reviewed_at, ''), 'now')) AS INTEGER)) DESC,
			mastery_level ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return w.scanWords(rows)
}

func (w *WordService) DeleteWord(id int64) error {
	_, err := w.db.Exec(`DELETE FROM words WHERE id = ?`, id)
	return err
}

func (w *WordService) UpdateWord(id int64, phonetic, definition, definitionZh, example, notes, tags string) error {
	_, err := w.db.Exec(`UPDATE words SET phonetic=?, definition=?, definition_zh=?, example=?, notes=?, tags=? WHERE id=?`,
		phonetic, definition, definitionZh, example, notes, tags, id)
	return err
}

func (w *WordService) GetWordsForReview() ([]Word, error) {
	settings, err := w.GetReviewSettings()
	if err != nil {
		settings = &ReviewSettings{DailyLimit: 20}
	}
	rows, err := w.db.Query(`SELECT id, word, phonetic, definition, definition_zh, example, notes, tags,
		mastery_level, review_count, created_at, last_reviewed_at FROM words
		WHERE mastery_level < 5
		ORDER BY last_reviewed_at ASC, RANDOM()
		LIMIT ?`, settings.DailyLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return w.scanWords(rows)
}

type QuizResult struct {
	WordID       int64  `json:"wordId"`
	Correct      bool   `json:"correct"`
	UserAnswer   string `json:"userAnswer"`
	MasteryLevel int    `json:"masteryLevel"`
}

func (w *WordService) SubmitQuizAnswer(wordID int64, correct bool) (*QuizResult, error) {
	word, err := w.GetWord(wordID)
	if err != nil {
		return nil, err
	}

	newMastery := word.MasteryLevel
	if correct {
		newMastery = min(word.MasteryLevel+1, 5)
	} else {
		newMastery = max(word.MasteryLevel-1, 0)
	}

	_, err = w.db.Exec(`UPDATE words SET mastery_level=?, review_count=review_count+1,
		last_reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,
		newMastery, wordID)
	if err != nil {
		return nil, err
	}

	return &QuizResult{
		WordID:       wordID,
		Correct:      correct,
		MasteryLevel: newMastery,
	}, nil
}

func (w *WordService) GetStats() (map[string]interface{}, error) {
	var total, mastered, learning, newWords, reviewed int
	w.db.QueryRow(`SELECT COUNT(*) FROM words`).Scan(&total)
	w.db.QueryRow(`SELECT COUNT(*) FROM words WHERE mastery_level >= 4`).Scan(&mastered)
	w.db.QueryRow(`SELECT COUNT(*) FROM words WHERE mastery_level > 0 AND mastery_level < 4`).Scan(&learning)
	w.db.QueryRow(`SELECT COUNT(*) FROM words WHERE mastery_level = 0`).Scan(&newWords)
	w.db.QueryRow(`SELECT COUNT(*) FROM words WHERE review_count > 0`).Scan(&reviewed)

	var todayCount int
	w.db.QueryRow(`SELECT COUNT(*) FROM words WHERE DATE(created_at) = DATE('now')`).Scan(&todayCount)

	var aiCount int
	w.db.QueryRow(`SELECT COUNT(*) FROM words WHERE phonetic IS NOT NULL AND phonetic != ''`).Scan(&aiCount)

	return map[string]interface{}{
		"total":    total,
		"mastered": mastered,
		"learning": learning,
		"newWords": newWords,
		"today":    todayCount,
		"reviewed": reviewed,
		"aiCount":  aiCount,
	}, nil
}

func (w *WordService) scanWord(row *sql.Row) (*Word, error) {
	word := &Word{}
	var createdAt, lastReviewed sql.NullString
	err := row.Scan(&word.ID, &word.Word, &word.Phonetic, &word.Definition, &word.DefinitionZh,
		&word.Example, &word.Notes, &word.Tags,
		&word.MasteryLevel, &word.ReviewCount, &createdAt, &lastReviewed)
	if err != nil {
		return nil, err
	}
	if createdAt.Valid {
		word.CreatedAt = createdAt.String
	}
	if lastReviewed.Valid && lastReviewed.String != "" {
		word.LastReviewedAt = lastReviewed.String
	}
	return word, nil
}

func (w *WordService) scanWords(rows *sql.Rows) ([]Word, error) {
	var words []Word
	for rows.Next() {
		var word Word
		var createdAt, lastReviewed sql.NullString
		err := rows.Scan(&word.ID, &word.Word, &word.Phonetic, &word.Definition, &word.DefinitionZh,
			&word.Example, &word.Notes, &word.Tags,
			&word.MasteryLevel, &word.ReviewCount, &createdAt, &lastReviewed)
		if err != nil {
			return words, err
		}
		if createdAt.Valid {
			word.CreatedAt = createdAt.String
		}
		if lastReviewed.Valid && lastReviewed.String != "" {
			word.LastReviewedAt = lastReviewed.String
		}
		words = append(words, word)
	}
	return words, nil
}
