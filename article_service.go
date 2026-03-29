package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Article represents a generated daily article.
type Article struct {
	ID         int64  `json:"id"`
	Title      string `json:"title"`
	Content    string `json:"content"`
	ContentZh  string `json:"contentZh"`
	Topic      string `json:"topic"`
	WordIDs    string `json:"wordIds"`    // JSON array of word IDs
	WordTexts  string `json:"wordTexts"`  // JSON array of word strings
	CreatedAt  string `json:"createdAt"`
}

// ArticleListResult holds paginated article list with metadata.
type ArticleListResult struct {
	Articles  []Article `json:"articles"`
	Total     int       `json:"total"`
	Page      int       `json:"page"`
	PageSize  int       `json:"pageSize"`
	HasMore   bool      `json:"hasMore"`
}

// ArticleService handles daily article generation and storage.
type ArticleService struct {
	db *sql.DB
}

// ArticleGenerationRecord tracks daily generation usage.
type ArticleGenerationRecord struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

func NewArticleService() *ArticleService {
	s := &ArticleService{}
	dbPath, err := s.dbPath()
	if err != nil {
		fmt.Fprintf(os.Stderr, "ensher: getting db path: %v\n", err)
		os.Exit(1)
	}
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		fmt.Fprintf(os.Stderr, "ensher: opening db: %v\n", err)
		os.Exit(1)
	}
	s.db = db
	if err := s.migrate(); err != nil {
		fmt.Fprintf(os.Stderr, "ensher: migrating article db: %v\n", err)
		os.Exit(1)
	}
	return s
}

