//go:build darwin

package main

import (
	"fmt"
	"os/exec"
	"runtime"
	"sync"
	"unsafe"

	"github.com/ebitengine/purego"
)

// ─── Framework handles ──────────────────────────────────────────────────

var (
	cgHandle uintptr
	cfHandle uintptr
)

const (
	rtldLazy   = 0x1
	rtldGlobal = 0x8
)

func loadFrameworks() {
	var err error
	cgHandle, err = purego.Dlopen(
		"/System/Library/Frameworks/CoreGraphics.framework/Versions/A/CoreGraphics",
		rtldLazy|rtldGlobal,
	)
	if err != nil {
		fmt.Println("ensher: CoreGraphics load failed:", err)
		return
	}
	cfHandle, err = purego.Dlopen(
		"/System/Library/Frameworks/CoreFoundation.framework/Versions/A/CoreFoundation",
		rtldLazy|rtldGlobal,
	)
	if err != nil {
		fmt.Println("ensher: CoreFoundation load failed:", err)
		return
	}
}

func dlsym(handle uintptr, name string) uintptr {
	ptr, err := purego.Dlsym(handle, name)
	if err != nil || ptr == 0 {
		fmt.Printf("ensher: dlsym(%s): %v\n", name, err)
		return 0
	}
	return ptr
}

// ─── Symbol cache ──────────────────────────────────────────────────────

var (
	fnCGEventTapCreate             uintptr
	fnCGEventTapEnable             uintptr
	fnCGEventGetIntegerValueField  uintptr
	fnCGEventGetFlags              uintptr
	fnCFMachPortCreateRunLoopSource uintptr
	fnCFRunLoopAddSource          uintptr
	fnCFRunLoopGetCurrent         uintptr
	fnCFRunLoopRun                uintptr
	fnCFRunLoopStop               uintptr
	fnCFRelease                   uintptr

	kCFRunLoopCommonModes uintptr
	symbolsOnce          sync.Once
	symbolsOK            bool
)

func loadSymbols() {
	symbolsOnce.Do(func() {
		loadFrameworks()
		if cgHandle == 0 || cfHandle == 0 {
			fmt.Println("ensher: failed to load frameworks")
			return
		}
		fmt.Println("ensher: frameworks loaded OK")

		fnCGEventTapCreate = dlsym(cgHandle, "CGEventTapCreate")
		fnCGEventTapEnable = dlsym(cgHandle, "CGEventTapEnable")
		fnCGEventGetIntegerValueField = dlsym(cgHandle, "CGEventGetIntegerValueField")
		fnCGEventGetFlags = dlsym(cgHandle, "CGEventGetFlags")

		fnCFMachPortCreateRunLoopSource = dlsym(cfHandle, "CFMachPortCreateRunLoopSource")
		fnCFRunLoopAddSource = dlsym(cfHandle, "CFRunLoopAddSource")
		fnCFRunLoopGetCurrent = dlsym(cfHandle, "CFRunLoopGetCurrent")
		fnCFRunLoopRun = dlsym(cfHandle, "CFRunLoopRun")
		fnCFRunLoopStop = dlsym(cfHandle, "CFRunLoopStop")
		fnCFRelease = dlsym(cfHandle, "CFRelease")

		// kCFRunLoopCommonModes is a CFStringRef — dereference the symbol pointer
		p := dlsym(cfHandle, "kCFRunLoopCommonModes")
		if p != 0 {
			kCFRunLoopCommonModes = *(*uintptr)(unsafe.Pointer(p))
		}

		symbolsOK = fnCGEventTapCreate != 0 && fnCFRunLoopRun != 0
		fmt.Printf("ensher: symbolsOK=%v hotkey=%q\n", symbolsOK, theService.hotkey)
	})
}

// ─── Wrapped C calls via purego.SyscallN ────────────────────────────────

func cgEventTapCreateFn(tapLoc, place, options int32, mask uint64, callback, userInfo uintptr) uintptr {
	ret, _, _ := purego.SyscallN(fnCGEventTapCreate,
		uintptr(tapLoc), uintptr(place), uintptr(options),
		uintptr(mask), callback, userInfo)
	return ret
}

