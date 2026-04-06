//go:build darwin

package main

import (
	"fmt"
	"sync"
	"unsafe"

	"github.com/ebitengine/purego"
)

// ─── AppKit / ObjC runtime (for window level manipulation) ──────────────

var (
	appkitHandle uintptr
	objcHandle   uintptr

	fnObjcMsgSend     uintptr
	fnSelGetUid       uintptr
	fnSelRegisterName uintptr
	fnObjcGetClass    uintptr

	appkitOnce sync.Once
	appkitOK   bool
)

const (
	rtldLazy   = 0x1
	rtldGlobal = 0x8
)

func dlsym(handle uintptr, name string) uintptr {
	ptr, err := purego.Dlsym(handle, name)
	if err != nil || ptr == 0 {
		fmt.Printf("ensher: dlsym(%s): %v\n", name, err)
		return 0
	}
	return ptr
}

func loadAppKit() {
	appkitOnce.Do(func() {
		paths := []string{
			"/System/Library/Frameworks/AppKit.framework/Versions/C/AppKit",
			"/System/Library/Frameworks/AppKit.framework/Versions/Current/AppKit",
			"/System/Library/Frameworks/AppKit.framework/AppKit",
		}
		var err error
		for _, path := range paths {
			appkitHandle, err = purego.Dlopen(path, rtldLazy|rtldGlobal)
			if err == nil {
				fmt.Printf("ensher: AppKit loaded from %s\n", path)
				break
			}
		}
		if appkitHandle == 0 {
			fmt.Printf("ensher: AppKit load failed: %v\n", err)
			return
		}

		objcPaths := []string{
			"/usr/lib/libobjc.A.dylib",
			"/usr/lib/libobjc.dylib",
		}
		for _, path := range objcPaths {
			objcHandle, err = purego.Dlopen(path, rtldLazy|rtldGlobal)
			if err == nil {
				break
			}
		}
		if objcHandle == 0 {
			fmt.Printf("ensher: libobjc load failed: %v\n", err)
			return
		}

		fnSelGetUid = dlsym(objcHandle, "sel_getUid")
		fnSelRegisterName = dlsym(objcHandle, "sel_registerName")
		fnObjcGetClass = dlsym(objcHandle, "objc_getClass")
		fnObjcMsgSend = dlsym(objcHandle, "objc_msgSend")

		appkitOK = fnObjcMsgSend != 0 && (fnSelGetUid != 0 || fnSelRegisterName != 0) && fnObjcGetClass != 0
		fmt.Printf("ensher: AppKit/ObjC OK: %v\n", appkitOK)
	})
}

func sel(name string) uintptr {
	cs := append([]byte(name), 0)
	if fnSelGetUid != 0 {
		ret, _, _ := purego.SyscallN(fnSelGetUid, uintptr(unsafe.Pointer(&cs[0])))
		return ret
	}
	if fnSelRegisterName != 0 {
		ret, _, _ := purego.SyscallN(fnSelRegisterName, uintptr(unsafe.Pointer(&cs[0])))
		return ret
	}
	return 0
}

// RaiseWidgetAboveFullscreen sets the NSWindow level so it floats above
// fullscreen applications. Must be called from the main thread, before the window is shown.
func RaiseWidgetAboveFullscreen(nsWindowPtr uintptr) {
	if nsWindowPtr == 0 {
		return
	}
	SetWidgetWindowLevelGo(nsWindowPtr)
}

// RaiseWidgetLevelAsync registers for window notifications to push level after window becomes visible.
func RaiseWidgetLevelAsync(nsWindowPtr uintptr) {
	if nsWindowPtr == 0 {
		return
	}
	SetWidgetLevelAsyncGo(nsWindowPtr)
}
