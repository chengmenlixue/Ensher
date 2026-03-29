package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// QuickLookupService manages the floating widget and global hotkey.
type QuickLookupService struct {
	app           *application.App
	widget        application.Window
	hotkey        string
	hotkeyEnabled atomic.Bool
	quit          chan struct{}
	running       atomic.Bool
	mu            sync.Mutex
}

var theService *QuickLookupService

func quickLookupSettingsPath() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".ensher", "settings.json"), nil
}

func loadQuickLookupSettings() (hotkey string, enabled bool) {
	hotkey = "Alt+0"
	enabled = true
	path, err := quickLookupSettingsPath()
	if err != nil {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var s map[string]interface{}
	if json.Unmarshal(data, &s) != nil {
		return
	}
	if h, ok := s["quickLookupHotkey"].(string); ok && h != "" {
		hotkey = h
	}
	if e, ok := s["quickLookupEnabled"].(bool); ok {
		enabled = e
	}
	return
}

func saveQuickLookupSettings(hotkey string, enabled bool) error {
	path, err := quickLookupSettingsPath()
	if err != nil {
		return err
	}
	data, _ := os.ReadFile(path)
	var settings map[string]interface{}
	if data != nil {
		json.Unmarshal(data, &settings)
	} else {
		settings = make(map[string]interface{})
	}
	settings["quickLookupHotkey"] = hotkey
	settings["quickLookupEnabled"] = enabled
	out, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, out, 0600)
}

// NewQuickLookupService creates the service.
func NewQuickLookupService() *QuickLookupService {
	hk, en := loadQuickLookupSettings()
	s := &QuickLookupService{
		hotkey: hk,
		quit:   make(chan struct{}),
	}
	s.hotkeyEnabled.Store(en)
	return s
}

// SetApp stores the app reference and starts the hotkey monitor.
func (s *QuickLookupService) SetApp(app *application.App) {
	s.app = app
	theService = s
	hk, en := loadQuickLookupSettings()
	s.hotkey = hk
	s.hotkeyEnabled.Store(en)
	go s.registerGlobalHotkey()
}

// ShowWidget creates and shows the floating widget.
func (s *QuickLookupService) ShowWidget() {
	defer func() {
		if r := recover(); r != nil {
			fmt.Println("QuickLookup: panic in ShowWidget:", r)
		}
	}()
	fmt.Println("QuickLookup: ShowWidget called")
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.app == nil {
		fmt.Println("QuickLookup: ERROR s.app is nil")
		return
	}
	if s.app.Window == nil {
		fmt.Println("QuickLookup: ERROR s.app.Window is nil")
		return
	}

	if s.widget != nil {
		fmt.Println("QuickLookup: re-showing existing widget")
		s.widget.Show()
		s.widget.Focus()
		return
	}

	mx, my := s.getMousePosition()
	fmt.Printf("QuickLookup: creating widget at %d,%d\n", mx+24, my-400)

	window := s.app.Window.NewWithOptions(application.WebviewWindowOptions{
		Name:        "quicklookup",
		Title:       "Quick Lookup",
		Width:       400,
		Height:      370,
		X:           mx + 24,
		Y:           my - 400,
		AlwaysOnTop: true,
		Frameless:   true,
		Hidden:      true,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 0,
			Backdrop:               application.MacBackdropTranslucent,
			TitleBar:               application.MacTitleBarHiddenInset,
		},
		URL: "/?window=widget",
	})

	if window == nil {
		fmt.Println("QuickLookup: ERROR window is nil after NewWithOptions")
		return
	}

	s.widget = window
	fmt.Println("QuickLookup: showing and focusing widget")
	window.Show()
	window.Focus()
}

// HideWidget hides and widget.
func (s *QuickLookupService) HideWidget() {
	s.mu.Lock()
	widget := s.widget
	s.widget = nil
	s.mu.Unlock()
	if widget != nil {
		widget.Hide()
	}
}

