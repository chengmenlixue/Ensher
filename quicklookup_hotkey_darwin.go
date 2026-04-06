//go:build darwin

package main

/*
#cgo CFLAGS: -mmacosx-version-min=10.13 -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework CoreFoundation

#import <Cocoa/Cocoa.h>
#include <stdio.h>

// Hotkey configuration set from Go
static int g_altReq = 0;
static int g_cmdReq = 0;
static int g_ctrlReq = 0;
static int g_shiftReq = 0;
static int g_keyCode = 0;
static int g_enabled = 0;

// Monitor handles
static id g_globalMonitor = nil;
static id g_localMonitor = nil;

// Forward declaration — implemented in Go
extern void hotkeyFired();

static void checkKeyEvent(NSEvent *event) {
	if (!g_enabled) return;

	NSUInteger flags = [event modifierFlags];
	unsigned short kc = [event keyCode];

	static int dbgCount = 0;
	dbgCount++;
	if (dbgCount <= 10) {
		printf("ensher: keyEvent kc=%u flags=0x%lx alt=%d cmd=%d ctrl=%d shift=%d targetKC=%d\n",
			(unsigned)kc, (unsigned long)flags,
			!!(flags & NSEventModifierFlagOption),
			!!(flags & NSEventModifierFlagCommand),
			!!(flags & NSEventModifierFlagControl),
			!!(flags & NSEventModifierFlagShift),
			g_keyCode);
	}

	if (g_altReq && !(flags & NSEventModifierFlagOption))   return;
	if (g_cmdReq && !(flags & NSEventModifierFlagCommand))  return;
	if (g_ctrlReq && !(flags & NSEventModifierFlagControl)) return;
	if (g_shiftReq && !(flags & NSEventModifierFlagShift))  return;

	if ((int)kc == g_keyCode) {
		printf("ensher: hotkey matched! kc=%u\n", (unsigned)kc);
		hotkeyFired();
	}
}

static void cStartMonitor() {
	dispatch_async(dispatch_get_main_queue(), ^{
		// Global monitor: catches events when app is NOT focused
		g_globalMonitor = [[NSEvent addGlobalMonitorForEventsMatchingMask:NSEventMaskKeyDown
			handler:^(NSEvent *event) {
				checkKeyEvent(event);
			}] retain];

		// Local monitor: catches events when app IS focused
		g_localMonitor = [[NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
			handler:^NSEvent *(NSEvent *event) {
				checkKeyEvent(event);
				return event;
			}] retain];

		if (g_globalMonitor) {
			printf("ensher: NSEvent global monitor active\n");
		} else {
			printf("ensher: NSEvent global monitor FAILED\n");
		}
		if (g_localMonitor) {
			printf("ensher: NSEvent local monitor active\n");
		} else {
			printf("ensher: NSEvent local monitor FAILED\n");
		}
	});
}

static void cStopMonitor() {
	dispatch_async(dispatch_get_main_queue(), ^{
		if (g_globalMonitor) {
			[NSEvent removeMonitor:g_globalMonitor];
			[g_globalMonitor release];
			g_globalMonitor = nil;
			printf("ensher: NSEvent global monitor removed\n");
		}
		if (g_localMonitor) {
			[NSEvent removeMonitor:g_localMonitor];
			[g_localMonitor release];
			g_localMonitor = nil;
			printf("ensher: NSEvent local monitor removed\n");
		}
	});
}

static void cSetHotkeyConfig(int alt, int cmd, int ctrl, int shift, int keyCode, int enabled) {
	g_altReq = alt;
	g_cmdReq = cmd;
	g_ctrlReq = ctrl;
	g_shiftReq = shift;
	g_keyCode = keyCode;
	g_enabled = enabled;
	printf("ensher: config set alt=%d cmd=%d ctrl=%d shift=%d kc=%d enabled=%d\n",
		alt, cmd, ctrl, shift, keyCode, enabled);
}
*/
import "C"

import (
	"fmt"
	"os/exec"
)

//export hotkeyFired
func hotkeyFired() {
	fmt.Println("ensher: hotkey matched! (NSEvent)")
	if theService != nil {
		go theService.ShowWidget()
	}
}

func openAccessibilitySettings() {
	exec.Command("open", "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility").Run()
}

func registerGlobalHotkeyImpl(quit <-chan struct{}) {
	hs := parseHotkeyState(theService.hotkey)
	if hs == nil {
		fmt.Println("ensher: failed to parse hotkey")
		return
	}

	var alt, cmd, ctrl, shift C.int
	if hs.alt { alt = 1 }
	if hs.cmd { cmd = 1 }
	if hs.ctrl { ctrl = 1 }
	if hs.shift { shift = 1 }
	enabled := 0
	if theService.hotkeyEnabled.Load() {
		enabled = 1
	}
	C.cSetHotkeyConfig(alt, cmd, ctrl, shift, C.int(hs.keyCode), C.int(enabled))

	C.cStartMonitor()

	<-quit

	C.cStopMonitor()
}
