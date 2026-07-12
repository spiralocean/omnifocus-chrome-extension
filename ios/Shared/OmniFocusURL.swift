import Foundation

/// Swift port of the shared OmniFocus URL-scheme helpers (`src/omnifocus.js`).
/// Keep this in sync with the Chrome/Safari extension so clips behave identically.
enum OmniFocusURL {
    // Keep notes short enough for omnifocus:// URL limits.
    static let noteMaxLength = 1200
    static let nameMaxLength = 500

    /// Mirrors JS `encodeURIComponent` — encodes everything except the
    /// unreserved set A-Za-z0-9 and `- _ . ! ~ * ' ( )`.
    private static let unreserved: CharacterSet = {
        var set = CharacterSet.alphanumerics
        set.insert(charactersIn: "-_.!~*'()")
        return set
    }()

    static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? value
    }

    static func truncate(_ text: String, _ max: Int) -> String {
        guard text.count > max else { return text }
        return String(text.prefix(max - 1)) + "…"
    }

    /// Strip a trailing " - Site name" / " | Site name" suffix, mirroring
    /// `defaultTaskName` in omnifocus.js.
    static func defaultTaskName(_ title: String) -> String {
        let pattern = "\\s*[-|–—]\\s*[^-|–—]+$"
        let cleaned: String
        if let regex = try? NSRegularExpression(pattern: pattern) {
            let range = NSRange(title.startIndex..., in: title)
            cleaned = regex.stringByReplacingMatches(in: title, range: range, withTemplate: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            cleaned = title
        }
        let fallback = cleaned.isEmpty ? (title.isEmpty ? "Untitled" : title) : cleaned
        return truncate(fallback, nameMaxLength)
    }

    /// Best task name from whatever the share gave us. With a page title we
    /// reuse `defaultTaskName`; with only a URL (native-app shares like X) we
    /// fall back to the host rather than dumping the whole URL into the name.
    static func suggestedName(title: String, url: String) -> String {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return defaultTaskName(trimmed) }
        if let host = URL(string: url)?.host {
            let cleaned = host.replacingOccurrences(of: "^www\\.", with: "", options: .regularExpression)
            return truncate(cleaned, nameMaxLength)
        }
        return "Untitled"
    }

    /// Mirrors `formatClipNote`: note is the source URL plus the selection or excerpt.
    static func formatClipNote(title: String, url: String, excerpt: String, selection: String) -> String {
        let body = selection.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            ? excerpt.trimmingCharacters(in: .whitespacesAndNewlines)
            : selection.trimmingCharacters(in: .whitespacesAndNewlines)
        let defaultNote = body.isEmpty ? url : "\(url)\n\n\(body)"
        return truncate(defaultNote, noteMaxLength)
    }

    /// Mirrors `buildOmniFocusAddUrl`. `autosave` selects the x-callback path
    /// so the task is added without showing OmniFocus's add UI.
    static func buildAddURL(name: String, note: String, project: String? = nil,
                            tag: String? = nil, flag: Bool = false, autosave: Bool = true) -> URL? {
        var params: [(String, String)] = []

        func add(_ key: String, _ value: String?) {
            guard let value, !value.isEmpty else { return }
            params.append((key, encode(value)))
        }

        add("name", truncate(name, nameMaxLength))
        add("note", truncate(note, noteMaxLength))
        add("project", project)
        add("context", tag)
        if flag { params.append(("flag", "true")) }
        if autosave { params.append(("autosave", "true")) }

        let path = autosave ? "omnifocus://x-callback-url/add" : "omnifocus:///add"
        let query = params.map { "\($0.0)=\($0.1)" }.joined(separator: "&")
        return URL(string: "\(path)?\(query)")
    }
}
