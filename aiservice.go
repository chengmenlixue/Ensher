package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type AIProviderConfig struct {
	APIKey    string `json:"apiKey"`
	ModelName string `json:"modelName"`
}

type AISettings struct {
	Provider  string                      `json:"provider"` // "minimax" | "atomgit" | ...
	Providers map[string]AIProviderConfig `json:"providers"` // per-provider config
	AiEnabled bool                        `json:"aiEnabled"` // master toggle
}

// AILookupResult holds enriched word data returned by the AI.
type AILookupResult struct {
	Word         string `json:"word"`
	Phonetic     string `json:"phonetic"`
	Definition   string `json:"definition"`
	DefinitionZh string `json:"definitionZh"`
	Example      string `json:"example"`
	Notes        string `json:"notes"`
	Tags         string `json:"tags"`
}

// AIDefineResult holds the AI's answer during review with user Chinese input.
type AIDefineResult struct {
	Correct    bool   `json:"correct"`    // AI's judgment
	Judgment   string `json:"judgment"`    // AI's reasoning in Chinese
	Advice     string `json:"advice"`      // Learning advice in Chinese
}

// isChineseText returns true if the string contains Chinese characters.
func isChineseText(s string) bool {
	for _, r := range s {
		if (r >= 0x4e00 && r <= 0x9fff) || (r >= 0x3400 && r <= 0x4dbf) || (r >= 0xf900 && r <= 0xfaff) {
			return true
		}
	}
	return false
}

// buildLookupPrompt returns the appropriate AI prompt based on input language.
func buildLookupPrompt(input string) string {
	if isChineseText(input) {
		return fmt.Sprintf(`你是一位专业的英语词汇专家。用户输入了中文词语或描述："%s"

请找到最匹配的英文单词，返回纯JSON（不要任何markdown格式或额外说明），格式如下：
{
  "word": "最匹配的英文单词",
  "phonetic": "IPA音标，如 /ɪmˈpekəbl/，如果没有则为空字符串",
  "definition": "简洁准确的英文释义",
  "definitionZh": "中文释义，请翻译准确、通俗易懂",
  "example": "一个使用该单词的英文例句",
  "notes": "词源、用法技巧或有趣的知识（中文或英文均可）",
  "tags": "词性、CEFR等级等标签，用逗号分隔，如：adj,C1,academic"
}`, input)
	}
	return fmt.Sprintf(`你是一位专业的英语词汇专家。请为单词 "%s" 返回纯JSON（不要任何markdown格式或额外说明），格式如下：
{
  "phonetic": "IPA音标，如 /ɪmˈpekəbl/，如果没有则为空字符串",
  "definition": "简洁准确的英文释义",
  "definitionZh": "中文释义，请翻译准确、通俗易懂",
  "example": "一个使用该单词的英文例句",
  "notes": "词源、用法技巧或有趣的知识（中文或英文均可）",
  "tags": "词性、CEFR等级等标签，用逗号分隔，如：adj,C1,academic"
}`, input)
}

// AIService is the Wails service exposing AI-related methods.
type AIService struct{}

func (a *AIService) GetAISettings() (*AISettings, error) {
	return LoadAISettings()
}

func (a *AIService) SaveAISettings(provider string, providers map[string]AIProviderConfig, aiEnabled bool) error {
	settings := &AISettings{
		Provider:  provider,
		Providers: providers,
		AiEnabled: aiEnabled,
	}
	return settings.Save()
}

func (a *AIService) LookupWordWithAI(word string) (*AILookupResult, error) {
	return LookupWordWithAI(word)
}

func (a *AIService) JudgeAnswerWithAI(wordID int64, userAnswer, wordStr string) (*AIDefineResult, error) {
	return JudgeAnswerWithAI(wordID, userAnswer, wordStr)
}

func configDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(home, ".ensher")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}
	return dir, nil
}

func settingsPath() (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "settings.json"), nil
}

