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

// fixJSONContent escapes literal newlines and tabs inside JSON string values so the JSON is valid.
// GLM and some other models return content with actual newline/tab chars inside JSON string fields.
func fixJSONContent(content string) string {
	// Fast path: try parsing directly
	var dummy map[string]interface{}
	if json.Unmarshal([]byte(content), &dummy) == nil {
		return content
	}
	// State machine: find real newlines/tabs inside JSON string values and escape them
	var result []byte
	inString := false
	i := 0
	for i < len(content) {
		c := content[i]
		if !inString {
			result = append(result, c)
			if c == '"' {
				inString = true
			}
			i++
			continue
		}
		// Inside a JSON string
		if c == '\\' && i+1 < len(content) {
			// Escaped char: copy both chars as-is
			result = append(result, c, content[i+1])
			i += 2
			continue
		}
		if c == '"' {
			// End of string
			result = append(result, c)
			inString = false
			i++
			continue
		}
		// Real newline inside string value → escape it
		if c == '\n' {
			result = append(result, '\\', 'n')
			i++
			continue
		}
		// Real tab inside string value → escape it
		if c == '\t' {
			result = append(result, '\\', 't')
			i++
			continue
		}
		// Any other char
		result = append(result, c)
		i++
	}
	return string(result)
}
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

// ── Public API ──────────────────────────────────────────────────────

// GenerateDailyArticle generates an article using randomly selected eligible words (max 40).
func (s *ArticleService) GenerateDailyArticle() (*Article, error) {
	return s.GenerateDailyArticleWithOptions(40, "")
}

