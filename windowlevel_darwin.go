//go:build darwin && !ios

package main

/*
#cgo CFLAGS: -mmacosx-version-min=10.13 -x objective-c
#cgo LDFLAGS: -framework Cocoa -framework CoreGraphics

#import <Cocoa/Cocoa.h>
#import <CoreGraphics/CoreGraphics.h>

// getMouseLocation returns the current mouse position in top-left origin coordinates.
void getMouseLocation(int* x, int* y) {
    NSPoint loc = [NSEvent mouseLocation];
    *x = (int)loc.x;
    CGFloat screenHeight = [[NSScreen mainScreen] frame].size.height;
    *y = (int)(screenHeight - loc.y);
}

// setWidgetHighLevel raises the widget window above fullscreen apps.
void setWidgetHighLevel(void* nsWindow) {
    if (nsWindow == NULL) return;
    NSWindow* win = (NSWindow*)nsWindow;

    // CanJoinAllSpaces(8) | FullScreenAuxiliary(128) | IgnoresCycle(256) = 392
    [win setCollectionBehavior:392];
    [win setLevel:2000];
    [win orderFrontRegardless];

    NSLog(@"setWidgetHighLevel: level=2000 windowNumber=%lu", (unsigned long)win.windowNumber);
}

// setWidgetLevelAsync re-sets level via NSWindowDidBecomeKeyNotification.
void setWidgetLevelAsync(void* nsWindow) {
    if (nsWindow == NULL) return;
    NSWindow* win = (NSWindow*)nsWindow;

    [[NSNotificationCenter defaultCenter] addObserverForName:NSWindowDidBecomeKeyNotification
                                                      object:win
                                                       queue:[NSOperationQueue mainQueue]
                                                  usingBlock:^(NSNotification *note) {
        [win setCollectionBehavior:392];
        [win setLevel:2000];
        [win orderFrontRegardless];
        NSLog(@"setWidgetLevelAsync: level=2000 windowNumber=%lu",
              (unsigned long)win.windowNumber);
    }];
}
*/
import "C"
import "unsafe"

// GetMouseLocation returns the current mouse position in screen coordinates (top-left origin).
func GetMouseLocation() (int, int) {
	var x, y C.int
	C.getMouseLocation(&x, &y)
	return int(x), int(y)
}

// SetWidgetWindowLevelGo calls the C setWidgetHighLevel.
func SetWidgetWindowLevelGo(nsWindowPtr uintptr) {
	if nsWindowPtr != 0 {
		C.setWidgetHighLevel(unsafe.Pointer(nsWindowPtr))
	}
}

// SetWidgetLevelAsyncGo registers for window notifications to set level when visible.
func SetWidgetLevelAsyncGo(nsWindowPtr uintptr) {
	if nsWindowPtr != 0 {
		C.setWidgetLevelAsync(unsafe.Pointer(nsWindowPtr))
	}
}