func (s *AISettings) Save() error {
	path, err := settingsPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func LoadAISettings() (*AISettings, error) {
	path, err := settingsPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &AISettings{
				Provider: "minimax",
				Providers: map[string]AIProviderConfig{
					"minimax":  {ModelName: "M2-her"},
					"atomgit":  {ModelName: "Qwen/Qwen3.5-397B-A17B"},
					"openai":   {ModelName: "gpt-4o-mini"},
				},
				AiEnabled: true,
			}, nil
		}
		return nil, err
	}
	// Unmarshal into map to detect whether aiEnabled was explicitly set
	var raw map[string]interface{}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	var s AISettings
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	if s.Provider == "" {
		s.Provider = "minimax"
	}
	if s.Providers == nil {
		s.Providers = map[string]AIProviderConfig{}
	}
	// Migrate old flat apiKey/modelName into Providers map
	if oldKey, ok := raw["apiKey"].(string); ok && oldKey != "" {
		cfg := s.Providers[s.Provider]
		if cfg.APIKey == "" {
			cfg.APIKey = oldKey
			s.Providers[s.Provider] = cfg
		}
	}
	if oldModel, ok := raw["modelName"].(string); ok && oldModel != "" {
		cfg := s.Providers[s.Provider]
		if cfg.ModelName == "" {
			cfg.ModelName = oldModel
			s.Providers[s.Provider] = cfg
		}
	}
	// aiEnabled defaults to true if not present in settings.json (backward compat)
	if _, ok := raw["aiEnabled"]; !ok {
		s.AiEnabled = true
	}
	return &s, nil
}

// LookupWordWithAI (bilingual — Chinese + English)

func lookupWithMiniMax(word, apiKey, modelName string) (*AILookupResult, error) {
	prompt := buildLookupPrompt(word)

	body, _ := json.Marshal(map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "You are an expert English vocabulary assistant. Always respond with valid JSON only."},
			{"role": "user", "content": prompt},
		},
	})

	req, err := http.NewRequest("POST", "https://api.minimaxi.com/v1/text/chatcompletion_v2", bytes.NewReader(body))
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
		BaseResp struct {
			StatusCode int `json:"status_code"`
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
	// Strip markdown code fences if present
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)
	content = fixJSONContent(content)

	var lookup AILookupResult
	if err := json.Unmarshal([]byte(content), &lookup); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &lookup, nil
}

// LookupWordWithAI calls the configured AI provider to enrich a word (bilingual).
func LookupWordWithAI(word string) (*AILookupResult, error) {
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
		return lookupWithMiniMax(word, cfg.APIKey, cfg.ModelName)
	case "atomgit":
		return lookupWithAtomGit(word, cfg.APIKey, cfg.ModelName)
	case "zhipu":
		return lookupWithZhipu(word, cfg.APIKey, cfg.ModelName)
	default:
		return nil, fmt.Errorf("unsupported AI provider: %s", settings.Provider)
	}
}

// JudgeAnswerWithAI judges the user's Chinese answer against the word's meaning.
func JudgeAnswerWithAI(wordID int64, userAnswer, wordStr string) (*AIDefineResult, error) {
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
		return judgeWithMiniMax(wordID, userAnswer, wordStr, cfg.APIKey, cfg.ModelName)
	case "atomgit":
		return judgeWithAtomGit(wordID, userAnswer, wordStr, cfg.APIKey, cfg.ModelName)
	case "zhipu":
		return judgeWithZhipu(wordID, userAnswer, wordStr, cfg.APIKey, cfg.ModelName)
	default:
		return nil, fmt.Errorf("unsupported AI provider: %s", settings.Provider)
	}
}