// GetHotkey returns the current hotkey string.
func (s *QuickLookupService) GetHotkey() string {
	return s.hotkey
}

// GetHotkeyEnabled returns whether the hotkey is enabled.
func (s *QuickLookupService) GetHotkeyEnabled() bool {
	return s.hotkeyEnabled.Load()
}

// SaveHotkey saves the hotkey to settings.
func (s *QuickLookupService) SaveHotkey(hotkey string, enabled bool) error {
	s.hotkey = hotkey
	s.hotkeyEnabled.Store(enabled)
	return saveQuickLookupSettings(hotkey, enabled)
}

// WailsShutdown cleans up resources.
func (s *QuickLookupService) WailsShutdown() {
	close(s.quit)
}

// registerGlobalHotkey starts the global hotkey monitor.
func (s *QuickLookupService) registerGlobalHotkey() {
	if !s.running.CompareAndSwap(false, true) {
		return
	}
	go registerGlobalHotkeyImpl(s.quit)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

func (s *QuickLookupService) getMousePosition() (int, int) {
	// Use current window position as fallback (avoids CGEventCreate crash on ARM64)
	type pos struct{ x, y int }
	result := application.InvokeSyncWithResult[pos](func() pos {
		// Default: position near top-right of screen (100, 100)
		// The CGO mouse tracking has issues on ARM64 — use a sane default
		return pos{x: 100, y: 100}
	})
	return result.x, result.y
}

// hotkeyState holds parsed modifiers and keycode.
type hotkeyState struct {
	cmd, ctrl, shift, alt bool
	keyCode              int
}

func parseHotkeyState(accelerator string) *hotkeyState {
	parts := splitAccel(accelerator)
	if len(parts) == 0 {
		return nil
	}
	key := parts[len(parts)-1]
	hs := &hotkeyState{}
	for _, p := range parts[:len(parts)-1] {
		switch p {
		case "CommandOrControl", "CmdOrCtrl", "Super", "Command", "Cmd":
			hs.cmd = true
		case "Control", "Ctrl":
			hs.ctrl = true
		case "Alt", "Option":
			hs.alt = true
		case "Shift":
			hs.shift = true
		}
	}
	hs.keyCode = keyNameToKeyCode(key)
	return hs
}

func splitAccel(s string) []string {
	var result []string
	start := 0
	for i := 0; i <= len(s)-1; i++ {
		if s[i] == '+' {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	result = append(result, s[start:])
	return result
}

func keyNameToKeyCode(name string) int {
	m := map[string]int{
		"A": 0x00, "B": 0x0B, "C": 0x08, "D": 0x02, "E": 0x0E,
		"F": 0x03, "G": 0x05, "H": 0x04, "I": 0x22, "J": 0x26,
		"K": 0x28, "L": 0x25, "M": 0x2E, "N": 0x2D, "O": 0x1F,
		"P": 0x23, "Q": 0x0C, "R": 0x0F, "S": 0x01, "T": 0x11,
		"U": 0x20, "V": 0x09, "W": 0x0D, "X": 0x07, "Y": 0x10, "Z": 0x06,
		"0": 0x1D, "1": 0x12, "2": 0x13, "3": 0x14, "4": 0x15,
		"5": 0x17, "6": 0x16, "7": 0x1A, "8": 0x1C, "9": 0x19,
		"Space": 0x31, "Return": 0x24, "Tab": 0x30,
		"Escape": 0x35, "Backspace": 0x33,
		"Delete": 0x75,
		"Up": 0x7E, "Down": 0x7D, "Left": 0x7B, "Right": 0x7C,
		"F1": 0x7A, "F2": 0x78, "F3": 0x63, "F4": 0x60,
		"F5": 0x61, "F6": 0x62, "F7": 0x64, "F8": 0x65,
		"F9": 0x6D, "F10": 0x67, "F11": 0x6F, "F12": 0x60,
	}
	if c, ok := m[name]; ok {
		return c
	}
	return 0
}
