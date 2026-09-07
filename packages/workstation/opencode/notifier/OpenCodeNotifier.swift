// OpenCodeNotifier — native macOS notifications for OpenCode with
// click-to-focus support.
//
// Modes:
//   OpenCodeNotifier --post <json>   hand one payload to the daemon (starting it if needed), then exit
//   OpenCodeNotifier --daemon        run as a background accessory app: post banners, handle clicks
//
// Payload (compact, newline-free JSON sent over ~/.cache/opencode-notifier.sock):
//   {
//     "kind": "finished" | "question" | "permission" | "error",
//     "title": "OpenCode",
//     "message": "Session finished",
//     "subtitle": "session title or project name",
//     "sessionID": "ses_...",
//     "directory": "/Users/you/project",
//     "sessionTitle": "..." (optional)
//   }
//
// Notifications use the sessionID as identifier + threadIdentifier so a new
// event for the same session replaces the previous banner. Each kind gets its
// own sound (played via NSSound); the sound map is read at runtime from
// ~/.config/opencode/notifier-sounds.json (written by `bun run workspace:setup`
// from packages/workstation/opencode/sounds.ts), so sounds are configurable
// from one place and a running daemon picks up changes without a rebuild.
//
// On banner click the daemon runs ~/.config/opencode/bin/focus-opencode with
// --kind/--session/--dir/--title so the right VS Code window, the opencode
// terminal editor tab, and the attention session get focused.

import AppKit
import Foundation
import UserNotifications

// MARK: - Socket plumbing

func socketPath() -> String {
    let cache = NSHomeDirectory() + "/.cache"
    try? FileManager.default.createDirectory(atPath: cache, withIntermediateDirectories: true)
    return cache + "/opencode-notifier.sock"
}

func makeAddr(path: String) -> sockaddr_un {
    var addr = sockaddr_un()
    addr.sun_family = sa_family_t(AF_UNIX)
    let bytes = Array(path.utf8).prefix(MemoryLayout.size(ofValue: addr.sun_path) - 1)
    withUnsafeMutableBytes(of: &addr.sun_path) { $0.copyBytes(from: bytes) }
    return addr
}

func connectToDaemon() -> Int32? {
    let fd = socket(AF_UNIX, SOCK_STREAM, 0)
    guard fd >= 0 else { return nil }
    var addr = makeAddr(path: socketPath())
    let result = withUnsafePointer(to: &addr) { ptr -> Int32 in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
            connect(fd, sa, socklen_t(MemoryLayout<sockaddr_un>.size))
        }
    }
    guard result == 0 else {
        close(fd)
        return nil
    }
    return fd
}

func sendToDaemon(_ json: String) -> Bool {
    guard let fd = connectToDaemon() else { return false }
    defer { close(fd) }
    var payload = Array((json + "\n").utf8)
    return payload.withUnsafeMutableBytes { raw -> Bool in
        var sent = 0
        while sent < raw.count {
            let n = send(fd, raw.baseAddress!.advanced(by: sent), raw.count - sent, 0)
            guard n > 0 else { return false }
            sent += n
        }
        return true
    }
}

// MARK: - Post mode (CLI)

func runPost(json: String) -> Int32 {
    if sendToDaemon(json) { return 0 }
    // Daemon is down: start it via LaunchServices in the background, then retry.
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/usr/bin/open")
    task.arguments = ["-g", Bundle.main.bundleURL.path, "--args", "--daemon"]
    task.standardOutput = FileHandle.nullDevice
    task.standardError = FileHandle.nullDevice
    try? task.run()
    for _ in 0..<50 {
        if sendToDaemon(json) { return 0 }
        usleep(100_000)
    }
    return 1
}

// MARK: - Daemon mode

let notifierDelegate = NotifierDelegate()

final class NotifierDelegate: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        // The per-kind sound is played separately via NSSound, so the
        // notification itself is silent (no default double-chime).
        completionHandler([.banner])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        DispatchQueue.global(qos: .userInitiated).async {
            runFocusScript(userInfo: info)
            completionHandler()
        }
    }
}

func stringField(_ info: [AnyHashable: Any], _ key: String) -> String? {
    guard let value = info[key] as? String, !value.isEmpty else { return nil }
    return value
}

func runFocusScript(userInfo info: [AnyHashable: Any]) {
    let script = NSHomeDirectory() + "/.config/opencode/bin/focus-opencode"
    guard FileManager.default.fileExists(atPath: script) else { return }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/bash")
    var arguments = [script]
    for (flag, key) in [("--kind", "kind"), ("--session", "sessionID"), ("--dir", "directory"), ("--title", "sessionTitle")] {
        if let value = stringField(info, key) { arguments += [flag, value] }
    }
    task.arguments = arguments
    task.standardOutput = FileHandle.nullDevice
    task.standardError = FileHandle.nullDevice
    do {
        try task.run()
        task.waitUntilExit()
    } catch {
        return
    }
}