func judgeWithMiniMax(wordID int64, userAnswer, wordStr, apiKey, modelName string) (*AIDefineResult, error) {
	prompt := fmt.Sprintf(`你是一位专业的英语词汇教师。单词是 "%s"。

用户用中文给出了自己的理解：%s

请仔细判断用户的理解是否正确、完整，并给出学习建议。返回纯JSON（不要任何markdown格式）：
{
  "correct": true 或 false，表示用户理解是否基本正确,
  "judgment": "用中文简明扼要地评价用户的回答，指出对在哪里、错在哪里，30字以内",
  "advice": "用中文给出简短具体的学习建议，如：这个单词的核心含义是...，建议...，60字以内"
}`, wordStr, userAnswer)

	body, _ := json.Marshal(map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一位专业的英语词汇教师，评分严格，语言简洁犀利。始终返回纯JSON。"},
			{"role": "user", "content": prompt},
		},
	})

	req, err := http.NewRequest("POST", "https://api.minimaxi.com/v1/text/chatcompletion_v2", bytes.NewReader(body))
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

	var r AIDefineResult
	if err := json.Unmarshal([]byte(content), &r); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &r, nil
}

func lookupWithAtomGit(word, apiKey, modelName string) (*AILookupResult, error) {
	prompt := buildLookupPrompt(word)

	body, _ := json.Marshal(map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "You are an expert English vocabulary assistant. Always respond with valid JSON only."},
			{"role": "user", "content": prompt},
		},
		"max_tokens":    1024,
		"temperature":    0.7,
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

	var lookup AILookupResult
	if err := json.Unmarshal([]byte(content), &lookup); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &lookup, nil
}

func judgeWithAtomGit(wordID int64, userAnswer, wordStr, apiKey, modelName string) (*AIDefineResult, error) {
	prompt := fmt.Sprintf(`你是一位专业的英语词汇教师。单词是 "%s"。

用户用中文给出了自己的理解：%s

请仔细判断用户的理解是否正确、完整，并给出学习建议。返回纯JSON（不要任何markdown格式）：
{
  "correct": true 或 false，表示用户理解是否基本正确,
  "judgment": "用中文简明扼要地评价用户的回答，指出对在哪里、错在哪里，30字以内",
  "advice": "用中文给出简短具体的学习建议，如：这个单词的核心含义是...，建议...，60字以内"
}`, wordStr, userAnswer)

	body, _ := json.Marshal(map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一位专业的英语词汇教师，评分严格，语言简洁犀利。始终返回纯JSON。"},
			{"role": "user", "content": prompt},
		},
		"max_tokens": 1024,
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

	var r AIDefineResult
	if err := json.Unmarshal([]byte(content), &r); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &r, nil
}

func lookupWithZhipu(word, apiKey, modelName string) (*AILookupResult, error) {
	prompt := buildLookupPrompt(word)

	body, _ := json.Marshal(map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "You are an expert English vocabulary assistant. Always respond with valid JSON only."},
			{"role": "user", "content": prompt},
		},
		"max_tokens": 1024,
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

	var lookup AILookupResult
	if err := json.Unmarshal([]byte(content), &lookup); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &lookup, nil
}

func judgeWithZhipu(wordID int64, userAnswer, wordStr, apiKey, modelName string) (*AIDefineResult, error) {
	prompt := fmt.Sprintf(`你是一位专业的英语词汇教师。单词是 "%s"。

用户用中文给出了自己的理解：%s

请仔细判断用户的理解是否正确、完整，并给出学习建议。返回纯JSON（不要任何markdown格式）：
{
  "correct": true 或 false，表示用户理解是否基本正确,
  "judgment": "用中文简明扼要地评价用户的回答，指出对在哪里、错在哪里，30字以内",
  "advice": "用中文给出简短具体的学习建议，如：这个单词的核心含义是...，建议...，60字以内"
}`, wordStr, userAnswer)

	body, _ := json.Marshal(map[string]interface{}{
		"model": modelName,
		"messages": []map[string]string{
			{"role": "system", "content": "你是一位专业的英语词汇教师，评分严格，语言简洁犀利。始终返回纯JSON。"},
			{"role": "user", "content": prompt},
		},
		"max_tokens": 1024,
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

	var r AIDefineResult
	if err := json.Unmarshal([]byte(content), &r); err != nil {
		return nil, fmt.Errorf("AI returned invalid JSON: %s", content)
	}
	return &r, nil
}
