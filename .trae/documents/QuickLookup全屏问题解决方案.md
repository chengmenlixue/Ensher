# Quick Lookup 全屏应用唤出问题解决方案

## 问题背景
Quick Lookup 窗口在应用全屏的情况下无法正常唤出，窗口被遮挡。

## 任务目标
修复 Quick Lookup 在全屏应用下无法唤出的问题

## 执行步骤

### 1. 深入分析问题根源
- 检查当前 windowlevel_darwin.go 的实现
- 分析窗口层级设置逻辑是否正确
- 验证 ShowWidget 的调用流程
- 检查是否存在调用时机问题

### 2. 检查窗口创建和显示流程
- 审查 quicklookup.go 中的 ShowWidget 函数
- 验证窗口选项设置
- 检查 NativeWindow() 的调用是否正确
- 分析 InvokeSync 和 InvokeAsync 的执行时序

### 3. 审查 Objective-C 实现
- 检查 setWidgetHighLevel 的 CGO 调用
- 验证 NSWindow setLevel 的参数是否正确
- 检查 collectionBehavior 的设置
- 确认是否需要调整窗口层级值

### 4. 实现解决方案
根据分析结果，可能需要：
- **方案A**: 调整窗口层级值（尝试不同层级如 25, 2000, 3000 等）
- **方案B**: 修改 collectionBehavior 的标志组合
- **方案C**: 改进窗口显示时序，确保层级设置在 Show() 之前完成
- **方案D**: 添加额外的窗口属性设置
- **方案E**: 使用其他macOS API强制置顶窗口

### 5. 代码修改和测试
- 修改相关文件
- 构建应用
- 在全屏应用场景下测试
- 验证修复效果

## 预期输出
- 修复后的代码
- 能够全屏应用下正常唤出的 Quick Lookup 窗口
- 问题解决确认