func (s *ArticleService) dbPath() (string, error) {
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

func (s *ArticleService) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS articles (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			title TEXT DEFAULT '',
			content TEXT DEFAULT '',
			content_zh TEXT DEFAULT '',
			topic TEXT DEFAULT 'General',
			word_ids TEXT DEFAULT '[]',
			word_texts TEXT DEFAULT '[]',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return err
	}
	_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_articles_created_at ON articles(created_at)`)
	_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_articles_topic ON articles(topic)`)
	_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_articles_topic_date ON articles(topic, DATE(created_at))`)
	_, _ = s.db.Exec(`CREATE INDEX IF NOT EXISTS idx_articles_created_date ON articles(DATE(created_at))`)
	return nil
}

// ── Daily Limit Helpers ──────────────────────────────────────────────

const articleDailyLimit = 3

func articleSettingsPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".ensher", "settings.json"), nil
}

func (svc *ArticleService) getArticleGenerations() ([]ArticleGenerationRecord, error) {
	path, err := articleSettingsPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []ArticleGenerationRecord{}, nil
		}
		return nil, err
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	gen, ok := raw["articleGenerations"]
	if !ok {
		return []ArticleGenerationRecord{}, nil
	}
	var records []ArticleGenerationRecord
	for _, r := range gen.([]interface{}) {
		rec := r.(map[string]interface{})
		records = append(records, ArticleGenerationRecord{
			Date:  rec["date"].(string),
			Count: int(rec["count"].(float64)),
		})
	}
	return records, nil
}

func (s *ArticleService) saveArticleGenerations(records []ArticleGenerationRecord) error {
	path, err := articleSettingsPath()
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
	settings["articleGenerations"] = records
	settings["articleLimit"] = articleDailyLimit

	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, out, 0600)
}

func (s *ArticleService) getTodayGenerationCount() int {
	records, err := s.getArticleGenerations()
	if err != nil {
		return 0
	}
	today := time.Now().Format("2006-01-02")
	for _, r := range records {
		if r.Date == today {
			return r.Count
		}
	}
	return 0
}

// ── Public API ──────────────────────────────────────────────────────

// GetRemainingGenerations returns how many generations are left today.
func (s *ArticleService) GetRemainingGenerations() (int, error) {
	count := s.getTodayGenerationCount()
	remaining := articleDailyLimit - count
	if remaining < 0 {
		remaining = 0
	}
	return remaining, nil
}

// GenerateDailyArticle generates an article using today's new and review words.
func (s *ArticleService) GenerateDailyArticle() (*Article, error) {
	// Check daily limit
	count := s.getTodayGenerationCount()
	if count >= articleDailyLimit {
		return nil, fmt.Errorf("daily generation limit reached (%d/%d)", count, articleDailyLimit)
	}

	// Get today's new words (mastery_level=0, created today)
	rows, err := s.db.Query(`
		SELECT id, word FROM words
		WHERE mastery_level = 0 AND DATE(created_at) = DATE('now')
		LIMIT 20`)
	if err != nil {
		return nil, fmt.Errorf("failed to query new words: %w", err)
	}

	var newWords []struct {
		ID   int64
		Word string
	}
	for rows.Next() {
		var id int64
		var word string
		rows.Scan(&id, &word)
		newWords = append(newWords, struct{ ID int64; Word string }{id, word})
	}
	rows.Close()

	// Get review words (mastery_level < 5, reviewed today or never reviewed but not new)
	reviewRows, err := s.db.Query(`
		SELECT id, word FROM words
		WHERE mastery_level > 0 AND mastery_level < 5
		AND (DATE(last_reviewed_at) = DATE('now') OR last_reviewed_at = '')
		LIMIT 20`)
	if err != nil {
		return nil, fmt.Errorf("failed to query review words: %w", err)
	}
	defer reviewRows.Close()

	var reviewWords []struct {
		ID   int64
		Word string
	}
	for reviewRows.Next() {
		var id int64
		var word string
		reviewRows.Scan(&id, &word)
		reviewWords = append(reviewWords, struct{ ID int64; Word string }{id, word})
	}

	// Combine all words
	var allWords []string
	var wordIDs []int64
	seen := make(map[string]bool)
	for _, w := range newWords {
		if !seen[w.Word] {
			seen[w.Word] = true
			allWords = append(allWords, w.Word)
			wordIDs = append(wordIDs, w.ID)
		}
	}
	for _, w := range reviewWords {
		if !seen[w.Word] {
			seen[w.Word] = true
			allWords = append(allWords, w.Word)
			wordIDs = append(wordIDs, w.ID)
		}
	}

	// If no words available, return an error with a helpful message
	if len(allWords) == 0 {
		return nil, fmt.Errorf("no new or review words available today. Please add new words or complete some reviews first.")
	}

	// Build word list for prompt
	wordListStr := strings.Join(allWords, ", ")

	// Call AI to generate article
	result, err := generateArticleWithAI(wordListStr, len(allWords))
	if err != nil {
		return nil, fmt.Errorf("AI generation failed: %w", err)
	}

	// Serialize word IDs and texts
	wordIDsJSON, _ := json.Marshal(wordIDs)
	wordTextsJSON, _ := json.Marshal(allWords)

	// Insert into database
	topic := "General"
	if result.Topic != "" {
		topic = result.Topic
	}

	res, err := s.db.Exec(`
		INSERT INTO articles (title, content, content_zh, topic, word_ids, word_texts, created_at)
		VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
		result.Title, result.Content, result.ContentZh, topic,
		string(wordIDsJSON), string(wordTextsJSON))
	if err != nil {
		return nil, fmt.Errorf("failed to save article: %w", err)
	}

	id, _ := res.LastInsertId()
	article := &Article{
		ID:        id,
		Title:     result.Title,
		Content:   result.Content,
		ContentZh: result.ContentZh,
		Topic:     topic,
		WordIDs:   string(wordIDsJSON),
		WordTexts: string(wordTextsJSON),
		CreatedAt: time.Now().Format("2006-01-02 15:04:05"),
	}

	// Increment generation count
	s.incrementGenerationCount()

	return article, nil
}

func (s *ArticleService) incrementGenerationCount() {
	records, _ := s.getArticleGenerations()
	today := time.Now().Format("2006-01-02")
	found := false
	for i, r := range records {
		if r.Date == today {
			records[i].Count++
			found = true
			break
		}
	}
	if !found {
		records = append(records, ArticleGenerationRecord{Date: today, Count: 1})
	}
	// Keep only last 30 days
	if len(records) > 30 {
		records = records[len(records)-30:]
	}
	s.saveArticleGenerations(records)
}