func cgEventTapEnableFn(tap uintptr, enable bool) {
	e := uintptr(0)
	if enable {
		e = 1
	}
	purego.SyscallN(fnCGEventTapEnable, tap, e)
}

func cgEventGetIntegerValueFieldFn(event uintptr, field uint32) int64 {
	ret, _, _ := purego.SyscallN(fnCGEventGetIntegerValueField, event, uintptr(field))
	return int64(ret)
}

func cgEventGetFlagsFn(event uintptr) uint64 {
	ret, _, _ := purego.SyscallN(fnCGEventGetFlags, event)
	return uint64(ret)
}

func cfMachPortCreateRunLoopSourceFn(port uintptr) uintptr {
	ret, _, _ := purego.SyscallN(fnCFMachPortCreateRunLoopSource, 0, port, 0)
	return ret
}

func cfRunLoopGetCurrentFn() uintptr {
	ret, _, _ := purego.SyscallN(fnCFRunLoopGetCurrent)
	return ret
}

func cfRunLoopAddSourceFn(rl, source, mode uintptr) {
	purego.SyscallN(fnCFRunLoopAddSource, rl, source, mode)
}

func cfRunLoopRunFn() {
	purego.SyscallN(fnCFRunLoopRun)
}

func cfRunLoopStopFn(rl uintptr) {
	purego.SyscallN(fnCFRunLoopStop, rl)
}

func cfReleaseFn(cf uintptr) {
	purego.SyscallN(fnCFRelease, cf)
}

// ─── AppKit / ObjC runtime ─────────────────────────────────────────────

var (
	appkitHandle uintptr
	objcHandle   uintptr

	fnObjcMsgSend uintptr
	fnSelGetUid  uintptr
	fnSelRegisterName uintptr
	fnObjcGetClass uintptr

	appkitOnce sync.Once
	appkitOK   bool
)

func loadAppKit() {
	appkitOnce.Do(func() {
		// Try multiple possible paths for AppKit (path varies across macOS versions)
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
			fmt.Printf("ensher: AppKit load failed: %v (tried: %v)\n", err, paths)
			return
		}

		// Objective-C runtime
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

		// objc_msgSend is the main ObjC message dispatch
		fnObjcMsgSend = dlsym(objcHandle, "objc_msgSend")

		appkitOK = fnObjcMsgSend != 0 && (fnSelGetUid != 0 || fnSelRegisterName != 0) && fnObjcGetClass != 0
		fmt.Printf("ensher: AppKit/ObjC OK: %v (msgSend=%x sel=%x getClass=%x)\n",
			appkitOK, fnObjcMsgSend, fnSelGetUid, fnObjcGetClass)
	})
}

// sel returns the SEL for a given selector name, using a temporary C string allocation.
func sel(name string) uintptr {
	// Build a null-terminated C string on the stack
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
		fmt.Println("ensher: RaiseWidgetAboveFullscreen: nil pointer")
		return
	}
	SetWidgetWindowLevelGo(nsWindowPtr)
	fmt.Printf("ensher: RaiseWidgetAboveFullscreen done for 0x%x\n", nsWindowPtr)
}

// RaiseWidgetLevelAsync registers for window notifications to push level after window becomes visible.
func RaiseWidgetLevelAsync(nsWindowPtr uintptr) {
	if nsWindowPtr == 0 {
		return
	}
	SetWidgetLevelAsyncGo(nsWindowPtr)
	fmt.Printf("ensher: RaiseWidgetLevelAsync registered for 0x%x\n", nsWindowPtr)
}

// ─── Constants ─────────────────────────────────────────────────────────

const (
	kCGHIDEventTap                 = 0
	kCGSessionEventTap              = 1
	kCGHeadInsertEventTap           = 0
	kCGEventKeyDown                = 10
	kCGEventFlagsChanged            = 12
	kCGEventTapDisabledByTimeout    = 0xFFFFFFFE
	kCGEventTapDisabledByUserInput  = 0xFFFFFFFF
	kCGKeyboardEventKeycode         = 9

	// CGEventFlags bit positions
	flagCtrl  = 1 << 18
	flagShift = 1 << 17
	flagAlt   = 1 << 19
	flagCmd   = 1 << 20
)