// MARK: - Notification sounds

// The per-kind sound map is read at runtime from ~/.config/opencode/notifier-sounds.json,
// which `bun run workspace:setup` writes from the central config
// (packages/workstation/opencode/sounds.ts). Reading it per notification keeps a
// running daemon in sync when the config changes, and lets sounds be configured
// from one place without rebuilding the app. A missing or unreadable config
// falls back to a calm default sound.
let DEFAULT_SOUND = "Tink"

func loadSoundMap() -> [String: String] {
    let path = NSHomeDirectory() + "/.config/opencode/notifier-sounds.json"
    guard
        let data = FileManager.default.contents(atPath: path),
        let object = try? JSONSerialization.jsonObject(with: data),
        let map = object as? [String: String]
    else { return [:] }
    return map
}

func soundName(forKind kind: String?) -> String {
    guard let kind else { return DEFAULT_SOUND }
    return loadSoundMap()[kind] ?? DEFAULT_SOUND
}

// Play the per-kind sound. Loads a fresh instance from the system sound file
// (not the cached NSSound(named:) shared instance) so rapid successive
// notifications always re-trigger. Fire-and-forget; never throws.
func playSound(forKind kind: String?) {
    let name = soundName(forKind: kind)
    let url = URL(fileURLWithPath: "/System/Library/Sounds/\(name).aiff")
    guard let sound = NSSound(contentsOf: url, byReference: true) else { return }
    sound.play()
}

func postNotification(_ fields: [String: Any]) {
    let content = UNMutableNotificationContent()
    content.title = (fields["title"] as? String) ?? "OpenCode"
    content.body = (fields["message"] as? String) ?? ""
    if let subtitle = fields["subtitle"] as? String, !subtitle.isEmpty { content.subtitle = subtitle }
    // Keep the notification silent; the per-kind sound is played by NSSound so
    // the banner and the sound are decoupled and never conflict.
    content.sound = nil
    let sessionID = (fields["sessionID"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "opencode"
    content.threadIdentifier = sessionID
    content.userInfo = fields
    let request = UNNotificationRequest(identifier: "opencode-" + sessionID, content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request)
    playSound(forKind: fields["kind"] as? String)
}

func handleClient(fd: Int32) {
    defer { close(fd) }
    var buffer: [UInt8] = []
    var chunk = [UInt8](repeating: 0, count: 65536)
    while true {
        let n = recv(fd, &chunk, chunk.count, 0)
        guard n > 0 else { return }
        buffer.append(contentsOf: chunk[0..<n])
        if let newline = buffer.firstIndex(of: 10) {
            let data = Data(buffer[buffer.startIndex..<newline])
            if
                let object = try? JSONSerialization.jsonObject(with: data),
                let fields = object as? [String: Any]
            {
                postNotification(fields)
            }
            return
        }
    }
}

func acceptLoop(serverFD: Int32) {
    while true {
        let clientFD = accept(serverFD, nil, nil)
        if clientFD < 0 {
            usleep(50_000)
            continue
        }
        DispatchQueue.global().async { handleClient(fd: clientFD) }
    }
}

func runDaemon() -> Int32 {
    if connectToDaemon() != nil { return 0 } // another daemon is already up
    try? FileManager.default.removeItem(atPath: socketPath()) // stale socket

    let serverFD = socket(AF_UNIX, SOCK_STREAM, 0)
    guard serverFD >= 0 else { return 1 }
    var addr = makeAddr(path: socketPath())
    let bindResult = withUnsafePointer(to: &addr) { ptr -> Int32 in
        ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) { sa in
            bind(serverFD, sa, socklen_t(MemoryLayout<sockaddr_un>.size))
        }
    }
    guard bindResult == 0, listen(serverFD, 16) == 0 else {
        close(serverFD)
        return 1
    }

    let center = UNUserNotificationCenter.current()
    center.delegate = notifierDelegate
    center.requestAuthorization(options: [.alert, .sound]) { _, _ in }

    DispatchQueue.global().async { acceptLoop(serverFD: serverFD) }
    dispatchMain() // never returns
}

// MARK: - Entry point

let arguments = CommandLine.arguments
if arguments.contains("--daemon") {
    exit(runDaemon())
}
if let index = arguments.firstIndex(of: "--post"), index + 1 < arguments.count {
    exit(runPost(json: arguments[index + 1]))
}
FileHandle.standardError.write(Data("usage: OpenCodeNotifier --post <json> | --daemon\n".utf8))
exit(1)