import Foundation

/// Hand-off channel between the Share extension and the containing app.
///
/// A Share extension can't reliably open a third-party URL scheme like
/// `omnifocus://` on modern iOS, so instead it writes the built OmniFocus URL
/// into the shared App Group and asks the app to flush it. The app *can* open
/// arbitrary schemes, so it drains the queue and opens each clip in OmniFocus.
///
/// The queue is the source of truth: even if the hand-off launch is refused by
/// the system, the clip survives and flushes the next time the app is opened.
enum ClipStore {
    /// Must match the App Group entitlement on both targets (see project.yml).
    static let appGroupID = "group.com.spiralocean.cliptoomnifocus"

    /// Custom scheme the extension uses to wake the containing app.
    static let appURLScheme = "cliptoomnifocus"

    private static let queueKey = "pendingClips"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupID)
    }

    /// Append an `omnifocus://` URL to the pending queue.
    static func enqueue(_ omniFocusURL: String) {
        guard let defaults else { return }
        var queue = defaults.stringArray(forKey: queueKey) ?? []
        queue.append(omniFocusURL)
        defaults.set(queue, forKey: queueKey)
    }

    /// Remove and return the oldest pending clip, leaving the rest queued.
    ///
    /// One-at-a-time so that opening a clip (which backgrounds the app) never
    /// drops the clips still waiting behind it.
    static func dequeue() -> String? {
        guard let defaults else { return nil }
        var queue = defaults.stringArray(forKey: queueKey) ?? []
        guard !queue.isEmpty else { return nil }
        let next = queue.removeFirst()
        defaults.set(queue, forKey: queueKey)
        return next
    }

    /// Non-destructive peek at the queued clips (for the app's status UI).
    static func pending() -> [String] {
        defaults?.stringArray(forKey: queueKey) ?? []
    }

    // MARK: - Diagnostic event log (shared across extension + app)

    private static let logKey = "eventLog"

    static func logEvent(_ message: String) {
        guard let defaults else { return }
        var log = defaults.stringArray(forKey: logKey) ?? []
        log.append("\(Date().formatted(date: .omitted, time: .standard))  \(message)")
        if log.count > 30 { log.removeFirst(log.count - 30) }
        defaults.set(log, forKey: logKey)
    }

    static func events() -> [String] { defaults?.stringArray(forKey: logKey) ?? [] }

    static func clearEvents() { defaults?.removeObject(forKey: logKey) }

    /// URL that wakes the containing app to flush the queue.
    static var handoffURL: URL? { URL(string: "\(appURLScheme)://clip") }
}