// GenerateDailyArticleWithOptions generates an article with specified word count and topic.
// wordCount: max words to include (10-100, 0 means default 40)
// topic: article topic (empty = auto from AI, e.g. "Technology", "Science")
func (s *ArticleService) GenerateDailyArticleWithOptions(wordCount int, topic string) (*Article, error) {
	if wordCount <= 0 {
		wordCount = 40
	}
	if wordCount > 100 {
		wordCount = 100
	}

	// Query eligible words: today's new words + words due for spaced-repetition review.
	rows, err := s.db.Query(fmt.Sprintf(`
		SELECT id, word FROM words
		WHERE
			(mastery_level = 0 AND DATE(created_at) = DATE('now'))
			OR
			(mastery_level > 0 AND mastery_level < 5 AND last_reviewed_at IS NOT NULL AND last_reviewed_at != '')
		ORDER BY RANDOM()
		LIMIT %d`, wordCount))
	if err != nil {
		return nil, fmt.Errorf("failed to query eligible words: %w", err)
	}
	defer rows.Close()

	var allWords []string
	var wordIDs []int64
	seen := make(map[string]bool)
	for rows.Next() {
		var id int64
		var word string
		if err := rows.Scan(&id, &word); err != nil {
			return nil, fmt.Errorf("failed to scan word: %w", err)
		}
		if !seen[word] {
			seen[word] = true
			allWords = append(allWords, word)
			wordIDs = append(wordIDs, id)
		}
	}

	// If no words available, return an error with a helpful message
	if len(allWords) == 0 {
		return nil, fmt.Errorf("no eligible words found. Please add new words or complete some reviews first.")
	}

	// Build word list for prompt
	wordListStr := strings.Join(allWords, ", ")

	// Call AI to generate article
	result, err := generateArticleWithAI(wordListStr, len(allWords), topic)
	if err != nil {
		return nil, fmt.Errorf("AI generation failed: %w", err)
	}

	// Serialize word IDs and texts
	wordIDsJSON, _ := json.Marshal(wordIDs)
	wordTextsJSON, _ := json.Marshal(allWords)

	// Determine final topic: user-provided > AI-suggested > "General"
	articleTopic := "General"
	if topic != "" {
		articleTopic = topic
	} else if result.Topic != "" {
		articleTopic = result.Topic
	}

	res, err := s.db.Exec(`
		INSERT INTO articles (title, content, content_zh, topic, word_ids, word_texts, created_at)
		VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`,
		result.Title, result.Content, result.ContentZh, articleTopic,
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
		Topic:     articleTopic,
		WordIDs:   string(wordIDsJSON),
		WordTexts: string(wordTextsJSON),
		CreatedAt: time.Now().Format("2006-01-02 15:04:05"),
	}

	return article, nil
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

func generateArticleWithAI(wordList string, wordCount int, topic string) (*articleAIResult, error) {
	settings, err := LoadAISettings()
	if err != nil {
		return nil, fmt.Errorf("failed to load AI settings: %w", err)
	}
	cfg, ok := settings.Providers[settings.Provider]
	if !ok || cfg.APIKey == "" {
		return nil, fmt.Errorf("AI API key not configured for %s. Please set it in Settings.", settings.Provider)
	}
	switch settings.Provider {
	case "minimax":
		return generateArticleWithMiniMax(wordList, wordCount, topic, cfg.APIKey, cfg.ModelName)
	case "atomgit":
		return generateArticleWithAtomGit(wordList, wordCount, topic, cfg.APIKey, cfg.ModelName)
	case "zhipu":
		return generateArticleWithZhipu(wordList, wordCount, topic, cfg.APIKey, cfg.ModelName)
	default:
		return nil, fmt.Errorf("unsupported AI provider: %s", settings.Provider)
	}
}

func generateArticleWithMiniMax(wordList string, wordCount int, topic string, apiKey, modelName string) (*articleAIResult, error) {
	topicInstruction := ""
	if topic != "" {
		topicInstruction = fmt.Sprintf("\n5. The article must be about: %s\n", topic)
	}
	prompt := fmt.Sprintf(`You are an expert English writing assistant. Your task is to write a creative, engaging English article.

VOCABULARY WORDS TO INCORPORATE: %s

Requirements:
1. Write a 400-500 word English article that naturally incorporates the vocabulary words above.
2. The article should be interesting, well-structured (with a clear beginning, middle, and end).
3. Use the vocabulary words in context naturally — do not force them awkwardly.
4. At the end, provide a Chinese translation of the entire article.%s
Return ONLY valid JSON (no markdown, no code fences):
{
  "title": "A creative, catchy article title in English (max 60 characters)",
  "content": "The full English article (400-500 words)",
  "contentZh": "The complete Chinese translation of the article",
  "topic": "A single topic label from this list: General, Technology, Science, Daily Life, Travel, Food, Business, Nature, Health, Education, Entertainment, Culture, Sports, History"
}
`, wordList, topicInstruction)

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
	content = fixJSONContent(content)

	var r articleAIResult
	if err := json.Unmarshal([]byte(content), &r); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &r, nil
}

func generateArticleWithAtomGit(wordList string, wordCount int, topic string, apiKey, modelName string) (*articleAIResult, error) {
	topicInstruction := ""
	if topic != "" {
		topicInstruction = fmt.Sprintf("\n5. The article must be about: %s\n", topic)
	}
	prompt := fmt.Sprintf(`You are an expert English writing assistant. Your task is to write a creative, engaging English article.

VOCABULARY WORDS TO INCORPORATE: %s

Requirements:
1. Write a 400-500 word English article that naturally incorporates the vocabulary words above.
2. The article should be interesting, well-structured (with a clear beginning, middle, and end).
3. Use the vocabulary words in context naturally — do not force them awkwardly.
4. At the end, provide a Chinese translation of the entire article.%s
Return ONLY valid JSON (no markdown, no code fences):
{
  "title": "A creative, catchy article title in English (max 60 characters)",
  "content": "The full English article (400-500 words)",
  "contentZh": "The complete Chinese translation of the article",
  "topic": "A single topic label from this list: General, Technology, Science, Daily Life, Travel, Food, Business, Nature, Health, Education, Entertainment, Culture, Sports, History"
}
`, wordList, topicInstruction)

	body, _ := json.Marshal(map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "You are an expert English writing assistant. Always respond with valid JSON only."},
			{"role": "user", "content": prompt},
		},
		"max_tokens": 2048,
		"temperature": 0.7,
	})

	req, err := http.NewRequest("POST", "https://api-ai.gitcode.com/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
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
		Error struct {
			Message string `json:"message"`
			Type    string `json:"type"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	if result.Error.Message != "" {
		return nil, fmt.Errorf("AtomGit API error: %s", result.Error.Message)
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	content := strings.TrimSpace(result.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)
	content = fixJSONContent(content)

	var r articleAIResult
	if err := json.Unmarshal([]byte(content), &r); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &r, nil
}

func generateArticleWithZhipu(wordList string, wordCount int, topic string, apiKey, modelName string) (*articleAIResult, error) {
	topicInstruction := ""
	if topic != "" {
		topicInstruction = fmt.Sprintf("\n5. The article must be about: %s\n", topic)
	}
	prompt := fmt.Sprintf(`You are an expert English writing assistant. Your task is to write a creative, engaging English article.

VOCABULARY WORDS TO INCORPORATE: %s

Requirements:
1. Write a 400-500 word English article that naturally incorporates the vocabulary words above.
2. The article should be interesting, well-structured (with a clear beginning, middle, and end).
3. Use the vocabulary words in context naturally — do not force them awkwardly.
4. At the end, provide a Chinese translation of the entire article.%s
Return ONLY valid JSON (no markdown, no code fences):
{
  "title": "A creative, catchy article title in English (max 60 characters)",
  "content": "The full English article (400-500 words)",
  "contentZh": "The complete Chinese translation of the article",
  "topic": "A single topic label from this list: General, Technology, Science, Daily Life, Travel, Food, Business, Nature, Health, Education, Entertainment, Culture, Sports, History"
}
`, wordList, topicInstruction)

	body, _ := json.Marshal(map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "You are an expert English writing assistant. Always respond with valid JSON only."},
			{"role": "user", "content": prompt},
		},
		"max_tokens": 2048,
		"temperature": 0.7,
	})

	req, err := http.NewRequest("POST", "https://open.bigmodel.cn/api/paas/v4/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
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
		Error struct {
			Message string `json:"message"`
			Type    string `json:"type"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %w", err)
	}
	if result.Error.Message != "" {
		return nil, fmt.Errorf("智谱 GLM API error: %s", result.Error.Message)
	}
	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("no response from AI")
	}

	content := strings.TrimSpace(result.Choices[0].Message.Content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)
	content = fixJSONContent(content)

	var r articleAIResult
	if err := json.Unmarshal([]byte(content), &r); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &r, nil
}
