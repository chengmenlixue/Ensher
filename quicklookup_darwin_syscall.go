//go:build darwin
// +build darwin

package main

import (
	"fmt"
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
	fnCFRunLoopAddSource           uintptr
	fnCFRunLoopGetCurrent          uintptr
	fnCFRunLoopRun                 uintptr
	fnCFRunLoopStop                uintptr
	fnCFRelease                    uintptr

	kCFRunLoopCommonModes uintptr
	symbolsOnce           sync.Once
	symbolsOK             bool
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

// ─── Constants ─────────────────────────────────────────────────────────

const (
	kCGHIDEventTap                 = 0
	kCGSessionEventTap             = 1
	kCGHeadInsertEventTap          = 0
	kCGEventKeyDown                = 10
	kCGEventFlagsChanged           = 12
	kCGEventTapDisabledByTimeout   = 0xFFFFFFFE
	kCGEventTapDisabledByUserInput = 0xFFFFFFFF
	kCGKeyboardEventKeycode        = 9

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
// CGEventTapCallBack: (CGEventTapProxy, CGEventType, CGEventRef, void*) -> CGEventRef
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

	// Check each required modifier — all must match
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
			fmt.Println("ensher: CGEventTap unavailable — global hotkey disabled")
			fmt.Println("  → Grant Accessibility in System Settings > Privacy & Security > Accessibility")
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

		// CFRunLoopRun blocks until stopped — use quit channel to stop it
		go func() {
			<-quit
			cfRunLoopStopFn(rl)
		}()
		cfRunLoopRunFn()
	}()
	<-quit
}