// ─── Event tap callback ────────────────────────────────────────────────

var eventTapCallbackPtr uintptr

func setupCallback() {
	eventTapCallbackPtr = purego.NewCallback(eventTapHandler)
	fmt.Printf("ensher: callback ptr = 0x%x\n", eventTapCallbackPtr)
}

// eventTapHandler — all params uintptr to match purego.NewCallback ABI.
func eventTapHandler(proxy uintptr, eventType uintptr, event uintptr, refcon uintptr) uintptr {
	if eventType == kCGEventTapDisabledByTimeout || eventType == kCGEventTapDisabledByUserInput {
		return event
	}
	if eventType != kCGEventKeyDown && eventType != kCGEventFlagsChanged {
		return event
	}

	if theService == nil || !theService.hotkeyEnabled.Load() {
		return event
	}

	hs := parseHotkeyState(theService.hotkey)
	if hs == nil {
		return event
	}

	flags := cgEventGetFlagsFn(event)

	if hs.ctrl && (flags&flagCtrl) == 0 {
		return event
	}
	if hs.cmd && (flags&flagCmd) == 0 {
		return event
	}
	if hs.shift && (flags&flagShift) == 0 {
		return event
	}
	if hs.alt && (flags&flagAlt) == 0 {
		return event
	}

	if eventType == kCGEventKeyDown {
		keyCode := cgEventGetIntegerValueFieldFn(event, kCGKeyboardEventKeycode)
		if int(keyCode) == hs.keyCode {
			fmt.Printf("ensher: hotkey matched! keyCode=%d\n", keyCode)
			go func() {
				if theService != nil {
					theService.ShowWidget()
				}
			}()
			return 0 // consume the event
		}
	}

	return event
}

// ─── Open Accessibility Settings ─────────────────────────────────────────

func openAccessibilitySettings() {
	exec.Command("open", "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility").Run()
}

// ─── registerGlobalHotkeyImpl (purego, no CGO) ────────────────────────

func registerGlobalHotkeyImpl(quit <-chan struct{}) {
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()

		loadSymbols()
		if !symbolsOK {
			fmt.Println("ensher: failed to load CoreGraphics/CoreFoundation symbols")
			return
		}
		setupCallback()

		// Event mask: KeyDown + FlagsChanged
		mask := uint64(1<<kCGEventKeyDown) | uint64(1<<kCGEventFlagsChanged)

		// Try HID event tap, then session tap
		tap := cgEventTapCreateFn(kCGHIDEventTap, kCGHeadInsertEventTap, 0, mask, eventTapCallbackPtr, 0)
		fmt.Printf("ensher: HID tap = 0x%x\n", tap)
		if tap == 0 {
			tap = cgEventTapCreateFn(kCGSessionEventTap, kCGHeadInsertEventTap, 0, mask, eventTapCallbackPtr, 0)
			fmt.Printf("ensher: session tap = 0x%x\n", tap)
		}
		if tap == 0 {
			fmt.Println("ensher: CGEventTap unavailable — global hotkey needs Accessibility permission")
			fmt.Println("  → Opening System Settings > Privacy & Security > Accessibility")
			go openAccessibilitySettings()
			return
		}

		src := cfMachPortCreateRunLoopSourceFn(tap)
		if src == 0 {
			cfReleaseFn(tap)
			fmt.Println("ensher: CFMachPortCreateRunLoopSource failed")
			return
		}

		rl := cfRunLoopGetCurrentFn()
		cfRunLoopAddSourceFn(rl, src, kCFRunLoopCommonModes)
		cgEventTapEnableFn(tap, true)

		fmt.Println("ensher: global hotkey tap active")

		go func() {
			<-quit
			cfRunLoopStopFn(rl)
		}()
		cfRunLoopRunFn()
	}()
	<-quit
}
