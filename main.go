package main

import (
	"embed"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

var app *application.App

// acquireSingleInstanceLock tries to acquire an exclusive file lock.
// Returns the lock file handle on success, or nil if another instance is running.
func acquireSingleInstanceLock() *os.File {
	dir := filepath.Join(os.Getenv("HOME"), ".ensher")
	os.MkdirAll(dir, 0755)
	lockPath := filepath.Join(dir, "ensher.lock")
	f, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil
	}
	err = syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
	if err != nil {
		f.Close()
		return nil
	}
	return f
}

func main() {
	lockFile := acquireSingleInstanceLock()
	if lockFile == nil {
		fmt.Println("Another ensher instance is already running, activating it...")
		exec.Command("osascript", "-e", `tell application "ensher" to activate`).Run()
		os.Exit(0)
	}
	defer lockFile.Close()
	wordService := NewWordService()
	aiService := &AIService{}
	quickLookupService := NewQuickLookupService()
	articleService := NewArticleService()

	app = application.New(application.Options{
		Name:        "ensher",
		Description: "English vocabulary builder for daily learning",
		Services: []application.Service{
			application.NewService(wordService),
			application.NewService(aiService),
			application.NewService(quickLookupService),
			application.NewService(articleService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Ensher",
		Width:  960,
		Height: 680,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 40,
			Backdrop:               application.MacBackdropTranslucent,
			TitleBar:               application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(255, 255, 255),
		URL:             "/",
	})

	quickLookupService.SetApp(app)

	err := app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