// GetAllArticles returns all articles ordered by date descending.
func (s *ArticleService) GetAllArticles() ([]Article, error) {
	rows, err := s.db.Query(`
		SELECT id, title, content, content_zh, topic, word_ids, word_texts, created_at
		FROM articles ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return s.scanArticles(rows)
}

// GetArticlesPaginated returns paginated articles with optional filters.
// page starts from 1, pageSize defaults to 20.
func (s *ArticleService) GetArticlesPaginated(page, pageSize int, topic, date, search string) (*ArticleListResult, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	// Build WHERE clause dynamically
	whereClause := "1=1"
	args := []interface{}{}

	if topic != "" && topic != "All" {
		whereClause += " AND topic = ?"
		args = append(args, topic)
	}
	if date != "" {
		whereClause += " AND DATE(created_at) = DATE(?)"
		args = append(args, date)
	}
	if search != "" {
		whereClause += " AND (title LIKE ? OR content LIKE ? OR content_zh LIKE ?)"
		like := "%" + search + "%"
		args = append(args, like, like, like)
	}

	// Get total count
	var total int
	countQuery := "SELECT COUNT(*) FROM articles WHERE " + whereClause
	if err := s.db.QueryRow(countQuery, args...).Scan(&total); err != nil {
		return nil, fmt.Errorf("failed to count articles: %w", err)
	}

	// Get paginated articles (content excluded for list view to reduce data size)
	listQuery := fmt.Sprintf(`
		SELECT id, title, content, content_zh, topic, word_ids, word_texts, created_at
		FROM articles
		WHERE %s
		ORDER BY created_at DESC
		LIMIT ? OFFSET ?`, whereClause)
	args = append(args, pageSize, offset)

	rows, err := s.db.Query(listQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query articles: %w", err)
	}
	defer rows.Close()

	articles, err := s.scanArticles(rows)
	if err != nil {
		return nil, err
	}

	return &ArticleListResult{
		Articles: articles,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
		HasMore:  offset+len(articles) < total,
	}, nil
}

// GetArticle returns a single article by ID.
func (s *ArticleService) GetArticle(id int64) (*Article, error) {
	row := s.db.QueryRow(`
		SELECT id, title, content, content_zh, topic, word_ids, word_texts, created_at
		FROM articles WHERE id = ?`, id)
	article := &Article{}
	var contentZh, wordIDs, wordTexts sql.NullString
	err := row.Scan(&article.ID, &article.Title, &article.Content, &contentZh,
		&article.Topic, &wordIDs, &wordTexts, &article.CreatedAt)
	if err != nil {
		return nil, err
	}
	if contentZh.Valid {
		article.ContentZh = contentZh.String
	}
	if wordIDs.Valid {
		article.WordIDs = wordIDs.String
	}
	if wordTexts.Valid {
		article.WordTexts = wordTexts.String
	}
	return article, nil
}

// SearchArticles searches articles by title and content.
func (s *ArticleService) SearchArticles(query string) ([]Article, error) {
	rows, err := s.db.Query(`
		SELECT id, title, content, content_zh, topic, word_ids, word_texts, created_at
		FROM articles
		WHERE title LIKE ? OR content LIKE ? OR content_zh LIKE ?
		ORDER BY created_at DESC`,
		"%"+query+"%", "%"+query+"%", "%"+query+"%")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return s.scanArticles(rows)
}

// GetArticlesByDateRange returns articles within a date range.
func (s *ArticleService) GetArticlesByDateRange(startDate, endDate string) ([]Article, error) {
	rows, err := s.db.Query(`
		SELECT id, title, content, content_zh, topic, word_ids, word_texts, created_at
		FROM articles
		WHERE DATE(created_at) >= DATE(?) AND DATE(created_at) <= DATE(?)
		ORDER BY created_at DESC`, startDate, endDate)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return s.scanArticles(rows)
}

// GetArticlesByTopic returns articles filtered by topic.
func (s *ArticleService) GetArticlesByTopic(topic string) ([]Article, error) {
	rows, err := s.db.Query(`
		SELECT id, title, content, content_zh, topic, word_ids, word_texts, created_at
		FROM articles
		WHERE topic = ?
		ORDER BY created_at DESC`, topic)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return s.scanArticles(rows)
}

// GetArticleDates returns all dates that have articles, for timeline display.
func (s *ArticleService) GetArticleDates() ([]string, error) {
	rows, err := s.db.Query(`SELECT DISTINCT DATE(created_at) as article_date FROM articles ORDER BY article_date DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var dates []string
	for rows.Next() {
		var date string
		rows.Scan(&date)
		dates = append(dates, date)
	}
	return dates, nil
}

// DeleteArticle deletes an article by ID.
func (s *ArticleService) DeleteArticle(id int64) error {
	_, err := s.db.Exec(`DELETE FROM articles WHERE id = ?`, id)
	return err
}

func (s *ArticleService) scanArticles(rows *sql.Rows) ([]Article, error) {
	var articles []Article
	for rows.Next() {
		var a Article
		var contentZh, wordIDs, wordTexts sql.NullString
		err := rows.Scan(&a.ID, &a.Title, &a.Content, &contentZh,
			&a.Topic, &wordIDs, &wordTexts, &a.CreatedAt)
		if err != nil {
			return articles, err
		}
		if contentZh.Valid {
			a.ContentZh = contentZh.String
		}
		if wordIDs.Valid {
			a.WordIDs = wordIDs.String
		}
		if wordTexts.Valid {
			a.WordTexts = wordTexts.String
		}
		articles = append(articles, a)
	}
	return articles, nil
}

// ── AI Article Generation ────────────────────────────────────────────

type articleAIResult struct {
	Title      string `json:"title"`
	Content    string `json:"content"`
	ContentZh  string `json:"contentZh"`
	Topic      string `json:"topic"`
}

func generateArticleWithAI(wordList string, wordCount int) (*articleAIResult, error) {
	settings, err := LoadAISettings()
	if err != nil {
		return nil, fmt.Errorf("failed to load AI settings: %w", err)
	}
	if settings.APIKey == "" {
		return nil, fmt.Errorf("AI API key not configured. Please set it in Settings.")
	}
	switch settings.Provider {
	case "minimax":
		return generateArticleWithMiniMax(wordList, wordCount, settings.APIKey, settings.ModelName)
	default:
		return nil, fmt.Errorf("unsupported AI provider: %s", settings.Provider)
	}
}

func generateArticleWithMiniMax(wordList string, wordCount int, apiKey, modelName string) (*articleAIResult, error) {
	prompt := fmt.Sprintf(`You are an expert English writing assistant. Your task is to write a creative, engaging English article.

VOCABULARY WORDS TO INCORPORATE: %s

Requirements:
1. Write a 400-500 word English article that naturally incorporates the vocabulary words above.
2. The article should be interesting, well-structured (with a clear beginning, middle, and end).
3. Use the vocabulary words in context naturally — do not force them awkwardly.
4. At the end, provide a Chinese translation of the entire article.

Return ONLY valid JSON (no markdown, no code fences):
{
  "title": "A creative, catchy article title in English (max 60 characters)",
  "content": "The full English article (400-500 words)",
  "contentZh": "The complete Chinese translation of the article",
  "topic": "A single topic label from this list: General, Technology, Science, Daily Life, Travel, Food, Business, Nature, Health, Education, Entertainment, Culture, Sports, History"
}
`, wordList)

	body, _ := json.Marshal(map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "You are an expert English writing assistant. Always respond with valid JSON only."},
			{"role": "user", "content": prompt},
		},
	})

	req, err := http.NewRequest("POST", "https://api.minimaxi.com/v1/text/chatcompletion_v2", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("network error: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		BaseResp struct {
			StatusCode int    `json:"status_code"`
			StatusMsg  string `json:"status_msg"`
		} `json:"base_resp"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	if result.BaseResp.StatusCode != 0 {
		return nil, fmt.Errorf("MiniMax API error (%d): %s", result.BaseResp.StatusCode, result.BaseResp.StatusMsg)
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	content := strings.TrimSpace(result.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	var r articleAIResult
	if err := json.Unmarshal([]byte(content), &r); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &r, nil
}
